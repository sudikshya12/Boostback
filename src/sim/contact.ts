import { DECK, type Scenario } from './config';
import { contactPoints, feetWorldX, toWorld, type LocalPoint } from './geometry';
import { lerp, toDeg } from './math';
import type { ContactPointId, FlightReport, OutcomeKind, SimState, TouchdownCheck } from './types';

export interface ContactEvent {
  /** Fraction of the step (0..1) at which the first contact happens. */
  fraction: number;
  pointId: ContactPointId;
  isFoot: boolean;
  surface: 'deck' | 'deckEdge' | 'ocean';
  /** World x of the contact. */
  x: number;
}

const a: LocalPoint = { x: 0, y: 0 };
const b: LocalPoint = { x: 0, y: 0 };

/**
 * Swept contact detection.
 *
 * Each contact point (feet, nozzle, body corners) is moved along the straight
 * segment between its world position at the start and end of the step. We find
 * the earliest fraction of the step at which any point crosses the deck top,
 * enters the deck side, or crosses the sea surface. Because the test is on the
 * segment rather than the end position, a fast vehicle cannot tunnel through
 * the 6 m deck between steps. At dt = 1/120 s even 200 m/s is under 2 m/step.
 */
export function detectContact(prev: SimState, next: SimState): ContactEvent | null {
  const prevPts = contactPoints(prev.legs);
  const nextPts = contactPoints(next.legs);
  const hw = DECK.halfWidth;
  let best: ContactEvent | null = null;

  const consider = (ev: ContactEvent) => {
    if (
      !best ||
      ev.fraction < best.fraction - 1e-9 ||
      // Tie: prefer the foot, so a perfect simultaneous touch counts as a foot touch.
      (Math.abs(ev.fraction - best.fraction) <= 1e-9 && ev.isFoot && !best.isFoot)
    ) {
      best = ev;
    }
  };

  for (let i = 0; i < prevPts.length; i++) {
    const p0 = toWorld(prev, prevPts[i].local, a);
    const p1 = toWorld(next, nextPts[i].local, b);
    const { id, isFoot } = prevPts[i];

    // 1. Crossing the deck top surface from above, within the deck width.
    if (p0.y >= 0 && p1.y < 0) {
      const f = p0.y / (p0.y - p1.y);
      const xc = lerp(p0.x, p1.x, f);
      if (Math.abs(xc) <= hw) consider({ fraction: f, pointId: id, isFoot, surface: 'deck', x: xc });
    }

    // 2. Entering the deck from the side (below the top surface).
    for (const side of [-1, 1]) {
      const sx = side * hw;
      const outside0 = side * (p0.x - sx) > 0;
      const outside1 = side * (p1.x - sx) > 0;
      if (outside0 && !outside1) {
        const f = (p0.x - sx) / (p0.x - p1.x);
        const yc = lerp(p0.y, p1.y, f);
        if (yc < 0 && yc > -DECK.thickness) {
          consider({ fraction: f, pointId: id, isFoot, surface: 'deckEdge', x: sx });
        }
      }
    }

    // 3. Reaching the sea surface outside the deck.
    if (p0.y >= DECK.seaLevel && p1.y < DECK.seaLevel) {
      const f = (p0.y - DECK.seaLevel) / (p0.y - p1.y);
      const xc = lerp(p0.x, p1.x, f);
      if (Math.abs(xc) > hw) consider({ fraction: f, pointId: id, isFoot, surface: 'ocean', x: xc });
    }
  }
  return best;
}

/** Interpolate a state to a fraction of the step (positions, velocities and legs). */
export function interpolateState(prev: SimState, next: SimState, f: number, out: SimState): SimState {
  Object.assign(out, next);
  out.t = lerp(prev.t, next.t, f);
  out.x = lerp(prev.x, next.x, f);
  out.y = lerp(prev.y, next.y, f);
  out.vx = lerp(prev.vx, next.vx, f);
  out.vy = lerp(prev.vy, next.vy, f);
  out.theta = lerp(prev.theta, next.theta, f);
  out.omega = lerp(prev.omega, next.omega, f);
  out.legs = lerp(prev.legs, next.legs, f);
  out.fuel = lerp(prev.fuel, next.fuel, f);
  return out;
}

/** Priority used to pick the primary failure when several conditions fail. */
const PRIORITY: OutcomeKind[] = [
  'oceanImpact',
  'bodyCollision',
  'legsNotDeployed',
  'legsDeploying',
  'hardLanding',
  'excessiveTilt',
  'lateralSpeed',
  'outsideZone',
];

/**
 * Turn the first contact into a flight report. A successful landing requires
 * ALL of: a foot touches first, legs locked, vertical speed, horizontal speed
 * and tilt within the scenario limits, and both feet inside the usable zone.
 */
export function evaluateContact(
  s: SimState,
  ev: ContactEvent,
  scenario: Scenario,
  initialFuel: number,
): FlightReport {
  const lim = scenario.limits;
  const feet = feetWorldX(s);
  const tiltDeg = toDeg(s.theta);
  const descent = Math.max(0, -s.vy);
  const feetInZone = Math.max(Math.abs(feet[0]), Math.abs(feet[1]));

  const checks: TouchdownCheck[] = [
    { id: 'vertical', label: 'Vertical speed', value: descent, limit: lim.vertical, unit: 'm/s', pass: descent <= lim.vertical },
    { id: 'horizontal', label: 'Horizontal speed', value: Math.abs(s.vx), limit: lim.horizontal, unit: 'm/s', pass: Math.abs(s.vx) <= lim.horizontal },
    { id: 'tilt', label: 'Tilt', value: Math.abs(tiltDeg), limit: lim.tiltDeg, unit: '°', pass: Math.abs(tiltDeg) <= lim.tiltDeg },
    { id: 'legs', label: 'Legs locked', value: s.legs * 100, limit: 100, unit: '%', pass: s.legs >= 1 },
    { id: 'zone', label: 'Outermost foot from centre', value: feetInZone, limit: scenario.usableHalfWidth, unit: 'm', pass: feetInZone <= scenario.usableHalfWidth },
  ];

  const failures = new Set<OutcomeKind>();
  if (ev.surface === 'ocean') failures.add('oceanImpact');
  if (ev.surface === 'deckEdge') failures.add('bodyCollision');
  if (ev.surface === 'deck') {
    if (!ev.isFoot) {
      if (s.legs <= 0) failures.add('legsNotDeployed');
      else if (s.legs < 1) failures.add('legsDeploying');
      else failures.add('bodyCollision');
    } else if (s.legs < 1) {
      failures.add('legsDeploying');
    }
  }
  if (ev.surface !== 'ocean') {
    if (!checks[0].pass) failures.add('hardLanding');
    if (!checks[2].pass) failures.add('excessiveTilt');
    if (!checks[1].pass) failures.add('lateralSpeed');
    if (!checks[4].pass) failures.add('outsideZone');
  }

  const ordered = PRIORITY.filter((k) => failures.has(k));
  return {
    outcome: ordered[0] ?? 'landed',
    failures: ordered,
    t: s.t,
    contactPoint: ev.pointId,
    surface: ev.surface,
    vx: s.vx,
    vy: s.vy,
    tiltDeg,
    omegaDeg: toDeg(s.omega),
    legs: s.legs,
    distanceFromCenter: Math.abs(s.x),
    feetX: feet,
    fuelRemaining: s.fuel,
    fuelFraction: initialFuel > 0 ? s.fuel / initialFuel : 0,
    checks,
  };
}

/** Report for runs that end without contact (e.g. flying out of bounds). */
export function boundsReport(s: SimState, initialFuel: number): FlightReport {
  return {
    outcome: 'outOfBounds',
    failures: ['outOfBounds'],
    t: s.t,
    contactPoint: null,
    surface: null,
    vx: s.vx,
    vy: s.vy,
    tiltDeg: toDeg(s.theta),
    omegaDeg: toDeg(s.omega),
    legs: s.legs,
    distanceFromCenter: Math.abs(s.x),
    feetX: feetWorldX(s),
    fuelRemaining: s.fuel,
    fuelFraction: initialFuel > 0 ? s.fuel / initialFuel : 0,
    checks: [],
  };
}

export const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  landed: 'Touchdown confirmed',
  hardLanding: 'Hard landing',
  lateralSpeed: 'Excessive lateral speed',
  excessiveTilt: 'Excessive tilt',
  legsNotDeployed: 'Legs not deployed',
  legsDeploying: 'Legs still deploying',
  outsideZone: 'Landing zone missed',
  oceanImpact: 'Missed platform',
  bodyCollision: 'Body collision',
  outOfBounds: 'Out of bounds',
};

export const OUTCOME_DETAIL: Record<OutcomeKind, string> = {
  landed: 'All touchdown conditions were within limits.',
  hardLanding: 'Vertical speed at contact exceeded the landing limit.',
  lateralSpeed: 'Horizontal speed at contact exceeded the landing limit.',
  excessiveTilt: 'The booster was leaning beyond the tilt limit at contact.',
  legsNotDeployed: 'The landing legs were never deployed.',
  legsDeploying: 'The landing legs had not finished locking at contact.',
  outsideZone: 'A landing foot touched outside the usable deck area.',
  oceanImpact: 'The booster came down in the ocean instead of on the deck.',
  bodyCollision: 'The booster body struck the platform before the feet.',
  outOfBounds: 'The booster left the recovery area.',
};
