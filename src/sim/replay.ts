import { DIFFICULTY_ORDER, SIM_VERSION } from './config';
import { lerp } from './math';
import type { Recording, Sample } from './types';

/** Seconds of post-outcome resting pose included at the end of a replay. */
export const REPLAY_TAIL = 2.5;

export function recordingDuration(rec: Recording): number {
  const last = rec.samples[rec.samples.length - 1];
  return last ? last.t : 0;
}

/** Index of the last sample with t <= time (binary search). */
export function sampleIndexAt(samples: Sample[], time: number): number {
  let lo = 0;
  let hi = samples.length - 1;
  if (hi < 0) return -1;
  if (time <= samples[0].t) return 0;
  if (time >= samples[hi].t) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= time) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Interpolated sample at an arbitrary time. Replay reads RECORDED state only —
 * it never re-runs the simulation.
 */
export function sampleAt(samples: Sample[], time: number, out?: Sample): Sample {
  const target = out ?? ({} as Sample);
  const i = sampleIndexAt(samples, time);
  const a = samples[i];
  const b = samples[Math.min(i + 1, samples.length - 1)];
  const span = b.t - a.t;
  const f = span > 0 ? Math.min(1, Math.max(0, (time - a.t) / span)) : 0;
  target.t = time;
  target.x = lerp(a.x, b.x, f);
  target.y = lerp(a.y, b.y, f);
  target.vx = lerp(a.vx, b.vx, f);
  target.vy = lerp(a.vy, b.vy, f);
  target.th = lerp(a.th, b.th, f);
  target.om = lerp(a.om, b.om, f);
  target.fuel = lerp(a.fuel, b.fuel, f);
  target.thr = lerp(a.thr, b.thr, f);
  target.thrCmd = lerp(a.thrCmd, b.thrCmd, f);
  target.gim = lerp(a.gim, b.gim, f);
  target.rcs = lerp(a.rcs, b.rcs, f);
  target.legs = lerp(a.legs, b.legs, f);
  target.wind = lerp(a.wind, b.wind, f);
  target.alt = lerp(a.alt, b.alt, f);
  return target;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Reduce a recording for storage: keep every `every`-th sample (always keeping
 * the first and final samples) and round values.
 */
export function compactRecording(rec: Recording, every = 3): Recording {
  const n = rec.samples.length;
  const samples = rec.samples
    .filter((_, i) => i % every === 0 || i === n - 1)
    .map((s) => {
      const o = {} as Sample;
      for (const k of Object.keys(s) as (keyof Sample)[]) o[k] = r3(s[k]);
      return o;
    });
  return { ...rec, samples, sampleInterval: rec.sampleInterval * every };
}

export type ValidationResult = { ok: true; recording: Recording } | { ok: false; error: string };

const SAMPLE_KEYS: (keyof Sample)[] = [
  't', 'x', 'y', 'vx', 'vy', 'th', 'om', 'fuel', 'thr', 'thrCmd', 'gim', 'rcs', 'legs', 'wind', 'alt',
];

/** Validate an imported (untrusted) recording before it is used anywhere. */
export function validateRecording(data: unknown): ValidationResult {
  const fail = (error: string): ValidationResult => ({ ok: false, error });
  if (!data || typeof data !== 'object') return fail('Not a JSON object.');
  const r = data as Partial<Recording>;
  if (r.format !== 'boostback-recording') return fail('Not a Boostback flight recording.');
  if (r.formatVersion !== 1) return fail('Unsupported recording format version.');
  if (typeof r.simVersion !== 'string') return fail('Missing simulation version.');
  if (!r.scenarioId || !DIFFICULTY_ORDER.includes(r.scenarioId)) return fail('Unknown scenario.');
  if (!r.scenario || typeof r.scenario !== 'object') return fail('Missing scenario settings.');
  const sc = r.scenario;
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (
    !sc.limits ||
    !finite(sc.limits.vertical) ||
    !finite(sc.limits.horizontal) ||
    !finite(sc.limits.tiltDeg) ||
    !finite(sc.usableHalfWidth) ||
    !sc.initial ||
    !finite(sc.initial.fuel) ||
    sc.initial.fuel <= 0 ||
    sc.id !== r.scenarioId
  ) {
    return fail('Scenario settings are incomplete.');
  }
  if (typeof r.seed !== 'number' || !Number.isFinite(r.seed)) return fail('Missing scenario seed.');
  if (r.controlMode !== 'assisted' && r.controlMode !== 'direct') return fail('Unknown control mode.');
  if (!Array.isArray(r.samples) || r.samples.length < 2) return fail('Recording has no flight samples.');
  if (r.samples.length > 20000) return fail('Recording is too large.');
  let lastT = -Infinity;
  for (const s of r.samples) {
    if (!s || typeof s !== 'object') return fail('Malformed sample.');
    for (const k of SAMPLE_KEYS) {
      const v = (s as unknown as Record<string, unknown>)[k];
      if (typeof v !== 'number' || !Number.isFinite(v)) return fail(`Sample field "${k}" is invalid.`);
    }
    if (s.t < lastT) return fail('Samples are not in time order.');
    lastT = s.t;
  }
  if (!Array.isArray(r.events) || !Array.isArray(r.inputs)) return fail('Missing events or inputs.');
  for (const e of r.events) {
    if (!e || typeof e.t !== 'number' || typeof e.label !== 'string' || typeof e.type !== 'string')
      return fail('Malformed event.');
  }
  if (r.report !== null && (typeof r.report !== 'object' || typeof r.report?.outcome !== 'string'))
    return fail('Malformed result.');
  return {
    ok: true,
    recording: {
      ...(r as Recording),
      id: typeof r.id === 'string' ? r.id.slice(0, 40) : `import-${Date.now()}`,
      pilot: r.pilot === 'demo' ? 'demo' : 'player',
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
    },
  };
}

export function isCurrentVersion(rec: Recording): boolean {
  return rec.simVersion === SIM_VERSION;
}
