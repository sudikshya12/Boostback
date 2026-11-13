import { VEHICLE } from './config';
import type { ContactPointId, SimState } from './types';

/**
 * Body frame: origin at the centre of the body base, +y along the body axis
 * toward the nose, +x toward the vehicle's right (screen right when upright).
 */
export interface LocalPoint {
  x: number;
  y: number;
}

const L = VEHICLE.legs;
const R = VEHICLE.bodyRadius;

/** Foot position in the body frame for deployment progress p (0 stowed .. 1 locked). */
export function footLocal(p: number, side: -1 | 1): LocalPoint {
  const phi = p * L.deployedAngle;
  return {
    x: side * (L.hingeRadius + L.length * Math.sin(phi)),
    y: L.hingeHeight + L.length * Math.cos(phi),
  };
}

/** Distance between foot pads when locked (m). */
export const DEPLOYED_FOOT_OFFSET = footLocal(1, 1).x;
/** How far below the body base the feet sit when locked (m). */
export const DEPLOYED_FOOT_DEPTH = -footLocal(1, 1).y;

export interface ContactPoint {
  id: ContactPointId;
  local: LocalPoint;
  isFoot: boolean;
}

/** All points used for contact detection, matching the rendered silhouette. */
export function contactPoints(legs: number): ContactPoint[] {
  const nz = VEHICLE.nozzleRadius;
  const nd = -VEHICLE.nozzleDepth;
  const top = VEHICLE.bodyLength;
  return [
    { id: 'leftFoot', local: footLocal(legs, -1), isFoot: true },
    { id: 'rightFoot', local: footLocal(legs, 1), isFoot: true },
    { id: 'nozzleLeft', local: { x: -nz, y: nd }, isFoot: false },
    { id: 'nozzleRight', local: { x: nz, y: nd }, isFoot: false },
    { id: 'baseLeft', local: { x: -R, y: 0 }, isFoot: false },
    { id: 'baseRight', local: { x: R, y: 0 }, isFoot: false },
    { id: 'midLeft', local: { x: -R, y: top / 2 }, isFoot: false },
    { id: 'midRight', local: { x: R, y: top / 2 }, isFoot: false },
    { id: 'noseLeft', local: { x: -R, y: top }, isFoot: false },
    { id: 'noseRight', local: { x: R, y: top }, isFoot: false },
  ];
}

/** Transform a body-frame point to world coordinates for a given pose. */
export function toWorld(
  pose: Pick<SimState, 'x' | 'y' | 'theta'>,
  p: LocalPoint,
  out: LocalPoint = { x: 0, y: 0 },
): LocalPoint {
  const ly = p.y - VEHICLE.cgHeight;
  const c = Math.cos(pose.theta);
  const s = Math.sin(pose.theta);
  // body right = (c, -s), body up = (s, c)
  out.x = pose.x + p.x * c + ly * s;
  out.y = pose.y - p.x * s + ly * c;
  return out;
}

const tmp: LocalPoint = { x: 0, y: 0 };

/** Height of the lowest point of the vehicle above the deck plane (m). */
export function clearance(pose: Pick<SimState, 'x' | 'y' | 'theta' | 'legs'>): number {
  let min = Infinity;
  for (const cp of contactPoints(pose.legs)) {
    const w = toWorld(pose, cp.local, tmp);
    if (w.y < min) min = w.y;
  }
  return min;
}

/** World x positions of both feet. */
export function feetWorldX(pose: Pick<SimState, 'x' | 'y' | 'theta' | 'legs'>): [number, number] {
  const l = toWorld(pose, footLocal(pose.legs, -1));
  const r = toWorld(pose, footLocal(pose.legs, 1));
  return [l.x, r.x];
}

/** Centre-of-mass world y for an upright vehicle whose body base is at `altitude`. */
export function cgYForBaseAltitude(altitude: number): number {
  return altitude + VEHICLE.cgHeight;
}
