import { describe, expect, it } from 'vitest';
import { DT, GRAVITY, VEHICLE } from '../config';
import { attitudeControl } from '../attitude';
import { computeForces, integrate, massFlow, totalMass } from '../physics';
import { initialState, Simulation } from '../simulation';
import { calmScenario, place } from './helpers';
import type { SimState } from '../types';

function freshState(over: Partial<SimState> = {}): SimState {
  return { ...initialState(calmScenario()), vx: 0, vy: 0, theta: 0, omega: 0, throttle: 0, throttleCmd: 0, ...over };
}

const noAct = { throttleCmd: 0, gimbalCmd: 0, rcs: 0 };

describe('gravity', () => {
  it('changes vertical velocity by -g·dt per step when at rest (no drag)', () => {
    const s = freshState();
    integrate(s, noAct, 0, DT);
    expect(s.vy).toBeCloseTo(-GRAVITY * DT, 12);
    expect(s.vx).toBe(0);
  });

  it('matches v = g·t over one second of free fall (drag < 0.5 %)', () => {
    const s = freshState();
    for (let i = 0; i < 120; i++) integrate(s, noAct, 0, DT);
    expect(s.vy).toBeLessThan(0);
    expect(Math.abs(s.vy + GRAVITY) / GRAVITY).toBeLessThan(0.005);
  });
});

describe('thrust', () => {
  it('acceleration is thrust divided by current mass', () => {
    const T = 400_000;
    for (const fuel of [0, 2000, 6000]) {
      const m = totalMass(fuel);
      const f = computeForces({ vx: 0, vy: 0, theta: 0, omega: 0, gimbal: 0, rcs: 0 }, T, m, 0);
      expect(f.ay + GRAVITY).toBeCloseTo(T / m, 9);
    }
    const light = computeForces({ vx: 0, vy: 0, theta: 0, omega: 0, gimbal: 0, rcs: 0 }, T, totalMass(500), 0);
    const heavy = computeForces({ vx: 0, vy: 0, theta: 0, omega: 0, gimbal: 0, rcs: 0 }, T, totalMass(8000), 0);
    expect(light.ay).toBeGreaterThan(heavy.ay);
  });

  it('tilting the body tilts the thrust vector toward +x', () => {
    const f = computeForces({ vx: 0, vy: 0, theta: 0.2, omega: 0, gimbal: 0, rcs: 0 }, 500_000, 25_000, 0);
    expect(f.ax).toBeGreaterThan(0);
  });
});

describe('propellant', () => {
  it('decreases by thrust / (Isp·g0) per second at full throttle', () => {
    const s = freshState({ throttle: 1, throttleCmd: 1, fuel: 5000 });
    for (let i = 0; i < 120; i++) integrate(s, { ...noAct, throttleCmd: 1 }, 0, DT);
    expect(5000 - s.fuel).toBeCloseTo(massFlow(VEHICLE.maxThrust) * 1, 6);
  });

  it('scales with applied throttle', () => {
    const a = freshState({ throttle: 0.5, throttleCmd: 0.5, fuel: 5000 });
    const b = freshState({ throttle: 1, throttleCmd: 1, fuel: 5000 });
    for (let i = 0; i < 240; i++) {
      integrate(a, { ...noAct, throttleCmd: 0.5 }, 0, DT);
      integrate(b, { ...noAct, throttleCmd: 1 }, 0, DT);
    }
    expect((5000 - a.fuel) / (5000 - b.fuel)).toBeCloseTo(0.5, 9);
  });

  it('never becomes negative', () => {
    const s = freshState({ throttle: 1, throttleCmd: 1, fuel: 1.234 });
    for (let i = 0; i < 600; i++) {
      integrate(s, { ...noAct, throttleCmd: 1 }, 0, DT);
      expect(s.fuel).toBeGreaterThanOrEqual(0);
    }
    expect(s.fuel).toBe(0);
  });

  it('produces no thrust once empty', () => {
    const s = freshState({ throttle: 1, throttleCmd: 1, fuel: 0 });
    integrate(s, { ...noAct, throttleCmd: 1 }, 0, DT);
    expect(s.thrust).toBe(0);
    expect(s.vy).toBeCloseTo(-GRAVITY * DT, 12);
  });

  it('a running simulation keeps falling (not crashing) after fuel runs out', () => {
    const sim = new Simulation(calmScenario());
    place(sim, { clearance: 400, fuel: 5, throttle: 1 });
    for (let i = 0; i < 60; i++) sim.step({ throttleRate: 0, throttleSet: 1, tilt: 0, deployLegs: false });
    expect(sim.state.fuel).toBe(0);
    expect(sim.ended).toBe(false);
    expect(sim.events.some((e) => e.type === 'fuelOut')).toBe(true);
  });
});

describe('torque and attitude', () => {
  it('positive gimbal with thrust rotates the nose toward -x (negative angular acceleration)', () => {
    const f = computeForces({ vx: 0, vy: 0, theta: 0, omega: 0, gimbal: 0.05, rcs: 0 }, 400_000, 25_000, 0);
    expect(f.alpha).toBeLessThan(0);
    const g = computeForces({ vx: 0, vy: 0, theta: 0, omega: 0, gimbal: -0.05, rcs: 0 }, 400_000, 25_000, 0);
    expect(g.alpha).toBeGreaterThan(0);
  });

  it('gimbal has no effect without thrust', () => {
    const f = computeForces({ vx: 0, vy: 0, theta: 0, omega: 0, gimbal: 0.1, rcs: 0 }, 0, 25_000, 0);
    expect(f.alpha).toBe(0);
  });

  it('angular damping opposes rotation', () => {
    const f = computeForces({ vx: 0, vy: 0, theta: 0, omega: 0.2, gimbal: 0, rcs: 0 }, 0, 25_000, 0);
    expect(f.alpha).toBeLessThan(0);
  });

  it('assisted "right" input tilts the nose right, and releasing returns upright', () => {
    const sim = new Simulation(calmScenario());
    place(sim, { clearance: 400, throttle: 0.45 });
    const right = { throttleRate: 0, throttleSet: 0.45, tilt: 1, deployLegs: false };
    for (let i = 0; i < 120 * 4; i++) sim.step(right);
    expect(sim.state.theta).toBeGreaterThan(0.15);
    const centre = { ...right, tilt: 0 };
    for (let i = 0; i < 120 * 6; i++) sim.step(centre);
    expect(Math.abs(sim.state.theta)).toBeLessThan(0.01);
  });

  it('assist never commands more than the gimbal limit', () => {
    const cmd = attitudeControl(-1, -2, 600_000, 25_000, 1, 'assisted');
    expect(Math.abs(cmd.gimbalCmd)).toBeLessThanOrEqual(VEHICLE.maxGimbal + 1e-12);
    expect(Math.abs(cmd.rcs)).toBeLessThanOrEqual(1);
  });

  it('applied gimbal is rate-limited', () => {
    const s = freshState({ throttle: 0.5, throttleCmd: 0.5 });
    integrate(s, { throttleCmd: 0.5, gimbalCmd: VEHICLE.maxGimbal, rcs: 0 }, 0, DT);
    expect(s.gimbal).toBeCloseTo(VEHICLE.gimbalRate * DT, 12);
  });
});
