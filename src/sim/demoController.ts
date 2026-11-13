import { ASSIST, GRAVITY, VEHICLE, type Scenario } from './config';
import { clearance } from './geometry';
import { clamp } from './math';
import { totalMass } from './physics';
import type { ControlInput, SimState } from './types';

const LATERAL_ACCEL = GRAVITY * Math.tan((10 * Math.PI) / 180);

/**
 * "Demo controller" — a simple educational landing controller.
 *
 * It is NOT an optimal or real-world guidance law. It produces the same
 * ControlInput a player would, so it is bound by identical physics, actuator
 * limits, propellant and collision rules. It never writes to the state.
 *
 * Approach (all heuristics):
 *  - Vertical: track a descent-speed profile v(h) = 1.2 + sqrt(2·a·h) using a
 *    fraction of the available deceleration, but descend slowly enough to leave
 *    time for the lateral correction. Throttle = mass·(g + a_desired)/T_max.
 *  - Lateral: a damped proportional-derivative law on horizontal offset and
 *    speed gives a desired sideways acceleration, converted to a tilt command
 *    for the attitude assist (the same assist the player uses).
 *  - Legs: deploy below 300 m.
 *  - Final metres: tilt is faded out so the booster arrives upright.
 *
 * Tested on the three built-in presets (see presets.test.ts). It can and will
 * fail outside those conditions, e.g. with too little propellant.
 */
export class DemoController {
  constructor(private readonly scenario: Scenario) {}

  input(s: SimState): ControlInput {
    const clr = clearance(s);
    const mass = totalMass(s.fuel);
    const cos = Math.cos(s.theta);
    const aNet = (VEHICLE.maxThrust * cos) / mass - GRAVITY;

    // ---- Lateral: damped PD on position → desired horizontal acceleration ----
    const ax = Math.abs(s.x);
    const axDes = clamp(-0.065 * s.x - 0.5 * s.vx, -LATERAL_ACCEL, LATERAL_ACCEL);
    let tilt = Math.atan2(axDes, GRAVITY);
    tilt = clamp(tilt, -ASSIST.maxTilt * 0.9, ASSIST.maxTilt * 0.9);
    // Keep only small corrections in the final metres so the booster arrives upright.
    if (clr < 14) tilt = clamp(tilt, -ASSIST.maxTilt * 0.2, ASSIST.maxTilt * 0.2);

    // ---- Vertical: descent-speed profile → throttle ---------------------------
    const brakeA = 0.4 * Math.max(aNet, 0.5);
    const touchdownSpeed = Math.min(1.2, this.scenario.limits.vertical * 0.5);
    // Square-root braking profile, capped by a linear one near the deck where the
    // square root becomes too steep to follow with a lagging engine.
    const profile = Math.min(
      touchdownSpeed + Math.sqrt(2 * brakeA * Math.max(clr - 0.5, 0)),
      touchdownSpeed + 0.6 * Math.max(clr - 0.5, 0),
    );
    // Leave time for the lateral correction: a smooth function of the remaining offset.
    const timeNeeded = 0.16 * ax + 0.7 * Math.abs(s.vx);
    const lateralLimit = Math.max(4, clr / Math.max(timeNeeded, 1));
    const onProfile = profile <= lateralLimit;
    const vyMag = Math.min(profile, lateralLimit);
    const vyDes = -vyMag;
    const ff = onProfile ? brakeA * clamp(-s.vy / vyMag, 0, 1.5) : 0;
    const ayDes = ff + 1.6 * (vyDes - s.vy);
    const throttle = (mass * (GRAVITY + ayDes)) / (VEHICLE.maxThrust * Math.max(cos, 0.5));

    return {
      throttleRate: 0,
      throttleSet: clamp(throttle, 0, 1),
      tilt: tilt / ASSIST.maxTilt,
      deployLegs: clr < 300,
    };
  }
}
