import {
  activeGuidance,
  clearance,
  compatibilityKey,
  DemoController,
  FixedStepper,
  GuidanceTracker,
  lerp,
  PRESETS,
  recordingDuration,
  REPLAY_TAIL,
  restingPose,
  sampleAt,
  Simulation,
  type ControlMode,
  type FlightEvent,
  type GuidanceId,
  type OutcomeKind,
  type Recording,
  type Sample,
  type Scenario,
} from '../sim';
import { InputController } from './input';

export type RuntimeMode = 'preview' | 'flying' | 'paused' | 'ended' | 'replay';

/** Everything the renderer and HUD need for one vehicle, already interpolated. */
export interface VehicleView {
  t: number;
  x: number;
  y: number;
  theta: number;
  vx: number;
  vy: number;
  legs: number;
  throttle: number;
  throttleCmd: number;
  gimbal: number;
  rcs: number;
  fuel: number;
  fuelFraction: number;
  clearance: number;
  wind: number;
  legsCommanded: boolean;
  outcome: OutcomeKind | null;
  /** Seconds since the outcome (0 while flying). */
  tSinceEnd: number;
  surface: 'deck' | 'deckEdge' | 'ocean' | null;
}

export interface ReplayState {
  rec: Recording;
  time: number;
  duration: number;
  playing: boolean;
  speed: number;
}

export interface RuntimeListeners {
  onEnd?: (sim: Simulation) => void;
  onMessage?: (id: GuidanceId | null) => void;
  onEvent?: (ev: FlightEvent) => void;
  onReplayTick?: (time: number, playing: boolean) => void;
}

function emptyView(): VehicleView {
  return {
    t: 0, x: 0, y: 0, theta: 0, vx: 0, vy: 0, legs: 0, throttle: 0, throttleCmd: 0, gimbal: 0, rcs: 0,
    fuel: 0, fuelFraction: 1, clearance: 0, wind: 0, legsCommanded: false, outcome: null, tSinceEnd: 0, surface: null,
  };
}

const scratchSample = {} as Sample;

/**
 * The game loop glue. Owns the active Simulation, advances it with a fixed-step
 * accumulator from frame times, and exposes interpolated views for rendering.
 * React never re-renders per frame: the scene and HUD read `runtime.view`
 * inside their own animation callbacks.
 */
export class GameRuntime {
  scenario: Scenario = PRESETS.standard;
  controlMode: ControlMode = 'assisted';
  sim: Simulation = new Simulation(this.scenario, { record: false });
  mode: RuntimeMode = 'preview';
  readonly input = new InputController();
  readonly stepper = new FixedStepper();
  demo: DemoController | null = null;
  message: GuidanceId | null = null;
  readonly view: VehicleView = emptyView();
  /** Faint previous-attempt vehicle; null when hidden. */
  ghostRec: Recording | null = null;
  readonly ghostView: VehicleView = emptyView();
  ghostVisible = false;
  replay: ReplayState | null = null;
  listeners: RuntimeListeners = {};
  /** Increments on every new attempt so the renderer can reset effects. */
  attempt = 0;

  private tracker = new GuidanceTracker();
  private eventCursor = 0;

  /** Show a scenario's starting pose without running it (ready screen). */
  load(scenario: Scenario, controlMode: ControlMode) {
    this.scenario = scenario;
    this.controlMode = controlMode;
    this.sim = new Simulation(scenario, { controlMode, record: false });
    this.mode = 'preview';
    this.replay = null;
    this.demo = null;
    this.resetTransient();
    this.computeView(1);
    this.applyTitlePose();
  }

  /**
   * The title screen shows a staged, decorative pose: the booster on final
   * approach above the deck. It is not the scenario's start state, and the
   * simulation is not running while it is shown.
   */
  private applyTitlePose() {
    const v = this.view;
    Object.assign(v, { x: 6, theta: -0.035, vx: -1, vy: -6, legs: 1, legsCommanded: true, throttle: 0.55, throttleCmd: 0.55, gimbal: 0.01 });
    v.y = 0;
    v.y = 70 - clearance(v);
    v.clearance = 70;
  }

  /** Begin a new attempt of the current scenario. */
  start(opts: { demo?: boolean } = {}) {
    this.sim = new Simulation(this.scenario, {
      controlMode: opts.demo ? 'assisted' : this.controlMode,
      pilot: opts.demo ? 'demo' : 'player',
    });
    this.demo = opts.demo ? new DemoController(this.scenario) : null;
    this.mode = 'flying';
    this.replay = null;
    this.resetTransient();
    this.attempt++;
    this.computeView(1);
  }

  private resetTransient() {
    this.stepper.reset();
    this.input.clear();
    this.tracker.reset();
    this.eventCursor = 0;
    this.setMessage(null);
    this.ghostVisible = false;
  }

  pause() {
    if (this.mode === 'flying') {
      this.mode = 'paused';
      this.input.clear();
      this.stepper.reset();
    }
  }

  resume() {
    if (this.mode === 'paused') {
      this.mode = this.sim.ended ? 'ended' : 'flying';
      this.stepper.reset();
    }
  }

  /** Only a ghost from a compatible attempt (same preset, seed, control mode, sim version) is accepted. */
  setGhost(rec: Recording | null) {
    if (rec && compatibilityKey(rec.scenario, rec.controlMode) !== compatibilityKey(this.scenario, this.controlMode)) {
      rec = null;
    }
    this.ghostRec = rec;
  }

  startReplay(rec: Recording) {
    this.replay = {
      rec,
      time: 0,
      duration: recordingDuration(rec) + (rec.report ? REPLAY_TAIL : 0),
      playing: true,
      speed: 1,
    };
    this.mode = 'replay';
    this.input.clear();
    this.setMessage(null);
    this.ghostVisible = false;
    this.attempt++;
    this.computeReplayView();
  }

  seekReplay(time: number) {
    if (!this.replay) return;
    this.replay.time = Math.min(Math.max(0, time), this.replay.duration);
    this.computeReplayView();
    this.listeners.onReplayTick?.(this.replay.time, this.replay.playing);
  }

  /** Advance by one rendered frame of `frameDt` real seconds. */
  update(frameDt: number) {
    if (this.mode === 'replay') return this.updateReplay(frameDt);
    if (this.mode === 'paused' || this.mode === 'preview') return;

    const input = this.input.sample();
    const { alpha } = this.stepper.advance(frameDt, () => {
      this.sim.step(this.demo ? this.demo.input(this.sim.state) : input);
    });
    this.computeView(alpha);

    const evs = this.sim.events;
    while (this.eventCursor < evs.length) this.listeners.onEvent?.(evs[this.eventCursor++]);

    if (this.mode === 'flying') {
      const s = this.sim.state;
      const msg = this.tracker.update(s.t, activeGuidance(s, this.view.clearance, this.scenario));
      this.setMessage(msg);
      if (this.sim.ended) {
        this.mode = 'ended';
        this.setMessage(null);
        this.listeners.onEnd?.(this.sim);
      }
    }
    this.computeGhost();
  }

  private setMessage(id: GuidanceId | null) {
    if (id !== this.message) {
      this.message = id;
      this.listeners.onMessage?.(id);
    }
  }

  private computeView(alpha: number) {
    const sim = this.sim;
    const a = sim.prev;
    const b = sim.state;
    const v = this.view;
    const k = sim.ended ? 1 : alpha;
    v.t = lerp(a.t, b.t, k);
    v.x = lerp(a.x, b.x, k);
    v.y = lerp(a.y, b.y, k);
    v.theta = lerp(a.theta, b.theta, k);
    v.vx = b.vx;
    v.vy = b.vy;
    v.legs = lerp(a.legs, b.legs, k);
    v.throttle = b.throttle;
    v.throttleCmd = b.throttleCmd;
    v.gimbal = b.gimbal;
    v.rcs = b.rcs;
    v.fuel = b.fuel;
    v.fuelFraction = b.fuel / sim.initialFuel;
    v.wind = b.wind;
    v.legsCommanded = b.legsCommanded;
    v.outcome = b.outcome;
    v.surface = sim.report?.surface ?? null;
    v.tSinceEnd = sim.report ? Math.max(0, b.t - sim.report.t) : 0;
    if (sim.report) {
      const p = restingPose(b, sim.report.outcome, v.tSinceEnd, sim.report.vx, sim.report.surface);
      v.x = p.x;
      v.y = p.y;
      v.theta = p.theta;
    }
    v.clearance = clearance(v);
  }

  private computeGhost() {
    const rec = this.ghostRec;
    this.ghostVisible = false;
    if (!rec || this.mode === 'replay' || this.mode === 'preview') return;
    const end = recordingDuration(rec);
    const t = this.view.t;
    if (t > end + REPLAY_TAIL) return;
    fillFromSample(this.ghostView, sampleAt(rec.samples, Math.min(t, end), scratchSample), rec, t);
    // Hide the ghost near touchdown so it never clutters the landing area.
    if (this.view.clearance < 30 || this.ghostView.clearance < 25) return;
    this.ghostVisible = true;
  }

  private updateReplay(frameDt: number) {
    const r = this.replay!;
    if (r.playing) {
      r.time += Math.min(frameDt, 0.1) * r.speed;
      if (r.time >= r.duration) {
        r.time = r.duration;
        r.playing = false;
      }
      this.listeners.onReplayTick?.(r.time, r.playing);
    }
    this.computeReplayView();
  }

  private computeReplayView() {
    const r = this.replay!;
    const end = recordingDuration(r.rec);
    fillFromSample(this.view, sampleAt(r.rec.samples, Math.min(r.time, end), scratchSample), r.rec, r.time);
  }
}

/** Fill a view from a recorded sample, applying the post-outcome resting pose. */
function fillFromSample(v: VehicleView, s: Sample, rec: Recording, time: number) {
  const report = rec.report;
  const ended = !!report && time >= report.t;
  v.t = time;
  v.x = s.x;
  v.y = s.y;
  v.theta = s.th;
  v.vx = s.vx;
  v.vy = s.vy;
  v.legs = s.legs;
  v.throttle = ended ? 0 : s.thr;
  v.throttleCmd = ended ? 0 : s.thrCmd;
  v.gimbal = s.gim;
  v.rcs = ended ? 0 : s.rcs;
  v.fuel = s.fuel;
  v.fuelFraction = s.fuel / rec.scenario.initial.fuel;
  v.wind = s.wind;
  v.legsCommanded = s.legs > 0;
  v.outcome = ended ? report!.outcome : null;
  v.surface = ended ? report!.surface : null;
  v.tSinceEnd = ended ? time - report!.t : 0;
  if (ended) {
    const p = restingPose({ x: s.x, y: s.y, theta: s.th, legs: s.legs }, report!.outcome, v.tSinceEnd, report!.vx, report!.surface);
    v.x = p.x;
    v.y = p.y;
    v.theta = p.theta;
  }
  v.clearance = clearance(v);
}

export const runtime = new GameRuntime();
