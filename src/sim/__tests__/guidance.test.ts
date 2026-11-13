import { describe, expect, it } from 'vitest';
import { PRESETS } from '../config';
import { clearance } from '../geometry';
import { activeGuidance, brakingEstimate, GuidanceTracker, type GuidanceId } from '../guidance';
import { restingPose } from '../resting';
import { Simulation } from '../simulation';
import { calmScenario, place } from './helpers';

describe('guidance', () => {
  it('asks for legs when low with legs stowed (manual-leg presets only)', () => {
    const sim = place(new Simulation(calmScenario()), { clearance: 150, vy: -10, legs: 0, throttle: 0.5 });
    expect(activeGuidance(sim.state, clearance(sim.state), PRESETS.standard).has('deployLegs')).toBe(true);
    expect(activeGuidance(sim.state, clearance(sim.state), PRESETS.training).has('deployLegs')).toBe(false);
  });

  it('braking estimate is suppressed when its assumptions do not hold', () => {
    const sim = place(new Simulation(calmScenario()), { clearance: 300, vy: -40, fuel: 0 });
    expect(brakingEstimate(sim.state, 300).valid).toBe(false);
    const climbing = place(new Simulation(calmScenario()), { clearance: 300, vy: 5 });
    expect(brakingEstimate(climbing.state, 300).valid).toBe(false);
  });

  it('braking estimate grows with descent speed', () => {
    const a = place(new Simulation(calmScenario()), { clearance: 300, vy: -20 });
    const b = place(new Simulation(calmScenario()), { clearance: 300, vy: -40 });
    expect(brakingEstimate(b.state, 300).stopDistance).toBeGreaterThan(brakingEstimate(a.state, 300).stopDistance * 3);
  });

  it('tracker does not flicker when a condition toggles rapidly', () => {
    const tr = new GuidanceTracker();
    let changes = 0;
    let last: GuidanceId | null = null;
    for (let i = 0; i < 600; i++) {
      const t = i / 120;
      const on = Math.floor(i / 6) % 2 === 0; // toggles every 50 ms
      const msg = tr.update(t, new Set<GuidanceId>(on ? ['correctDrift'] : []));
      if (msg !== last) changes++;
      last = msg;
    }
    expect(changes).toBeLessThanOrEqual(1);
  });

  it('higher-priority messages pre-empt lower ones', () => {
    const tr = new GuidanceTracker();
    for (let i = 0; i < 60; i++) tr.update(i / 120, new Set<GuidanceId>(['fuelLow']));
    expect(tr.current).toBe('fuelLow');
    for (let i = 60; i < 120; i++) tr.update(i / 120, new Set<GuidanceId>(['fuelLow', 'reduceDescent']));
    expect(tr.current).toBe('reduceDescent');
  });
});

describe('resting pose', () => {
  it('a successful landing settles upright without sliding', () => {
    const final = { x: 3.2, y: 20, theta: 0.05, legs: 1 };
    const later = restingPose(final, 'landed', 3);
    expect(later.x).toBe(3.2);
    expect(Math.abs(later.theta)).toBeLessThan(1e-6);
    expect(clearance(later)).toBeCloseTo(0, 6);
  });
});
