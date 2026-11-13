import { ArrowLeft, Layers, Pause, Play, RotateCcw, SkipBack } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { runtime } from '../game/runtime';
import { useGame, type ReplayOverlays } from '../game/store';
import { chartEvents } from './Charts';
import { Button, IconButton, Segmented } from './primitives';

const OVERLAY_LABELS: Record<keyof ReplayOverlays, string> = {
  path: 'Flight path',
  velocity: 'Velocity direction',
  thrust: 'Thrust direction',
  boundary: 'Target boundary',
};

export function ReplayBar() {
  const playing = useGame((s) => s.replayPlaying);
  const speed = useGame((s) => s.replaySpeed);
  const camera = useGame((s) => s.replayCamera);
  const overlays = useGame((s) => s.overlays);
  const source = useGame((s) => s.replaySource);
  const setPlaying = useGame((s) => s.setReplayPlaying);
  const setSpeed = useGame((s) => s.setReplaySpeed);
  const setCamera = useGame((s) => s.setReplayCamera);
  const toggleOverlay = useGame((s) => s.toggleOverlay);
  const exitReplay = useGame((s) => s.exitReplay);
  const beginFlight = useGame((s) => s.beginFlight);
  const setDifficulty = useGame((s) => s.setDifficulty);
  const [layersOpen, setLayersOpen] = useState(false);
  const range = useRef<HTMLInputElement>(null);
  const timeText = useRef<HTMLSpanElement>(null);
  const replay = runtime.replay;
  const duration = replay?.duration ?? 1;
  const events = replay ? chartEvents(replay.rec.events) : [];

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const r = runtime.replay;
      if (!r) return;
      if (range.current && document.activeElement !== range.current) range.current.value = String(r.time);
      if (timeText.current) timeText.current.textContent = `${r.time.toFixed(1)} / ${r.duration.toFixed(1)} s`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!replay) return null;

  const trySame = () => {
    const id = replay.rec.scenarioId;
    if (useGame.getState().settings.difficulty !== id) setDifficulty(id);
    beginFlight(false);
  };

  return (
    <div className="fixed z-20 inset-x-3 bottom-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[min(880px,calc(100vw-48px))] panel px-4 py-3 rise-in" role="region" aria-label="Replay controls" data-testid="replay-bar">
      <div className="flex items-center gap-2.5">
        <IconButton label={playing ? 'Pause replay' : 'Play replay'} onClick={() => setPlaying(!playing)} data-testid="replay-play">
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </IconButton>
        <IconButton label="Restart replay" onClick={() => { runtime.seekReplay(0); setPlaying(true); }}>
          <SkipBack size={18} />
        </IconButton>
        <div className="relative flex-1 min-w-0 h-11 flex items-center">
          <input
            ref={range}
            type="range"
            min={0}
            max={duration}
            step={0.01}
            defaultValue={0}
            aria-label="Replay time"
            className="bb-range w-full relative z-10 cursor-pointer"
            onInput={(e) => runtime.seekReplay(parseFloat((e.target as HTMLInputElement).value))}
            onPointerDown={() => setPlaying(false)}
            data-testid="replay-scrub"
          />
          {events.map((e, i) => (
            <button
              key={i}
              type="button"
              title={`${e.label} · ${e.t.toFixed(1)} s`}
              aria-label={`Jump to ${e.label} at ${e.t.toFixed(1)} seconds`}
              onClick={() => runtime.seekReplay(e.t)}
              className="absolute top-0 z-20 -translate-x-1/2 w-3 h-3 rounded-full bg-guide/80 border border-black/40 cursor-pointer hover:scale-125 transition-transform"
              style={{ left: `calc(${(e.t / duration) * 100}% * (1 - 16px / 100%) + 8px)` }}
            />
          ))}
        </div>
        <span ref={timeText} className="num text-[13px] text-ink-dim whitespace-nowrap hidden sm:inline" />
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <Segmented<string>
          label="Playback speed"
          size="sm"
          value={String(speed)}
          onChange={(v) => setSpeed(parseFloat(v))}
          options={[
            { value: '0.5', label: '0.5×' },
            { value: '1', label: '1×' },
            { value: '2', label: '2×' },
          ]}
        />
        <Segmented<'side' | 'cinematic'>
          label="Camera"
          size="sm"
          value={camera}
          onChange={setCamera}
          options={[
            { value: 'side', label: 'Side' },
            { value: 'cinematic', label: 'Chase' },
          ]}
        />
        <div className="relative">
          <Button variant="ghost" className="!min-h-9 text-[13px]" aria-expanded={layersOpen} onClick={() => setLayersOpen(!layersOpen)}>
            <Layers size={15} aria-hidden /> Overlays
          </Button>
          {layersOpen && (
            <fieldset className="absolute bottom-11 left-0 panel !bg-panel-solid/95 p-3 flex flex-col gap-1.5 w-52">
              <legend className="sr-only">Replay overlays</legend>
              {(Object.keys(OVERLAY_LABELS) as (keyof ReplayOverlays)[]).map((k) => (
                <label key={k} className="flex items-center gap-2 text-[13.5px] min-h-8 cursor-pointer">
                  <input type="checkbox" checked={overlays[k]} onChange={() => toggleOverlay(k)} className="size-4 accent-[#63d3e6]" />
                  {OVERLAY_LABELS[k]}
                </label>
              ))}
            </fieldset>
          )}
        </div>
        <div className="flex-1" />
        <Button variant="ghost" className="!min-h-9 text-[13px]" onClick={exitReplay} data-testid="replay-back">
          <ArrowLeft size={15} aria-hidden /> {source === 'result' ? 'Result' : 'Menu'}
        </Button>
        <Button variant="secondary" className="!min-h-9 text-[13px]" onClick={trySame}>
          <RotateCcw size={15} aria-hidden /> Try same scenario
        </Button>
      </div>
    </div>
  );
}
