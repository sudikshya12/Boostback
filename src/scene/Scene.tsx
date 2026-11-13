import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { PRESETS } from '../sim';
import { audio } from '../game/audio';
import { runtime } from '../game/runtime';
import { useGame } from '../game/store';
import { Booster } from './Booster';
import { CameraRig, type CameraMode } from './CameraRig';
import { Effects } from './Effects';
import { Ghost } from './Ghost';
import { Overlays } from './Overlays';
import { Platform } from './Platform';
import { World } from './World';

/** Advances the game runtime once per rendered frame, before anything reads it. */
function RuntimeDriver() {
  useFrame((_, dt) => {
    runtime.update(dt);
    const v = runtime.view;
    const live = runtime.mode === 'flying' || (runtime.mode === 'replay' && runtime.replay?.playing);
    if (live && !v.outcome) audio.setEngine(v.fuel > 0 ? v.throttle : 0, v.rcs);
    else audio.setEngine(0, 0);
  }, -2);
  return null;
}

export function Scene({ reducedMotion }: { reducedMotion: boolean }) {
  const phase = useGame((s) => s.phase);
  const quality = useGame((s) => s.settings.quality);
  const replayCamera = useGame((s) => s.replayCamera);
  const overlays = useGame((s) => s.overlays);
  const difficulty = useGame((s) => s.settings.difficulty);
  const replayRec = phase === 'replay' ? runtime.replay?.rec ?? null : null;
  // Platform markings follow the scenario being shown (a replay may be of another preset).
  const scenario = replayRec ? PRESETS[replayRec.scenarioId] : PRESETS[difficulty];

  const mode: CameraMode =
    phase === 'ready' || phase === 'tutorial'
      ? 'hero'
      : phase === 'replay'
        ? replayCamera === 'cinematic'
          ? 'replayCinematic'
          : 'replaySide'
        : 'play';

  const dpr = useMemo<[number, number]>(
    () => (quality === 'low' ? [1, 1] : quality === 'medium' ? [1, 1.5] : [1, 2]),
    [quality],
  );
  const budget = quality === 'low' ? 120 : quality === 'medium' ? 240 : 380;

  return (
    <Canvas
      dpr={dpr}
      shadows={quality !== 'low' ? 'soft' : false}
      camera={{ fov: 30, near: 1, far: 40000, position: [0, 300, 2000] }}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;
      }}
      aria-hidden="true"
    >
      <RuntimeDriver />
      <World quality={quality} />
      <Platform scenario={scenario} />
      <Booster view={runtime.view} reducedMotion={reducedMotion} />
      <Ghost />
      <Effects budget={budget} reducedMotion={reducedMotion} />
      {replayRec && <Overlays rec={replayRec} show={overlays} />}
      <CameraRig mode={mode} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
