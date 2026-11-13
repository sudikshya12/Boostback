import type { DifficultyId, Scenario } from './config';

export type ControlMode = 'assisted' | 'direct';

/** Player (or demo controller) input sampled once per simulation step. */
export interface ControlInput {
  /** -1..1: hold-to-change throttle command (W/S, Up/Down). */
  throttleRate: number;
  /** Absolute throttle command 0..1 (touch slider, demo controller). Overrides throttleRate when not null. */
  throttleSet: number | null;
  /** -1..1. Assisted mode: fraction of max commanded tilt. Direct mode: fraction of max gimbal. */
  tilt: number;
  /** Latched request to deploy the landing legs. Legs cannot be retracted. */
  deployLegs: boolean;
}

export const NEUTRAL_INPUT: ControlInput = Object.freeze({
  throttleRate: 0,
  throttleSet: null,
  tilt: 0,
  deployLegs: false,
}) as ControlInput;

export type FlightPhase = 'coasting' | 'powered' | 'unpowered' | 'ended';

export type OutcomeKind =
  | 'landed'
  | 'hardLanding'
  | 'lateralSpeed'
  | 'excessiveTilt'
  | 'legsNotDeployed'
  | 'legsDeploying'
  | 'outsideZone'
  | 'oceanImpact'
  | 'bodyCollision'
  | 'outOfBounds';

export interface SimState {
  /** Simulation time (s). */
  t: number;
  /** Number of fixed steps taken. */
  step: number;
  /** Centre-of-mass position (m). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Tilt from vertical (rad), positive = nose toward +x. */
  theta: number;
  omega: number;
  /** Remaining usable propellant (kg). Never negative. */
  fuel: number;
  /** Commanded throttle 0..1. */
  throttleCmd: number;
  /** Applied (actual) throttle 0..1, after engine response and fuel limits. */
  throttle: number;
  /** Thrust actually produced during the last step (N). */
  thrust: number;
  /** Commanded / applied gimbal (rad). */
  gimbalCmd: number;
  gimbal: number;
  /** Normalised attitude-thruster torque -1..1 (positive = clockwise). */
  rcs: number;
  /** Landing-leg deployment progress 0..1 (1 = locked). */
  legs: number;
  legsCommanded: boolean;
  /** Horizontal wind at the vehicle (m/s). */
  wind: number;
  phase: FlightPhase;
  outcome: OutcomeKind | null;
}

export type ContactPointId =
  | 'leftFoot'
  | 'rightFoot'
  | 'nozzleLeft'
  | 'nozzleRight'
  | 'baseLeft'
  | 'baseRight'
  | 'midLeft'
  | 'midRight'
  | 'noseLeft'
  | 'noseRight';

export interface TouchdownCheck {
  id: 'vertical' | 'horizontal' | 'tilt' | 'legs' | 'zone';
  label: string;
  value: number;
  limit: number;
  unit: string;
  pass: boolean;
}

export interface FlightReport {
  outcome: OutcomeKind;
  /** Every failed condition, primary first. */
  failures: OutcomeKind[];
  /** Simulation time of contact / termination (s). */
  t: number;
  contactPoint: ContactPointId | null;
  surface: 'deck' | 'deckEdge' | 'ocean' | null;
  vx: number;
  vy: number;
  tiltDeg: number;
  omegaDeg: number;
  legs: number;
  /** Horizontal distance of the centre of mass from the target centre at contact (m). */
  distanceFromCenter: number;
  /** World x of each foot at contact (m). */
  feetX: [number, number];
  fuelRemaining: number;
  fuelFraction: number;
  checks: TouchdownCheck[];
}

export type FlightEventType =
  | 'start'
  | 'ignition'
  | 'legsCommanded'
  | 'legsAuto'
  | 'legsLocked'
  | 'fuelLow'
  | 'fuelOut'
  | 'enteredZone'
  | 'touchdown'
  | 'impact'
  | 'outOfBounds';

export interface FlightEvent {
  t: number;
  type: FlightEventType;
  label: string;
}

/** One recorded telemetry sample. Short keys keep stored recordings compact. */
export interface Sample {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  th: number;
  om: number;
  fuel: number;
  thr: number;
  thrCmd: number;
  gim: number;
  rcs: number;
  legs: number;
  wind: number;
  /** Clearance of the lowest point above the deck (m). */
  alt: number;
}

export interface InputChange {
  t: number;
  throttleCmd: number;
  tilt: number;
  legs: boolean;
}

export interface Recording {
  format: 'boostback-recording';
  formatVersion: 1;
  simVersion: string;
  id: string;
  createdAt: string;
  scenarioId: DifficultyId;
  scenario: Scenario;
  controlMode: ControlMode;
  seed: number;
  /** Who flew it. */
  pilot: 'player' | 'demo';
  sampleInterval: number;
  samples: Sample[];
  inputs: InputChange[];
  events: FlightEvent[];
  report: FlightReport | null;
}
