import { ChevronLeft, ChevronRight, Footprints } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { runtime } from '../game/runtime';

/** Hold-to-tilt button with pointer capture so a finger sliding off doesn't stick. */
function TiltButton({ dir, label }: { dir: -1 | 1; label: string }) {
  const [active, setActive] = useState(false);
  const release = () => {
    setActive(false);
    runtime.input.setTouchTilt(0);
  };
  return (
    <button
      type="button"
      aria-label={label}
      className={`panel pointer-events-auto size-[72px] rounded-2xl inline-flex items-center justify-center touch-none select-none ${active ? 'bg-white/20 text-ink' : 'text-ink-dim'}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setActive(true);
        runtime.input.setTouchTilt(dir);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {dir < 0 ? <ChevronLeft size={34} /> : <ChevronRight size={34} />}
    </button>
  );
}

/** Vertical throttle slider: dragging sets the throttle command; releasing holds it. */
function ThrottleSlider() {
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const v = runtime.view;
      if (thumb.current) thumb.current.style.bottom = `calc(${v.throttleCmd * 100}% - 14px)`;
      if (fill.current) fill.current.style.transform = `scaleY(${v.throttle})`;
      if (label.current) label.current.textContent = `${Math.round(v.throttle * 100)}%`;
      track.current?.setAttribute('aria-valuenow', String(Math.round(v.throttleCmd * 100)));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const setFromPointer = (clientY: number) => {
    const r = track.current!.getBoundingClientRect();
    const v = 1 - (clientY - r.top) / r.height;
    runtime.input.setTouchThrottle(Math.max(0, Math.min(1, v)));
  };
  const end = () => {
    dragging.current = false;
    runtime.input.setTouchThrottle(null);
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        ref={track}
        role="slider"
        aria-label="Throttle"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={-1}
        className="panel pointer-events-auto relative w-[60px] h-[min(34vh,210px)] rounded-2xl touch-none select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
          setFromPointer(e.clientY);
        }}
        onPointerMove={(e) => dragging.current && setFromPointer(e.clientY)}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
      >
        <div className="absolute inset-x-[25px] inset-y-3 rounded-full bg-white/12 overflow-hidden">
          <div ref={fill} className="absolute inset-0 origin-bottom bg-caution/90" style={{ transform: 'scaleY(0)' }} />
        </div>
        <div className="absolute inset-x-2 top-3 bottom-3">
          <div ref={thumb} className="absolute inset-x-0 h-7 rounded-lg bg-ink/90 shadow-lg" />
        </div>
      </div>
      <span className="text-[11px] uppercase tracking-widest text-ink-faint">
        Thr <span ref={label} className="num text-ink" />
      </span>
    </div>
  );
}

function LegsButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const v = runtime.view;
      const s = v.legs >= 1 ? 'Locked' : v.legsCommanded ? `${Math.round(v.legs * 100)}%` : 'Legs';
      if (text.current && text.current.textContent !== s) text.current.textContent = s;
      if (ref.current) ref.current.dataset.state = v.legs >= 1 ? 'locked' : v.legsCommanded ? 'moving' : 'stowed';
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Deploy landing legs"
      className="panel pointer-events-auto w-[72px] h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 text-[12px] touch-none select-none text-ink data-[state=locked]:text-success data-[state=moving]:text-caution"
      onPointerDown={() => runtime.input.requestLegs()}
    >
      <Footprints size={18} aria-hidden />
      <span ref={text} className="num">Legs</span>
    </button>
  );
}

/** Large touch targets. touch-action: none is applied only to these controls, never the page. */
export function TouchControls() {
  useEffect(() => () => runtime.input.setTouchTilt(0), []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-end justify-between px-3 pb-[max(12px,env(safe-area-inset-bottom))] fade-in">
      <div className="flex gap-3">
        <TiltButton dir={-1} label="Tilt left" />
        <TiltButton dir={1} label="Tilt right" />
      </div>
      <div className="flex items-end gap-3">
        <LegsButton />
        <ThrottleSlider />
      </div>
    </div>
  );
}
