import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { GUIDANCE, OUTCOME_DETAIL, OUTCOME_LABEL } from './sim';
import { flightKey } from './game/input';
import { runtime } from './game/runtime';
import { useGame } from './game/store';
import { AboutPanel } from './ui/AboutPanel';
import { Hud } from './ui/Hud';
import { PauseMenu } from './ui/PauseMenu';
import { ReplayBar } from './ui/ReplayBar';
import { ResultPanel } from './ui/ResultPanel';
import { SettingsPanel } from './ui/SettingsPanel';
import { StartScreen } from './ui/StartScreen';
import { TouchControls } from './ui/TouchControls';
import { Tutorial } from './ui/Tutorial';

const Scene = lazy(() => import('./scene/Scene').then((m) => ({ default: m.Scene })));

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function NoWebGL({ detail }: { detail?: string }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-6 bg-gradient-to-b from-[#2d5f94] via-[#9fb3c0] to-[#06253d]">
      <div className="panel max-w-md p-6">
        <h1 className="text-[20px] font-semibold mb-2">Boostback needs WebGL</h1>
        <p className="text-[14.5px] text-ink-dim leading-relaxed">
          The 3D scene couldn't start in this browser. Try enabling hardware acceleration, updating your browser, or
          opening the page on another device.
        </p>
        {detail && <p className="text-[12.5px] text-ink-faint mt-3 num break-words">{detail}</p>}
      </div>
    </div>
  );
}

class SceneBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    return this.state.error ? <NoWebGL detail={this.state.error} /> : this.props.children;
  }
}

function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

/** Keyboard, blur and tab-visibility handling. Held keys are cleared whenever focus is lost. */
function useGlobalInput() {
  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    const down = (e: KeyboardEvent) => {
      const st = useGame.getState();
      if (st.panel || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = flightKey(e.code);
      switch (st.phase) {
        case 'playing':
          if (k) {
            runtime.input.setKey(k, true);
            e.preventDefault();
          } else if (e.code === 'KeyL') runtime.input.requestLegs();
          else if (e.code === 'Escape' || e.code === 'KeyP') {
            e.preventDefault();
            st.pause();
          }
          break;
        case 'paused':
          if (e.code === 'Escape' || e.code === 'KeyP') st.resume();
          break;
        case 'landed':
        case 'failed':
          if (e.code === 'KeyR' && !e.repeat) st.restart();
          break;
        case 'replay':
          if (isField(e.target) && e.code !== 'Escape') return;
          if (e.code === 'Escape') st.exitReplay();
          else if (e.code === 'KeyK' || (e.code === 'Space' && !(e.target instanceof HTMLButtonElement))) {
            e.preventDefault();
            st.setReplayPlaying(!st.replayPlaying);
          }
          break;
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = flightKey(e.code);
      if (k) runtime.input.setKey(k, false);
    };
    const blur = () => runtime.input.clear();
    const vis = () => {
      if (!document.hidden) return;
      runtime.input.clear();
      const st = useGame.getState();
      st.pause();
      if (st.phase === 'replay') st.setReplayPlaying(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
}

/** Polite announcements: guidance messages and results, never per-frame telemetry. */
function LiveRegion() {
  const message = useGame((s) => s.message);
  const phase = useGame((s) => s.phase);
  const rec = useGame((s) => s.lastRecording);
  let text = '';
  if (phase === 'playing' && message) text = GUIDANCE[message].text;
  if ((phase === 'landed' || phase === 'failed') && rec?.report) {
    const r = rec.report;
    text = `${OUTCOME_LABEL[r.outcome]}. ${OUTCOME_DETAIL[r.outcome]} Touchdown speed ${(-r.vy).toFixed(1)} metres per second, ${r.distanceFromCenter.toFixed(1)} metres from centre, ${Math.round(r.fuelFraction * 100)} percent fuel left.`;
  }
  if (phase === 'paused') text = 'Paused.';
  return (
    <div className="sr-only" aria-live="polite" role="status">
      {text}
    </div>
  );
}

export default function App() {
  const phase = useGame((s) => s.phase);
  const panel = useGame((s) => s.panel);
  const settings = useGame((s) => s.settings);
  const toast = useGame((s) => s.toast);
  const demo = useGame((s) => s.demo);
  const attempt = useGame((s) => s.attempt);
  const init = useGame((s) => s.init);
  const webgl = useMemo(hasWebGL, []);
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const coarse = useMediaQuery('(pointer: coarse)');
  const reducedMotion = settings.motion === 'reduce' || (settings.motion === 'system' && systemReduced);
  const touch = settings.touch === 'on' || (settings.touch === 'auto' && coarse);

  useEffect(() => init(), [init]);
  useGlobalInput();

  const flying = phase === 'playing' || phase === 'paused';

  return (
    <div className="fixed inset-0 overflow-hidden" data-reduced-motion={reducedMotion} data-phase={phase}>
      {webgl ? (
        <SceneBoundary>
          <Suspense fallback={<div className="fixed inset-0 bg-gradient-to-b from-[#2d5f94] via-[#c8d5dc] to-[#06253d]" />}>
            <div className="fixed inset-0">
              <Scene reducedMotion={reducedMotion} />
            </div>
          </Suspense>
        </SceneBoundary>
      ) : (
        <NoWebGL />
      )}

      {webgl && (
        <main>
          {(phase === 'ready' || phase === 'tutorial') && <StartScreen />}
          {phase === 'tutorial' && <Tutorial />}
          {flying && (
            <div key={attempt} className="fixed inset-0 z-[5] bg-[#06111c] pointer-events-none curtain" aria-hidden />
          )}
          {flying && <Hud touch={touch} />}
          {flying && touch && !demo && <TouchControls />}
          {phase === 'paused' && !panel && <PauseMenu />}
          {(phase === 'landed' || phase === 'failed') && <ResultPanel />}
          {phase === 'replay' && (
            <>
              <Hud touch={false} replay />
              <ReplayBar />
            </>
          )}
        </main>
      )}
      {panel === 'settings' && <SettingsPanel />}
      {panel === 'about' && <AboutPanel />}
      {toast && (
        <div className="fixed z-50 left-1/2 -translate-x-1/2 bottom-6 panel px-4 py-2 text-[14px] rise-in" role="status">
          {toast}
        </div>
      )}
      <LiveRegion />
    </div>
  );
}
