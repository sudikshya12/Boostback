import {
  BOUNDS,
  DT,
  FUEL_LOW_FRACTION,
  RECORD_EVERY_STEPS,
  SIM_VERSION,
  VEHICLE,
  type Scenario,
} from './config';
import { attitudeControl } from './attitude';
import { boundsReport, detectContact, evaluateContact, interpolateState, OUTCOME_LABEL } from './contact';
import { cgYForBaseAltitude, clearance } from './geometry';
import { clamp, toRad } from './math';
import { integrate, totalMass } from './physics';
import type {
  ControlInput,
  ControlMode,
  FlightEvent,
  FlightEventType,
  FlightReport,
  InputChange,
  Recording,
  Sample,
  SimState,
} from './types';
import { WindField } from './wind';

export interface SimulationOptions {
  controlMode?: ControlMode;
  pilot?: 'player' | 'demo';
  /** Record telemetry for replay (default true). */
  record?: boolean;
}

export function initialState(scenario: Scenario): SimState {
  const i = scenario.initial;
  return {
    t: 0,
    step: 0,
    x: i.x,
    y: cgYForBaseAltitude(i.altitude),
    vx: i.vx,
    vy: i.vy,
    theta: toRad(i.thetaDeg),
    omega: 0,
    fuel: i.fuel,
    throttleCmd: i.throttle,
    throttle: i.throttle,
    thrust: i.throttle * VEHICLE.maxThrust,
    gimbalCmd: 0,
    gimbal: 0,
    rcs: 0,
    legs: 0,
    legsCommanded: false,
    wind: 0,
    phase: i.throttle > 0 ? 'powered' : 'coasting',
    outcome: null,
  };
}

export function copyState(s: SimState, out?: SimState): SimState {
  return Object.assign(out ?? ({} as SimState), s);
}

/**
 * One landing attempt. Owns the authoritative state and advances it in fixed
 * steps. Has no knowledge of React, Three.js, wall-clock time or frame rate.
 */
export class Simulation {
  readonly scenario: Scenario;
  readonly controlMode: ControlMode;
  readonly pilot: 'player' | 'demo';
  readonly wind: WindField;
  readonly initialFuel: number;

  /** State at the end of the most recent step. */
  state: SimState;
  /** State at the end of the previous step (for render interpolation). */
  prev: SimState;
  report: FlightReport | null = null;
  readonly events: FlightEvent[] = [];

  private readonly recordEnabled: boolean;
  private readonly samples: Sample[] = [];
  private readonly inputs: InputChange[] = [];
  private lastInput: InputChange | null = null;
  private ignited = false;
  private fuelLowLogged = false;
  private enteredZone = false;
  private readonly startClearance: number;
  private readonly scratch: SimState;

  constructor(scenario: Scenario, opts: SimulationOptions = {}) {
    this.scenario = scenario;
    this.controlMode = opts.controlMode ?? 'assisted';
    this.pilot = opts.pilot ?? 'player';
    this.recordEnabled = opts.record ?? true;
    this.wind = new WindField(scenario.wind.base, scenario.wind.gust, scenario.seed);
    this.initialFuel = scenario.initial.fuel;
    this.state = initialState(scenario);
    this.state.wind = this.wind.at(0, this.state.y);
    this.prev = copyState(this.state);
    this.scratch = copyState(this.state);
    this.startClearance = clearance(this.state);
    this.ignited = this.state.throttle > 0;
    this.log('start', 'Descent begins');
    this.recordSample(this.state);
  }

  get ended(): boolean {
    return this.state.outcome !== null;
  }

  /** Advance exactly one fixed step (DT seconds). */
  step(input: ControlInput): void {
    const s = this.state;
    copyState(s, this.prev);

    if (this.ended) {
      // Time keeps running after the outcome so post-flight animation is
      // deterministic, but the vehicle state is frozen.
      s.t += DT;
      s.step += 1;
      return;
    }

    // --- Throttle command ---------------------------------------------------
    const throttleCmd =
      input.throttleSet !== null
        ? clamp(input.throttleSet, 0, 1)
        : clamp(s.throttleCmd + clamp(input.throttleRate, -1, 1) * VEHICLE.throttleCommandRate * DT, 0, 1);

    // --- Landing legs -------------------------------------------------------
    if (!s.legsCommanded) {
      if (input.deployLegs) {
        s.legsCommanded = true;
        this.log('legsCommanded', 'Legs deploy commanded');
      } else if (
        this.scenario.autoLegsAltitude !== null &&
        clearance(s) <= this.scenario.autoLegsAltitude
      ) {
        s.legsCommanded = true;
        this.log('legsAuto', 'Legs deployed automatically');
      }
    }
    if (s.legsCommanded && s.legs < 1) {
      s.legs = Math.min(1, s.legs + DT / VEHICLE.legs.deployTime);
      if (s.legs >= 1) this.log('legsLocked', 'Legs locked');
    }

    // --- Attitude control ---------------------------------------------------
    const mass = totalMass(s.fuel);
    const thrustNow = s.fuel > 0 ? s.throttle * VEHICLE.maxThrust : 0;
    const att = attitudeControl(s.theta, s.omega, thrustNow, mass, input.tilt, this.controlMode);

    // --- Physics ------------------------------------------------------------
    const wind = this.wind.at(s.t, s.y);
    const fuelBefore = s.fuel;
    integrate(s, { throttleCmd, gimbalCmd: att.gimbalCmd, rcs: att.rcs }, wind, DT);

    // --- Events -------------------------------------------------------------
    if (!this.ignited && s.thrust > 0) {
      this.ignited = true;
      this.log('ignition', 'Engine ignition');
    }
    if (!this.fuelLowLogged && s.fuel <= this.initialFuel * FUEL_LOW_FRACTION) {
      this.fuelLowLogged = true;
      this.log('fuelLow', 'Fuel low');
    }
    if (fuelBefore > 0 && s.fuel <= 0) this.log('fuelOut', 'Propellant depleted');
    s.phase = s.fuel <= 0 ? 'unpowered' : s.thrust > 0 ? 'powered' : 'coasting';

    this.recordInput(s.t, throttleCmd, input.tilt, s.legsCommanded);

    // --- Contact (swept between previous and current step) ------------------
    const ev = detectContact(this.prev, s);
    if (ev) {
      const c = interpolateState(this.prev, s, ev.fraction, this.scratch);
      const report = evaluateContact(c, ev, this.scenario, this.initialFuel);
      // Snap the authoritative state to the contact pose so nothing passes
      // through the deck, then freeze it.
      Object.assign(s, { t: c.t, x: c.x, y: c.y, theta: c.theta, legs: c.legs, fuel: c.fuel });
      s.vx = c.vx;
      s.vy = c.vy;
      s.omega = c.omega;
      this.finish(report, ev.surface === 'ocean' ? 'impact' : report.outcome === 'landed' ? 'touchdown' : 'impact');
      return;
    }

    const clr = clearance(s);
    if (!this.enteredZone && Math.abs(s.x) <= this.scenario.usableHalfWidth && clr < 300) {
      this.enteredZone = true;
      this.log('enteredZone', 'Over the landing zone');
    }
    if (
      Math.abs(s.x) > BOUNDS.maxAbsX ||
      clr > this.startClearance + BOUNDS.maxClimb ||
      s.t > BOUNDS.maxTime
    ) {
      this.finish(boundsReport(s, this.initialFuel), 'outOfBounds');
      return;
    }

    if (s.step % RECORD_EVERY_STEPS === 0) this.recordSample(s);
  }

  private finish(report: FlightReport, type: FlightEventType) {
    const s = this.state;
    s.outcome = report.outcome;
    s.phase = 'ended';
    s.throttle = 0;
    s.throttleCmd = 0;
    s.thrust = 0;
    s.rcs = 0;
    this.report = report;
    this.log(type, OUTCOME_LABEL[report.outcome]);
    this.recordSample(s);
  }

  private log(type: FlightEventType, label: string) {
    this.events.push({ t: this.state.t, type, label });
  }

  private recordSample(s: SimState) {
    if (!this.recordEnabled) return;
    this.samples.push({
      t: s.t,
      x: s.x,
      y: s.y,
      vx: s.vx,
      vy: s.vy,
      th: s.theta,
      om: s.omega,
      fuel: s.fuel,
      thr: s.throttle,
      thrCmd: s.throttleCmd,
      gim: s.gimbal,
      rcs: s.rcs,
      legs: s.legs,
      wind: s.wind,
      alt: clearance(s),
    });
  }

  private recordInput(t: number, throttleCmd: number, tilt: number, legs: boolean) {
    if (!this.recordEnabled) return;
    const last = this.lastInput;
    if (
      !last ||
      Math.abs(last.throttleCmd - throttleCmd) >= 0.02 ||
      Math.abs(last.tilt - tilt) >= 0.05 ||
      last.legs !== legs
    ) {
      const change = { t, throttleCmd, tilt, legs };
      this.inputs.push(change);
      this.lastInput = change;
    }
  }

  /** Build a self-contained recording of this attempt. */
  getRecording(id = makeId()): Recording {
    return {
      format: 'boostback-recording',
      formatVersion: 1,
      simVersion: SIM_VERSION,
      id,
      createdAt: new Date().toISOString(),
      scenarioId: this.scenario.id,
      scenario: this.scenario,
      controlMode: this.controlMode,
      seed: this.scenario.seed,
      pilot: this.pilot,
      sampleInterval: DT * RECORD_EVERY_STEPS,
      samples: this.samples.slice(),
      inputs: this.inputs.slice(),
      events: this.events.slice(),
      report: this.report,
    };
  }
}

export function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Key that identifies attempts which can be fairly compared (ghost, best results). */
export function compatibilityKey(scenario: Scenario, mode: ControlMode): string {
  return `${scenario.id}:${scenario.seed}:${mode}:${SIM_VERSION}`;
}

/**
 * Fixed-timestep accumulator. Converts variable frame times into a whole
 * number of simulation steps, and reports the leftover fraction for render
 * interpolation. Large frame gaps are clamped so a stall cannot advance the
 * simulation by several seconds at once.
 */
export class FixedStepper {
  accumulator = 0;
  /** Total real time discarded because frames were too slow (s). */
  dropped = 0;

  constructor(
    readonly dt = DT,
    readonly maxFrame = 0.1,
    readonly maxStepsPerFrame = 14,
  ) {}

  advance(frameDt: number, step: () => void): { steps: number; alpha: number } {
    const d = Math.min(Math.max(frameDt, 0), this.maxFrame);
    this.dropped += Math.max(0, frameDt - d);
    this.accumulator += d;
    let steps = 0;
    while (this.accumulator >= this.dt - 1e-12 && steps < this.maxStepsPerFrame) {
      step();
      this.accumulator -= this.dt;
      steps++;
    }
    if (this.accumulator >= this.dt) {
      // Still behind: drop the backlog instead of spiralling.
      this.dropped += this.accumulator;
      this.accumulator = 0;
    }
    if (this.accumulator < 0) this.accumulator = 0;
    return { steps, alpha: this.accumulator / this.dt };
  }

  reset() {
    this.accumulator = 0;
    this.dropped = 0;
  }
}
