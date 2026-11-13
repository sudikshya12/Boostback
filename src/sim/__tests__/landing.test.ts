import { describe, expect, it } from 'vitest';
import { DECK } from '../config';
import { DEPLOYED_FOOT_OFFSET } from '../geometry';
import { Simulation } from '../simulation';
import { calmScenario, HOLD, place, runUntilEnd } from './helpers';

/** Deterministic fixtures: the vehicle is placed just above the deck and allowed to fall. */
function touchdown(p: Parameters<typeof place>[1]) {
  const sc = calmScenario();
  const sim = place(new Simulation(sc), p);
  const report = runUntilEnd(sim, HOLD)!;
  return { sim, report, sc };
}

describe('touchdown evaluation', () => {
  it('a gentle, upright, centred touchdown with locked legs succeeds', () => {
    const { report } = touchdown({ clearance: 0.05, vy: -1.5 });
    expect(report.outcome).toBe('landed');
    expect(report.failures).toEqual([]);
    expect(report.contactPoint === 'leftFoot' || report.contactPoint === 'rightFoot').toBe(true);
    expect(report.checks.every((c) => c.pass)).toBe(true);
  });

  it('excessive vertical speed is a hard landing', () => {
    const { report } = touchdown({ clearance: 0.05, vy: -6 });
    expect(report.outcome).toBe('hardLanding');
  });

  it('excessive horizontal speed fails', () => {
    const { report } = touchdown({ clearance: 0.05, vy: -1, vx: 4 });
    expect(report.outcome).toBe('lateralSpeed');
  });

  it('excessive tilt fails', () => {
    const { report } = touchdown({ clearance: 0.05, vy: -1, thetaDeg: 12 });
    expect(report.outcome).toBe('excessiveTilt');
  });

  it('missing legs fail — the nozzle touches first', () => {
    const { report } = touchdown({ clearance: 0.05, vy: -1, legs: 0 });
    expect(report.outcome).toBe('legsNotDeployed');
    expect(report.contactPoint?.startsWith('nozzle')).toBe(true);
  });

  it('partially deployed legs fail', () => {
    for (const legs of [0.4, 0.95]) {
      const { report } = touchdown({ clearance: 0.05, vy: -1, legs });
      expect(report.outcome).toBe('legsDeploying');
    }
  });

  it('landing on the deck but outside the usable zone fails', () => {
    const sc = calmScenario();
    const x = sc.usableHalfWidth - DEPLOYED_FOOT_OFFSET + 3; // outer foot 3 m outside
    const { report } = touchdown({ clearance: 0.05, vy: -1, x });
    expect(report.outcome).toBe('outsideZone');
  });

  it('missing the platform entirely is an ocean impact', () => {
    const { report } = touchdown({ clearance: 30, vy: -10, x: DECK.halfWidth + 30 });
    expect(report.outcome).toBe('oceanImpact');
    expect(report.surface).toBe('ocean');
  });

  it('reports every failed condition, primary first', () => {
    const { report } = touchdown({ clearance: 0.05, vy: -8, vx: 5, thetaDeg: 9 });
    expect(report.outcome).toBe('hardLanding');
    expect(report.failures).toEqual(['hardLanding', 'excessiveTilt', 'lateralSpeed']);
  });

  it('cannot tunnel through the deck even at extreme speed', () => {
    for (const vy of [-150, -400, -900]) {
      const { sim, report } = touchdown({ clearance: 2, vy });
      expect(report.surface).toBe('deck');
      expect(report.outcome).not.toBe('landed');
      // The authoritative state is snapped to the contact point: nothing below the deck.
      expect(sim.state.y).toBeGreaterThan(0);
    }
  });

  it('hitting the side of the deck is a body collision', () => {
    const sim = place(new Simulation(calmScenario()), { clearance: -3, x: -DECK.halfWidth - 20, vx: 60, vy: 0, legs: 1 });
    const report = runUntilEnd(sim, HOLD)!;
    expect(report.outcome).toBe('bodyCollision');
    expect(report.surface).toBe('deckEdge');
  });

  it('freezes the vehicle after the outcome', () => {
    const { sim } = touchdown({ clearance: 0.05, vy: -1.5 });
    const { x, y, theta } = sim.state;
    for (let i = 0; i < 240; i++) sim.step({ throttleRate: 1, throttleSet: null, tilt: 1, deployLegs: true });
    expect(sim.state.x).toBe(x);
    expect(sim.state.y).toBe(y);
    expect(sim.state.theta).toBe(theta);
    expect(sim.state.thrust).toBe(0);
  });

  it('flying away ends out of bounds', () => {
    const sim = place(new Simulation(calmScenario()), { clearance: 300, vx: 0, vy: 0, throttle: 1, fuel: 5000 });
    const report = runUntilEnd(sim, { throttleRate: 0, throttleSet: 1, tilt: 0, deployLegs: false }, 120 * 120)!;
    expect(report.outcome).toBe('outOfBounds');
  });
});
