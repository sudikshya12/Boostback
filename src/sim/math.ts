export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const toDeg = (r: number) => (r * 180) / Math.PI;
export const toRad = (d: number) => (d * Math.PI) / 180;
export const approach = (current: number, target: number, maxDelta: number) =>
  current + clamp(target - current, -maxDelta, maxDelta);

/** Mulberry32: tiny, fast, seedable PRNG. Deterministic for a given seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
