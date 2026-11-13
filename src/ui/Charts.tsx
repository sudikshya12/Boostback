import type { FlightEvent, Sample } from '../sim';

interface Series {
  key: string;
  label: string;
  color: string;
  get: (s: Sample) => number;
  dashed?: boolean;
}

const EVENT_SHOWN: FlightEvent['type'][] = ['ignition', 'legsCommanded', 'legsAuto', 'legsLocked', 'fuelLow', 'fuelOut', 'touchdown', 'impact'];

export function chartEvents(events: FlightEvent[]) {
  return events.filter((e) => EVENT_SHOWN.includes(e.type));
}

/**
 * Minimal SVG line chart: one or two series over flight time, an optional
 * limit line, and event markers. Accessible via a text summary.
 */
export function LineChart({
  title,
  unit,
  samples,
  series,
  events,
  limit,
  yMin,
  yMax,
  summary,
}: {
  title: string;
  unit: string;
  samples: Sample[];
  series: Series[];
  events: FlightEvent[];
  limit?: { value: number; label: string };
  yMin?: number;
  yMax?: number;
  summary: string;
}) {
  const W = 340;
  const H = 104;
  const padL = 34;
  const padR = 8;
  const padT = 8;
  const padB = 16;
  const t0 = samples[0]?.t ?? 0;
  const t1 = samples[samples.length - 1]?.t ?? 1;
  let lo = yMin ?? Infinity;
  let hi = yMax ?? -Infinity;
  if (yMin === undefined || yMax === undefined) {
    for (const s of samples)
      for (const sr of series) {
        const v = sr.get(s);
        if (yMin === undefined) lo = Math.min(lo, v);
        if (yMax === undefined) hi = Math.max(hi, v);
      }
    if (limit) {
      lo = Math.min(lo, limit.value);
      hi = Math.max(hi, limit.value);
    }
  }
  if (hi - lo < 1e-6) hi = lo + 1;
  const x = (t: number) => padL + ((t - t0) / Math.max(1e-6, t1 - t0)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  // Downsample to ~200 points for drawing.
  const step = Math.max(1, Math.floor(samples.length / 200));
  const pts = samples.filter((_, i) => i % step === 0 || i === samples.length - 1);
  const fmtTick = (v: number) => (Math.abs(hi - lo) >= 20 ? Math.round(v).toString() : v.toFixed(1));

  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="flex items-baseline justify-between text-[12.5px]">
        <span className="text-ink">{title}</span>
        <span className="flex gap-3 text-ink-faint">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ background: s.color, opacity: s.dashed ? 0.7 : 1 }} />
              {s.label}
            </span>
          ))}
          <span>{unit}</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${title}. ${summary}`}>
        {[lo, (lo + hi) / 2, hi].map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.08)" />
            <text x={padL - 5} y={y(v) + 3.5} textAnchor="end" fontSize="9.5" fill="#9a958c" className="num">
              {fmtTick(v)}
            </text>
          </g>
        ))}
        {lo < 0 && hi > 0 && <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.22)" />}
        {limit && (
          <g>
            <line x1={padL} x2={W - padR} y1={y(limit.value)} y2={y(limit.value)} stroke="#f2b155" strokeDasharray="4 3" strokeOpacity="0.8" />
            <text x={padL + 4} y={y(limit.value) + 10} textAnchor="start" fontSize="9" fill="#f2b155">
              {limit.label}
            </text>
          </g>
        )}
        {events.map((e, i) => (
          <g key={i}>
            <line x1={x(e.t)} x2={x(e.t)} y1={padT} y2={H - padB} stroke="rgba(99,211,230,0.45)" strokeDasharray="2 3" />
            <text x={x(e.t)} y={H - 4} fontSize="8.5" fill="#63d3e6" textAnchor="middle">
              {i + 1}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <polyline
            key={s.key}
            fill="none"
            stroke={s.color}
            strokeWidth={1.6}
            strokeDasharray={s.dashed ? '3 3' : undefined}
            strokeLinejoin="round"
            points={pts.map((p) => `${x(p.t).toFixed(1)},${y(s.get(p)).toFixed(1)}`).join(' ')}
          />
        ))}
      </svg>
    </figure>
  );
}
