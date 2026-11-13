import { clamp, mulberry32 } from './math';

/**
 * Deterministic horizontal wind. The gust pattern is fixed at scenario start by
 * the seed — nothing changes randomly mid-run, so identical seeds and inputs
 * give identical flights.
 */
export class WindField {
  private readonly comps: { amp: number; freq: number; phase: number; k: number }[] = [];

  constructor(
    readonly base: number,
    readonly gust: number,
    readonly seed: number,
  ) {
    const rnd = mulberry32(seed);
    const raw = [0, 1, 2].map(() => ({
      amp: 0.5 + rnd(),
      freq: 0.04 + rnd() * 0.16, // Hz
      phase: rnd() * Math.PI * 2,
      k: (rnd() - 0.5) * 0.01, // spatial variation with altitude (rad/m)
    }));
    const total = raw.reduce((s, c) => s + c.amp, 0);
    for (const c of raw) this.comps.push({ ...c, amp: c.amp / total });
  }

  /** Wind speed along +x (m/s) at time t and height y. */
  at(t: number, y: number): number {
    // Simple boundary-layer shape: weaker near the sea surface.
    const profile = 0.6 + 0.4 * clamp(y / 400, 0, 1);
    let g = 0;
    for (const c of this.comps) g += c.amp * Math.sin(2 * Math.PI * c.freq * t + c.phase + c.k * y);
    return this.base * profile + this.gust * g;
  }
}
