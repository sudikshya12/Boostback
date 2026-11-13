import { AlertTriangle, Info, Navigation, OctagonAlert, Pause, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { descentRisk, GUIDANCE, type GuidanceId } from '../sim';
import { runtime } from '../game/runtime';
import { useGame } from '../game/store';
import { screenProbe } from '../scene/probe';
import { fmt } from './format';
import { IconButton } from './primitives';

const TONE_CLASS = {
  guide: 'text-guide border-guide/40',
  caution: 'text-caution border-caution/45',
  danger: 'text-danger border-danger/50',
} as const;

function MessageIcon({ id }: { id: GuidanceId }) {
  const tone = GUIDANCE[id].tone;
  if (tone === 'danger') return <OctagonAlert size={18} aria-hidden />;
  if (tone === 'caution') return <AlertTriangle size={18} aria-hidden />;
  return <Info size={18} aria-hidden />;
}

/** Off-screen target cue: an arrow at the screen edge pointing toward the deck. */
function TargetCue() {
  const el = useRef<HTMLDivElement>(null);
  const arrow = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const e = el.current;
      if (!e) return;
      const show = screenProbe.ready && !screenProbe.deckOnScreen && runtime.mode !== 'preview';
      e.style.opacity = show ? '1' : '0';
      if (!show) return;
      // Direction from the screen centre toward the deck, clamped to an inset ellipse.
      let dx = screenProbe.deckX;
      let dy = screenProbe.deckY;
      if (screenProbe.deckBehind) {
        dx = -dx;
        dy = -dy;
      }
      const ang = Math.atan2(dy, dx);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const rx = w / 2 - 70;
      const ry = h / 2 - 90;
      const px = w / 2 + Math.cos(ang) * rx;
      const py = h / 2 - Math.sin(ang) * ry;
      e.style.transform = `translate(${px}px, ${py}px)`;
      if (arrow.current) arrow.current.style.transform = `rotate(${-ang + Math.PI / 2}rad)`;
      if (now - last > 120 && label.current) {
        last = now;
        const v = runtime.view;
        label.current.textContent = `${Math.round(Math.hypot(v.x, v.clearance))} m`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={el} className="pointer-events-none fixed left-0 top-0 z-10 transition-opacity duration-300" style={{ opacity: 0 }} aria-hidden>
      <div className="-translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
        <div ref={arrow} className="text-guide drop-shadow">
          <Navigation size={22} fill="currentColor" style={{ transform: 'rotate(0deg)' }} />
        </div>
        <span className="num text-[12px] text-guide bg-black/40 rounded px-1.5 py-0.5">
          Deck <span ref={label} />
        </span>
      </div>
    </div>
  );
}

function Readout({
  label,
  unit,
  valueRef,
  prefixRef,
  children,
}: {
  label: string;
  unit: string;
  valueRef: React.RefObject<HTMLSpanElement | null>;
  prefixRef?: React.RefObject<HTMLSpanElement | null>;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[10.5px] sm:text-[11px] uppercase tracking-[0.1em] sm:tracking-[0.12em] text-ink-faint whitespace-nowrap">{label}</span>
      <span className="num text-[18px] sm:text-[22px] leading-tight text-ink whitespace-nowrap flex items-center gap-0.5 sm:gap-1">
        {prefixRef && <span ref={prefixRef} className="inline-flex w-4 justify-center" />}
        <span ref={valueRef}>–</span>
        <span className="text-[11px] sm:text-[12px] text-ink-faint ml-0.5">{unit}</span>
      </span>
      {children}
    </div>
  );
}

/**
 * Compact flight HUD: four primary readouts, throttle and leg indicators, one
 * contextual message. Values are written straight to the DOM from an animation
 * loop; React only re-renders when the phase or message changes.
 */
export function Hud({ touch, replay = false }: { touch: boolean; replay?: boolean }) {
  const message = useGame((s) => s.message);
  const demo = useGame((s) => s.demo);
  const phase = useGame((s) => s.phase);
  const muted = useGame((s) => s.settings.muted);
  const controlMode = useGame((s) => s.settings.controlMode);
  const updateSettings = useGame((s) => s.updateSettings);
  const pause = useGame((s) => s.pause);
  const autoLegs = runtime.scenario.autoLegsAltitude !== null && !replay;

  const alt = useRef<HTMLSpanElement>(null);
  const vs = useRef<HTMLSpanElement>(null);
  const vsDir = useRef<HTMLSpanElement>(null);
  const fuel = useRef<HTMLSpanElement>(null);
  const fuelBar = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLSpanElement>(null);
  const tiltDir = useRef<HTMLSpanElement>(null);
  const thrFill = useRef<HTMLDivElement>(null);
  const thrCmd = useRef<HTMLDivElement>(null);
  const thrText = useRef<HTMLSpanElement>(null);
  const legsText = useRef<HTMLSpanElement>(null);
  const legsDot = useRef<HTMLSpanElement>(null);
  const ghostTag = useRef<HTMLDivElement>(null);
  const vsBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    let lastDir = '';
    let lastTiltDir = '';
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const v = runtime.view;
      // Bars every frame; numbers ~12 Hz so they stay readable.
      if (thrFill.current) thrFill.current.style.transform = `scaleY(${v.throttle})`;
      if (thrCmd.current) thrCmd.current.style.bottom = `${v.throttleCmd * 100}%`;
      if (fuelBar.current) fuelBar.current.style.transform = `scaleX(${Math.max(0, v.fuelFraction)})`;
      if (now - last < 80) return;
      last = now;
      if (alt.current) alt.current.textContent = fmt.alt(v.clearance);
      if (vs.current) vs.current.textContent = fmt.speed(v.vy);
      const dir = Math.abs(v.vy) < 0.05 ? '' : v.vy < 0 ? 'down' : 'up';
      if (vsDir.current && dir !== lastDir) {
        lastDir = dir;
        vsDir.current.innerHTML = dir === 'down' ? DOWN_SVG : dir === 'up' ? UP_SVG : '';
        vsDir.current.setAttribute('aria-label', dir === 'down' ? 'descending' : dir === 'up' ? 'climbing' : '');
      }
      // Highlight descent speed that is high for the current height (same rule as guidance).
      if (vsBox.current) {
        const risk = runtime.mode === 'flying' ? descentRisk(runtime.sim.state, v.clearance, runtime.scenario) : 'ok';
        vsBox.current.dataset.tone = risk === 'ok' ? '' : risk;
      }
      if (fuel.current) fuel.current.textContent = fmt.pct(v.fuelFraction);
      if (fuelBar.current) fuelBar.current.dataset.low = v.fuelFraction < 0.2 ? 'true' : 'false';
      if (tilt.current) tilt.current.textContent = fmt.deg(v.theta);
      const td = Math.abs(v.theta) < 0.0017 ? '' : v.theta > 0 ? 'R' : 'L';
      if (tiltDir.current && td !== lastTiltDir) {
        lastTiltDir = td;
        tiltDir.current.textContent = td;
      }
      if (thrText.current) thrText.current.textContent = `${Math.round(v.throttle * 100)}%`;
      if (legsText.current && legsDot.current) {
        const state = v.legs >= 1 ? 'Locked' : v.legsCommanded || v.legs > 0 ? `Deploying ${Math.round(v.legs * 100)}%` : 'Stowed';
        legsText.current.textContent = state;
        legsDot.current.dataset.state = v.legs >= 1 ? 'locked' : v.legs > 0 || v.legsCommanded ? 'moving' : 'stowed';
      }
      if (ghostTag.current) ghostTag.current.style.opacity = runtime.ghostVisible ? '1' : '0';
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const msg = message ? GUIDANCE[message] : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 fade-in">
      {/* Primary readouts */}
      <div
        className={`panel pointer-events-auto absolute left-3 top-3 sm:left-5 sm:top-5 grid grid-cols-2 gap-x-4 sm:gap-x-5 gap-y-2 px-3.5 sm:px-4 py-3 sm:w-[300px] ${replay ? 'right-3' : 'right-[112px]'} sm:right-auto`}
        role="group"
        aria-label="Flight readouts"
      >
        <Readout label="Altitude" unit="m" valueRef={alt} />
        <div ref={vsBox} className="data-[tone=danger]:[&_.num]:text-danger data-[tone=brake]:[&_.num]:text-caution">
          <Readout label="Vert. speed" unit="m/s" valueRef={vs} prefixRef={vsDir} />
        </div>
        <Readout label="Fuel" unit="%" valueRef={fuel}>
          <div className="mt-1 h-1 rounded-full bg-white/12 overflow-hidden">
            <div
              ref={fuelBar}
              className="h-full origin-left bg-ink/80 data-[low=true]:bg-caution transition-colors"
              style={{ transform: 'scaleX(1)' }}
            />
          </div>
        </Readout>
        <Readout label="Tilt" unit="°" valueRef={tilt} prefixRef={tiltDir}>
          {!replay && (
            <span className="text-[10.5px] text-guide/90 mt-0.5 whitespace-nowrap">
              {controlMode === 'assisted' ? 'Attitude assist' : 'Direct gimbal'}
            </span>
          )}
        </Readout>
      </div>

      {/* One contextual message, plus mode badges */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[118px] sm:top-5 flex flex-col items-center gap-2 w-[min(92vw,420px)]">
        {demo && !replay && (
          <div className="panel px-3 py-1.5 text-[13px] text-guide border-guide/40">Demo controller flying · same physics and limits</div>
        )}
        {replay && <div className="panel px-3 py-1.5 text-[13px] text-guide tracking-wide">Replay · recorded flight</div>}
        {msg && phase === 'playing' && (
          <div key={message} className={`panel px-4 py-2 flex items-center gap-2 text-[15px] font-medium rise-in ${TONE_CLASS[msg.tone]}`}>
            <MessageIcon id={message!} />
            <span className="text-ink">{msg.text}</span>
          </div>
        )}
        <div ref={ghostTag} className="flex items-center gap-1.5 text-[12px] text-[#cfe6ff]/80 transition-opacity" style={{ opacity: 0 }}>
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#cfe6ff]/40 border border-[#cfe6ff]/60" /> Previous attempt
        </div>
      </div>

      {/* Pause and sound */}
      {!replay && (
        <div className="pointer-events-auto absolute right-3 top-3 sm:right-5 sm:top-5 flex gap-2">
          <IconButton label={muted ? 'Unmute sound' : 'Mute sound'} onClick={() => updateSettings({ muted: !muted })}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </IconButton>
          <IconButton label="Pause (Esc)" onClick={pause}>
            <Pause size={18} />
          </IconButton>
        </div>
      )}

      {/* Throttle and legs (desktop; touch layout has its own slider) */}
      {!touch && (
        <div className={`panel absolute right-5 ${replay ? 'bottom-40' : 'bottom-5'} flex items-end gap-4 px-4 py-3`}>
          <div className="flex flex-col items-center gap-1.5">
            <div className="relative h-28 w-6 flex justify-center" aria-hidden>
              <div className="absolute inset-y-0 w-3 rounded-full bg-white/12 overflow-hidden">
                <div ref={thrFill} className="absolute inset-0 origin-bottom bg-caution/90" style={{ transform: 'scaleY(0)' }} />
              </div>
              <div ref={thrCmd} className="absolute left-0 w-6 h-0.5 -mb-px bg-ink rounded" style={{ bottom: 0 }} />
            </div>
            <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Throttle</span>
            <span ref={thrText} className="num text-[15px]">0%</span>
          </div>
          <div className="flex flex-col gap-1.5 pb-0.5 min-w-[118px]">
            <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Legs</span>
            <span className="flex items-center gap-2 text-[14px]">
              <span
                ref={legsDot}
                className="size-2.5 rounded-full bg-white/30 data-[state=moving]:bg-caution data-[state=locked]:bg-success"
                aria-hidden
              />
              <span ref={legsText} className="num">Stowed</span>
            </span>
            {autoLegs && <span className="text-[11px] text-guide">Auto legs (Training)</span>}
            {!replay && (
              <span className="text-[11.5px] text-ink-faint leading-snug">
                W/S throttle · A/D tilt
                <br />L legs · Esc pause
              </span>
            )}
          </div>
        </div>
      )}
      <TargetCue />
    </div>
  );
}

const DOWN_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';
const UP_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
