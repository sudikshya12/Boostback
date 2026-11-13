import { GRAVITY, VEHICLE, type Scenario } from './config';
import { DEPLOYED_FOOT_OFFSET } from './geometry';
import { massFlow, totalMass } from './physics';
import type { SimState } from './types';

export type GuidanceId =
  | 'fuelOut'
  | 'reduceDescent'
  | 'brakeNow'
  | 'zoneMissed'
  | 'deployLegs'
  | 'levelOut'
  | 'correctDrift'
  | 'fuelLow';

export type Tone = 'guide' | 'caution' | 'danger';

export const GUIDANCE: Record<GuidanceId, { text: string; tone: Tone }> = {
  fuelOut: { text: 'Out of propellant', tone: 'danger' },
  reduceDescent: { text: 'Reduce descent speed', tone: 'danger' },
  brakeNow: { text: 'Start braking (estimate)', tone: 'caution' },
  zoneMissed: { text: 'Landing zone missed', tone: 'danger' },
  deployLegs: { text: 'Deploy landing legs', tone: 'caution' },
  levelOut: { text: 'Level the booster', tone: 'caution' },
  correctDrift: { text: 'Correct your drift', tone: 'guide' },
  fuelLow: { text: 'Fuel low', tone: 'caution' },
};

/** Highest priority first. */
export const GUIDANCE_PRIORITY: GuidanceId[] = [
  'fuelOut',
  'reduceDescent',
  'brakeNow',
  'zoneMissed',
  'deployLegs',
  'levelOut',
  'correctDrift',
  'fuelLow',
];

export interface BrakingEstimate {
  /** False when the simplified assumptions do not hold; the cue is then hidden. */
  valid: boolean;
  /** Estimated height needed to stop the descent at full throttle (m). */
  stopDistance: number;
  /** Clearance minus stop distance (m). */
  margin: number;
}

/**
 * Simplified stopping-distance estimate, used only for a guidance cue.
 *
 * Assumes: full throttle reached at the engine's slew rate, the current tilt
 * held, constant mass, no drag, no wind. It ignores that mass drops while
 * braking (which makes it slightly conservative) and is suppressed when the
 * engine cannot out-push gravity, the vehicle is not descending, or there is
 * not enough propellant for the burn.
 */
export function brakingEstimate(s: SimState, clr: number): BrakingEstimate {
  const mass = totalMass(s.fuel);
  const aNet = (VEHICLE.maxThrust * Math.cos(s.theta)) / mass - GRAVITY;
  const v = -s.vy;
  if (s.fuel <= 0 || aNet < 0.5 || v < 2) return { valid: false, stopDistance: 0, margin: Infinity };
  const rampTime = (1 - s.throttle) / VEHICLE.throttleSlewRate;
  const burnTime = v / aNet;
  if (s.fuel < massFlow(VEHICLE.maxThrust) * burnTime) {
    return { valid: false, stopDistance: 0, margin: Infinity };
  }
  const stopDistance = v * rampTime + (v * v) / (2 * aNet);
  return { valid: true, stopDistance, margin: clr - stopDistance };
}

export type DescentRisk = 'ok' | 'brake' | 'danger';

/**
 * Classifies the current descent using the braking estimate:
 *  - 'danger': even full throttle is estimated to barely stop in time, or the
 *    vehicle is close to the deck and still well above the landing limit;
 *  - 'brake': the estimated stopping distance is getting close to the clearance
 *    while the engine is still at low throttle.
 * Shared by the guidance messages and the HUD vertical-speed highlight.
 */
export function descentRisk(s: SimState, clr: number, scenario: Scenario): DescentRisk {
  const descent = -s.vy;
  const lim = scenario.limits.vertical;
  if (descent <= lim || s.outcome) return 'ok';
  const est = brakingEstimate(s, clr);
  if (clr < 12 && descent > lim + 0.6 * clr) return 'danger';
  if (est.valid && est.margin < 6 && clr > 2) return 'danger';
  if (!est.valid && s.fuel > 0 && clr < 150 && descent > lim * 3) return 'danger';
  if (est.valid && clr > 20 && est.margin < 30 + 0.3 * descent && s.throttle < 0.5) return 'brake';
  return 'ok';
}

/** Which guidance conditions are true right now, derived only from state. */
export function activeGuidance(s: SimState, clr: number, scenario: Scenario): Set<GuidanceId> {
  const out = new Set<GuidanceId>();
  if (s.outcome) return out;
  const lim = scenario.limits;
  const level = scenario.guidance;
  const descent = -s.vy;
  const fuelFrac = s.fuel / scenario.initial.fuel;

  if (s.fuel <= 0) out.add('fuelOut');

  const risk = descentRisk(s, clr, scenario);
  if (risk === 'danger') out.add('reduceDescent');
  else if (risk === 'brake' && level !== 'minimal') out.add('brakeNow');

  if (clr < 40 && Math.abs(s.x) > scenario.usableHalfWidth + 10) out.add('zoneMissed');

  if (!s.legsCommanded && scenario.autoLegsAltitude === null && clr < 250) out.add('deployLegs');

  if (clr < 30 && Math.abs(s.theta) * (180 / Math.PI) > lim.tiltDeg) out.add('levelOut');

  if (level !== 'minimal' && clr > 8) {
    const tGo = Math.min(30, clr / Math.max(2, descent));
    const predicted = s.x + s.vx * tGo;
    const zone = scenario.usableHalfWidth - DEPLOYED_FOOT_OFFSET;
    if (Math.abs(predicted) > zone + 4 || (clr < 40 && Math.abs(s.vx) > lim.horizontal * 1.5)) {
      out.add('correctDrift');
    }
  }

  if (fuelFrac > 0 && fuelFrac < 0.2) out.add('fuelLow');
  return out;
}

/**
 * Picks one message at a time and avoids flicker:
 *  - a new message must be continuously active for `confirm` seconds;
 *  - a higher-priority message can pre-empt the current one;
 *  - the current message stays for at least `minShow` seconds, and is only
 *    cleared after its condition has been false for `release` seconds.
 */
export class GuidanceTracker {
  current: GuidanceId | null = null;
  private shownAt = 0;
  private inactiveSince: number | null = null;
  private candidate: GuidanceId | null = null;
  private candidateSince = 0;

  constructor(
    private readonly confirm = 0.3,
    private readonly minShow = 1.6,
    private readonly release = 0.6,
  ) {}

  reset() {
    this.current = null;
    this.candidate = null;
    this.inactiveSince = null;
  }

  update(t: number, active: Set<GuidanceId>): GuidanceId | null {
    const top = GUIDANCE_PRIORITY.find((id) => active.has(id)) ?? null;
    if (top !== this.candidate) {
      this.candidate = top;
      this.candidateSince = t;
    }
    const stableTop = top && t - this.candidateSince >= this.confirm ? top : null;

    if (this.current && active.has(this.current)) {
      this.inactiveSince = null;
      if (stableTop && rank(stableTop) < rank(this.current)) this.show(stableTop, t);
      return this.current;
    }

    if (this.current) {
      if (this.inactiveSince === null) this.inactiveSince = t;
      const canLeave = t - this.shownAt >= this.minShow && t - this.inactiveSince >= this.release;
      if (stableTop && rank(stableTop) < rank(this.current)) this.show(stableTop, t);
      else if (canLeave) {
        this.current = null;
        if (stableTop) this.show(stableTop, t);
      }
      return this.current;
    }

    if (stableTop) this.show(stableTop, t);
    return this.current;
  }

  private show(id: GuidanceId, t: number) {
    this.current = id;
    this.shownAt = t;
    this.inactiveSince = null;
  }
}

function rank(id: GuidanceId): number {
  return GUIDANCE_PRIORITY.indexOf(id);
}
