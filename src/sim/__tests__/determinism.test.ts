import { describe, expect, it } from 'vitest';
import { PRESETS } from '../config';
import { DemoController } from '../demoController';
import { FixedStepper, Simulation } from '../simulation';
import type { ControlInput } from '../types';

/** A scripted pilot: input as a function of simulation time only. */
function scripted(t: number): ControlInput {
  return {
    throttleRate: t < 2 ? 1 : t < 6 ? -0.3 : t < 9 ? 0.4 : 0,
    throttleSet: null,
    tilt: t > 3 && t < 7 ? 1 : t > 9 && t < 11 ? -1 : 0,
    deployLegs: t > 8,
  };
}

describe('determinism', () => {
  it('identical seeds and inputs give bit-identical runs', () => {
    const a = new Simulation(PRESETS.challenge);
    const b = new Simulation(PRESETS.challenge);
    for (let i = 0; i < 120 * 20; i++) {
      a.step(scripted(a.state.t));
      b.step(scripted(b.state.t));
    }
    // Documented tolerance: exact equality in one JS engine. Different engines
    // may differ in the last bits of Math.sin/cos; see docs/PHYSICS.md.
    expect(a.state).toEqual(b.state);
    expect(a.events).toEqual(b.events);
  });

  it('different seeds produce different wind', () => {
    const a = new Simulation({ ...PRESETS.standard, seed: 1 });
    const b = new Simulation({ ...PRESETS.standard, seed: 2 });
    expect(a.wind.at(5, 200)).not.toBeCloseTo(b.wind.at(5, 200), 3);
  });

  it('rendering frame rate does not materially change a run', () => {
    const run = (fps: number, jitter: boolean) => {
      const sim = new Simulation(PRESETS.standard);
      const demo = new DemoController(PRESETS.standard);
      const stepper = new FixedStepper();
      let frame = 0;
      while (!sim.ended && frame < fps * 120) {
        // Input is sampled once per rendered frame, like the real game loop.
        const input = demo.input(sim.state);
        const dt = (1 / fps) * (jitter ? 0.7 + 0.6 * ((frame * 7919) % 13) / 12 : 1);
        stepper.advance(dt, () => sim.step(input));
        frame++;
      }
      return sim.report!;
    };
    const slow = run(30, false);
    const fast = run(144, false);
    const jittery = run(60, true);
    for (const r of [fast, jittery]) {
      expect(r.outcome).toBe(slow.outcome);
      expect(Math.abs(r.t - slow.t)).toBeLessThan(0.5);
      expect(Math.abs(r.distanceFromCenter - slow.distanceFromCenter)).toBeLessThan(1.5);
      expect(Math.abs(r.vy - slow.vy)).toBeLessThan(0.5);
    }
  });

  it('a long stall is clamped instead of advancing the simulation by seconds', () => {
    const stepper = new FixedStepper();
    let steps = 0;
    stepper.advance(5, () => steps++);
    expect(steps).toBeLessThanOrEqual(stepper.maxStepsPerFrame);
    expect(stepper.dropped).toBeGreaterThan(4.8);
  });

  it('the accumulator produces exactly one step per DT on average', () => {
    const stepper = new FixedStepper();
    let steps = 0;
    for (let i = 0; i < 600; i++) stepper.advance(1 / 60, () => steps++);
    expect(Math.abs(steps - 1200)).toBeLessThanOrEqual(1);
  });
});
