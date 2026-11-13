/**
 * Boostback simulation configuration.
 *
 * Every number here is FICTIONAL and chosen for playability. None of these
 * values describe a real vehicle, and the model is not validated against flight
 * telemetry. See docs/PHYSICS.md for the reasoning behind each parameter.
 *
 * Units: SI throughout (m, s, kg, N, rad) unless a name ends in `Deg`.
 *
 * Coordinate conventions (2D simulation plane):
 *   +x  to the right of the screen (horizontal)
 *   +y  up; y = 0 is the top surface of the landing deck
 *   theta  body tilt from vertical, POSITIVE = nose leaning toward +x (clockwise on screen)
 *   omega  d(theta)/dt, same sign convention
 *   gimbal engine deflection relative to the body axis; positive rotates the
 *          thrust vector clockwise, which produces a NEGATIVE (counter-clockwise) torque
 */

export const SIM_VERSION = '1.0.0';

/** Fixed simulation timestep (seconds). */
export const DT = 1 / 120;

/** Gravitational acceleration used by the model (m/s^2). */
export const GRAVITY = 9.81;
/** Standard gravity used to convert specific impulse to exhaust velocity. */
export const G0 = 9.80665;
/** Sea-level air density used for the simplified drag model (kg/m^3). */
export const AIR_DENSITY = 1.225;

const deg = (d: number) => (d * Math.PI) / 180;

/** Fictional "BB-7" booster, final-descent configuration (near-empty tanks). */
export const VEHICLE = {
  /** Structure + engine + residuals, excluding usable landing propellant (kg). */
  dryMass: 22_000,
  /** Single centre engine, maximum thrust (N). */
  maxThrust: 620_000,
  /** Specific impulse (s). Mass flow = thrust / (isp * g0). */
  isp: 282,
  /** How fast the throttle *command* moves while a key is held (fraction per second). */
  throttleCommandRate: 0.9,
  /** Engine response: max change of *applied* throttle per second. */
  throttleSlewRate: 2.5,
  /** Maximum engine gimbal deflection (rad). */
  maxGimbal: deg(8),
  /** Maximum gimbal slew rate (rad/s). */
  gimbalRate: deg(30),
  /** Radius of gyration about the centre of mass (m). Inertia I = m * k^2. */
  radiusOfGyration: 9.5,
  /** Height of the centre of mass above the body base (m). Treated as constant. */
  cgHeight: 13,
  /** Height of the gimbal pivot above the body base (m). */
  gimbalHeight: 0.6,
  /** Body length from base to nose (m). */
  bodyLength: 36,
  /** Body radius (m). */
  bodyRadius: 1.7,
  /** Nozzle exit plane depth below the body base (m). */
  nozzleDepth: 1.6,
  /** Nozzle exit radius (m). */
  nozzleRadius: 0.8,
  /** Cold-gas attitude thrusters near the top of the booster: max torque (N·m). */
  rcsTorque: 160_000,
  /** Explicit, simplified angular damping coefficient (1/s). */
  angularDamping: 0.35,
  /** Drag area coefficients, Cd·A (m^2), along and across the body axis. */
  axialCdA: 8,
  lateralCdA: 95,
  legs: {
    /** Hinge position on the body (m above base, m from axis). */
    hingeHeight: 3.2,
    hingeRadius: 1.7,
    /** Hinge-to-foot length (m). */
    length: 9.6,
    /** Leg angle measured from "pointing up along the body" when fully deployed (rad). */
    deployedAngle: deg(145),
    /** Time from command to locked (s). */
    deployTime: 2.2,
  },
} as const;

/** Attitude-assist controller tuning (shared by all presets). */
export const ASSIST = {
  /** Largest tilt the player can command with left/right (rad). */
  maxTilt: deg(15),
  /** Proportional gain from attitude error to desired rotation rate (1/s). */
  rateGain: 2.0,
  /** Upper bound on commanded rotation rate (rad/s). */
  maxRate: deg(14),
  /** Gain from rotation-rate error to desired angular acceleration (1/s). */
  accelGain: 3.2,
  /** Fraction of available angular acceleration used for braking the rotation. */
  brakingFraction: 0.6,
} as const;

/** The stationary landing platform. Deck top surface is y = 0. */
export const DECK = {
  /** Physical half-width of the deck along x (m). */
  halfWidth: 40,
  /** Half-depth along z — visual only, the simulation is planar (m). */
  halfDepth: 26,
  /** Deck structure thickness below the surface (m). */
  thickness: 6,
  /** Mean sea level relative to the deck surface (m). */
  seaLevel: -5,
} as const;

/** World bounds beyond which the attempt ends as "out of bounds". */
export const BOUNDS = {
  maxAbsX: 900,
  /** Max height above the scenario start before the run is abandoned (m). */
  maxClimb: 400,
  /** Hard time limit (s). */
  maxTime: 240,
} as const;

export type DifficultyId = 'training' | 'standard' | 'challenge';

export interface Scenario {
  id: DifficultyId;
  name: string;
  /** Seeds the deterministic wind gust phases. Recorded with every attempt. */
  seed: number;
  initial: {
    /** Horizontal offset of the centre of mass from the target centre (m). */
    x: number;
    /** Height of the body base above the deck (m). */
    altitude: number;
    vx: number;
    vy: number;
    thetaDeg: number;
    /** Usable landing propellant on board (kg). */
    fuel: number;
    /** Throttle at the start of the scenario (0..1). */
    throttle: number;
  };
  wind: {
    /** Steady wind speed along +x at 400 m (m/s). Negative blows toward -x. */
    base: number;
    /** Amplitude of deterministic gusts (m/s). */
    gust: number;
  };
  /** Feet must touch within ±usableHalfWidth of the target centre (m). */
  usableHalfWidth: number;
  /** Touchdown limits. */
  limits: {
    /** Max downward speed at contact (m/s). */
    vertical: number;
    /** Max horizontal speed at contact (m/s). */
    horizontal: number;
    /** Max tilt at contact (deg). */
    tiltDeg: number;
  };
  /** Training only: legs deploy automatically below this clearance (m). */
  autoLegsAltitude: number | null;
  /** How much contextual guidance to show. */
  guidance: 'full' | 'standard' | 'minimal';
  description: string;
}

export const PRESETS: Record<DifficultyId, Scenario> = {
  training: {
    id: 'training',
    name: 'Training',
    seed: 1101,
    initial: { x: -60, altitude: 380, vx: 3, vy: -32, thetaDeg: 0, fuel: 8000, throttle: 0.45 },
    wind: { base: 1.5, gust: 0.5 },
    usableHalfWidth: 32,
    limits: { vertical: 4, horizontal: 2.5, tiltDeg: 8 },
    autoLegsAltitude: 180,
    guidance: 'full',
    description: 'Gentle start, generous propellant, automatic landing legs.',
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    seed: 2202,
    initial: { x: -110, altitude: 520, vx: 5, vy: -48, thetaDeg: 0, fuel: 5600, throttle: 0.25 },
    wind: { base: 4, gust: 1.5 },
    usableHalfWidth: 24,
    limits: { vertical: 3, horizontal: 2, tiltDeg: 6 },
    autoLegsAltitude: null,
    guidance: 'standard',
    description: 'Manual legs, a moderate lateral correction and mild wind.',
  },
  challenge: {
    id: 'challenge',
    name: 'Challenge',
    seed: 3303,
    initial: { x: 150, altitude: 640, vx: 9, vy: -60, thetaDeg: -3, fuel: 5000, throttle: 0 },
    wind: { base: -7, gust: 3 },
    usableHalfWidth: 17,
    limits: { vertical: 2.5, horizontal: 1.5, tiltDeg: 5 },
    autoLegsAltitude: null,
    guidance: 'minimal',
    description: 'Drifting away from the deck, engine off, tight propellant and strong wind.',
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['training', 'standard', 'challenge'];

/** Fuel fraction below which "Fuel low" is reported. */
export const FUEL_LOW_FRACTION = 0.2;

/** Recording sample interval in simulation steps (2 → 60 Hz). */
export const RECORD_EVERY_STEPS = 2;
