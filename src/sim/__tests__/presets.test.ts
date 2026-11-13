import { describe, expect, it } from 'vitest';
import { ASSIST, DIFFICULTY_ORDER, PRESETS } from '../config';
import { DemoController } from '../demoController';
import { clearance } from '../geometry';
import { Simulation } from '../simulation';
import { flyDemo } from './helpers';

describe('presets are demonstrably landable', () => {
  for (const id of DIFFICULTY_ORDER) {
    it(`demo controller lands the ${id} preset`, () => {
      const sim = flyDemo(id);
      const r = sim.report!;
      // Useful output when tuning presets.
      console.log(
        id,
        r.outcome,
        `t=${r.t.toFixed(1)}s vy=${r.vy.toFixed(2)} vx=${r.vx.toFixed(2)} tilt=${r.tiltDeg.toFixed(2)} x=${r.distanceFromCenter.toFixed(1)} fuel=${(r.fuelFraction * 100).toFixed(0)}%`,
      );
      expect(r.outcome).toBe('landed');
      expect(r.fuelRemaining).toBeGreaterThan(0);
    });
  }
});

/**
 * A pilot restricted to what a keyboard player can do: hold W or S (throttle
 * rate ±1), hold A or D (full left/right tilt command), press L. It follows the
 * demo controller's targets, quantised to those discrete inputs (a tilt key is
 * held until the lean reaches the target, then released), and samples input at
 * 30 Hz. Shows the presets are
 * landable with the actual control scheme, not just with continuous inputs.
 */
describe('presets are landable with keyboard-style discrete inputs', () => {
  for (const id of DIFFICULTY_ORDER) {
    it(`keyboard pilot lands the ${id} preset`, () => {
      const sc = PRESETS[id];
      const sim = new Simulation(sc);
      const demo = new DemoController(sc);
      let input = { throttleRate: 0, throttleSet: null as number | null, tilt: 0, deployLegs: false };
      let guard = 0;
      while (!sim.ended && guard++ < 120 * 240) {
        if (sim.state.step % 4 === 0) {
          const want = demo.input(sim.state);
          const diff = (want.throttleSet ?? 0) - sim.state.throttleCmd;
          input = {
            throttleRate: Math.abs(diff) > 0.04 ? Math.sign(diff) : 0,
            throttleSet: null,
            // Watching the tilt readout: hold A/D until the wanted lean is reached, then let go.
            tilt: keyTilt(want.tilt * ASSIST.maxTilt, sim.state.theta, clearance(sim.state)),
            deployLegs: want.deployLegs,
          };
        }
        sim.step(input);
      }
      const r = sim.report!;
      console.log(`keyboard ${id}`, r.outcome, `vy=${r.vy.toFixed(2)} vx=${r.vx.toFixed(2)} x=${r.distanceFromCenter.toFixed(1)} fuel=${(r.fuelFraction * 100).toFixed(0)}%`);
      expect(r.outcome).toBe('landed');
    });
  }
});

/**
 * Hold the tilt key until the lean reaches the target, then let go (the assist
 * starts levelling). Because releasing pulls the lean back, a person aims a
 * little past what they want; the 1.4 factor models that.
 */
function keyTilt(target: number, theta: number, clr: number): number {
  const band = (0.6 * Math.PI) / 180;
  const aim = target * 1.4;
  // Hands off the tilt keys in the last few metres; the assist levels the booster.
  if (clr < 6 || Math.abs(aim) < band) return 0;
  return Math.sign(aim) * (aim - theta) > band ? Math.sign(aim) : 0;
}
