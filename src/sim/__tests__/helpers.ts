import { PRESETS, type Scenario } from '../config';
import { DemoController } from '../demoController';
import { clearance } from '../geometry';
import { toRad } from '../math';
import { Simulation } from '../simulation';
import { NEUTRAL_INPUT, type ControlInput } from '../types';

/** A calm, deterministic scenario used as a base for fixtures. */
export function calmScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    ...PRESETS.standard,
    wind: { base: 0, gust: 0 },
    ...overrides,
  };
}

export interface Placement {
  x?: number;
  clearance: number;
  vx?: number;
  vy?: number;
  thetaDeg?: number;
  legs?: number;
  throttle?: number;
  fuel?: number;
}

/** Put the vehicle in a specific pose so its lowest point is `clearance` above the deck. */
export function place(sim: Simulation, p: Placement): Simulation {
  const s = sim.state;
  s.x = p.x ?? 0;
  s.vx = p.vx ?? 0;
  s.vy = p.vy ?? 0;
  s.theta = toRad(p.thetaDeg ?? 0);
  s.omega = 0;
  s.legs = p.legs ?? 1;
  s.legsCommanded = s.legs > 0;
  s.throttle = s.throttleCmd = p.throttle ?? 0;
  if (p.fuel !== undefined) s.fuel = p.fuel;
  s.y = 100;
  s.y += p.clearance - clearance(s);
  return sim;
}

/** Hold an input until the flight ends (or a step budget runs out). */
export function runUntilEnd(sim: Simulation, input: ControlInput = NEUTRAL_INPUT, maxSteps = 120 * 60) {
  let i = 0;
  while (!sim.ended && i++ < maxSteps) sim.step(input);
  return sim.report;
}

/** Hold the current throttle (tilt held upright) — a "coast/hold" input. */
export const HOLD: ControlInput = { throttleRate: 0, throttleSet: null, tilt: 0, deployLegs: false };

/** Runs the demo controller on a preset until the flight ends. */
export function flyDemo(id: keyof typeof PRESETS) {
  const sc = PRESETS[id];
  const sim = new Simulation(sc, { pilot: 'demo' });
  const demo = new DemoController(sc);
  let guard = 0;
  while (!sim.ended && guard++ < 120 * 240) sim.step(demo.input(sim.state));
  return sim;
}

