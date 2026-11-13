export const fmt = {
  /** Altitude: whole metres above 20 m, one decimal below. */
  alt(m: number) {
    const v = Math.max(0, m);
    return v >= 20 ? Math.round(v).toString() : v.toFixed(1);
  },
  speed(v: number) {
    return Math.abs(v).toFixed(1);
  },
  pct(f: number) {
    return `${Math.round(Math.max(0, Math.min(1, f)) * 100)}`;
  },
  deg(rad: number) {
    return Math.abs((rad * 180) / Math.PI).toFixed(1);
  },
  time(t: number) {
    return `${t.toFixed(1)} s`;
  },
};
