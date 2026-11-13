import { AIR_DENSITY, G0, GRAVITY, VEHICLE } from './config';
import { approach, clamp } from './math';
import { GIMBAL_ARM, momentOfInertia } from './attitude';
import type { SimState } from './types';

export function totalMass(fuel: number): number {
  return VEHICLE.dryMass + fuel;
}

/** Propellant mass flow at a given thrust (kg/s). */
export function massFlow(thrust: number): number {
  return thrust / (VEHICLE.isp * G0);
}

export interface Actuation {
  throttleCmd: number;
  gimbalCmd: number;
  rcs: number;
}

export interface Forces {
  ax: number;
  ay: number;
  alpha: number;
}

/**
 * Advance the rigid-body state by one fixed step, in place.
 *
 * Integration is semi-implicit (symplectic) Euler: velocities are updated from
 * forces first, then positions from the NEW velocities. It is cheap, stable for
 * this stiffness at dt = 1/120 s, and fully deterministic.
 *
 * Contact is not handled here; see contact.ts.
 */
export function integrate(s: SimState, act: Actuation, wind: number, dt: number): void {
  // --- Engine response -----------------------------------------------------
  s.throttleCmd = clamp(act.throttleCmd, 0, 1);
  s.throttle = approach(s.throttle, s.throttleCmd, VEHICLE.throttleSlewRate * dt);
  s.gimbalCmd = clamp(act.gimbalCmd, -VEHICLE.maxGimbal, VEHICLE.maxGimbal);
  s.gimbal = approach(s.gimbal, s.gimbalCmd, VEHICLE.gimbalRate * dt);
  s.rcs = clamp(act.rcs, -1, 1);

  // --- Thrust and propellant --------------------------------------------------
  // Simplification: continuous throttle down to zero and instant re-ignition.
  let thrust = s.fuel > 0 ? s.throttle * VEHICLE.maxThrust : 0;
  const burn = massFlow(thrust) * dt;
  if (burn > s.fuel) {
    // Only part of this step had propellant: scale thrust to what was available.
    thrust *= burn > 0 ? s.fuel / burn : 0;
    s.fuel = 0;
  } else {
    s.fuel -= burn;
  }
  s.thrust = thrust;
  // Mass at the end of the step (the difference within one step is negligible).
  const m = totalMass(s.fuel);

  // --- Forces -------------------------------------------------------------------
  const f = computeForces(s, thrust, m, wind);
  s.wind = wind;

  // --- Semi-implicit Euler ------------------------------------------------------
  s.vx += f.ax * dt;
  s.vy += f.ay * dt;
  s.omega += f.alpha * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.theta += s.omega * dt;
  s.t += dt;
  s.step += 1;
}

/** Accelerations for the current state. Exported for tests and documentation. */
export function computeForces(
  s: Pick<SimState, 'vx' | 'vy' | 'theta' | 'omega' | 'gimbal' | 'rcs'>,
  thrust: number,
  mass: number,
  wind: number,
): Forces {
  const st = Math.sin(s.theta);
  const ct = Math.cos(s.theta);

  // Thrust acts along the body axis rotated by the gimbal angle.
  const ta = s.theta + s.gimbal;
  let fx = thrust * Math.sin(ta);
  let fy = thrust * Math.cos(ta) - mass * GRAVITY;

  // Simplified quadratic drag relative to the air, split into axial and lateral
  // components because the body is long and thin.
  const rvx = s.vx - wind;
  const rvy = s.vy;
  const va = rvx * st + rvy * ct; // along body up-axis (s, c)
  const vn = rvx * ct - rvy * st; // along body right-axis (c, -s)
  const qa = 0.5 * AIR_DENSITY * VEHICLE.axialCdA * Math.abs(va) * va;
  const qn = 0.5 * AIR_DENSITY * VEHICLE.lateralCdA * Math.abs(vn) * vn;
  fx -= qa * st + qn * ct;
  fy -= qa * ct - qn * st;

  // Torque (positive = clockwise = toward +theta). A gimballed thrust applied at
  // the engine, GIMBAL_ARM below the centre of mass, gives -T·L·sin(gimbal).
  const torque = -thrust * GIMBAL_ARM * Math.sin(s.gimbal) + s.rcs * VEHICLE.rcsTorque;
  const I = momentOfInertia(mass);
  const alpha = torque / I - VEHICLE.angularDamping * s.omega;

  return { ax: fx / mass, ay: fy / mass, alpha };
}
