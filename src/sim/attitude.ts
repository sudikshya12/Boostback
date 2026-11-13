import { ASSIST, VEHICLE } from './config';
import { clamp } from './math';
import type { ControlMode } from './types';

export interface AttitudeCommand {
  /** Commanded engine gimbal (rad). */
  gimbalCmd: number;
  /** Normalised cold-gas thruster torque -1..1. */
  rcs: number;
}

export function momentOfInertia(mass: number): number {
  return mass * VEHICLE.radiusOfGyration ** 2;
}

/** Lever arm from centre of mass to gimbal pivot (m). */
export const GIMBAL_ARM = VEHICLE.cgHeight - VEHICLE.gimbalHeight;

/**
 * Attitude assist ("fly-by-wire" style, simplified).
 *
 * The player's left/right input sets a DESIRED tilt, bounded by ASSIST.maxTilt.
 * Releasing the input commands upright. The controller is a cascaded loop:
 *
 *   attitude error  →  desired rotation rate (limited so the vehicle can stop in time)
 *   rate error      →  desired angular acceleration  →  torque
 *
 * Torque is produced first by gimballing the engine (only effective while it is
 * producing thrust) and any remainder by small cold-gas thrusters, which are
 * deliberately weak. With the engine off the vehicle turns slowly.
 *
 * Direct mode skips the controller: input maps straight to gimbal angle and
 * thruster torque.
 */
export function attitudeControl(
  theta: number,
  omega: number,
  thrust: number,
  mass: number,
  tiltInput: number,
  mode: ControlMode,
): AttitudeCommand {
  const input = clamp(tiltInput, -1, 1);
  if (mode === 'direct') {
    // Positive input should rotate the nose toward +x (positive torque), which
    // needs a negative gimbal deflection (see config.ts sign conventions).
    return { gimbalCmd: -input * VEHICLE.maxGimbal, rcs: input };
  }

  const I = momentOfInertia(mass);
  const sinMax = Math.sin(VEHICLE.maxGimbal);
  const alphaGimbal = (thrust * GIMBAL_ARM * sinMax) / I;
  const alphaRcs = VEHICLE.rcsTorque / I;
  const alphaAvail = alphaGimbal + alphaRcs;

  const target = input * ASSIST.maxTilt;
  const err = target - theta;
  const absErr = Math.abs(err);
  const rateLimit = Math.min(
    ASSIST.maxRate,
    ASSIST.rateGain * absErr,
    Math.sqrt(2 * ASSIST.brakingFraction * alphaAvail * absErr),
  );
  const omegaDes = Math.sign(err) * rateLimit;
  const alphaDes = ASSIST.accelGain * (omegaDes - omega);
  const torque = alphaDes * I;

  let gimbalCmd = 0;
  let gimbalTorque = 0;
  if (thrust > 1) {
    const s = clamp(-torque / (thrust * GIMBAL_ARM), -sinMax, sinMax);
    gimbalCmd = Math.asin(s);
    gimbalTorque = -thrust * GIMBAL_ARM * s;
  }
  let rcs = clamp((torque - gimbalTorque) / VEHICLE.rcsTorque, -1, 1);
  if (Math.abs(rcs) < 0.03) rcs = 0;
  return { gimbalCmd, rcs };
}
