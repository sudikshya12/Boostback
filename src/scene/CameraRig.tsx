import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { DECK } from '../sim';
import { runtime } from '../game/runtime';
import { screenProbe } from './probe';

export type CameraMode = 'hero' | 'play' | 'replaySide' | 'replayCinematic';

const PLAY_FOV = 30;
const HERO_FOV = 30;
const MIN_DIST = 115;
const MAX_DIST = 470;

interface Framing {
  cx: number;
  cy: number;
  dist: number;
  fov: number;
  /** Camera height above the framing centre as a fraction of distance (gives a gentle downward look). */
  lift: number;
  /** Horizontal camera orbit (radians) — zero keeps the view strictly side-on. */
  yaw: number;
}

const tmp = new THREE.Vector3();

/**
 * Side-on framing that keeps the vehicle (and, when feasible, the deck) in view.
 * The camera never feeds back into the simulation.
 */
function sideFraming(aspect: number, hero: boolean, time: number, reducedMotion: boolean): Framing {
  const v = runtime.view;
  const fov = hero ? HERO_FOV : PLAY_FOV;
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const tanH = tanV * aspect;

  // Vehicle box (CG-relative): feet to nose plus margin.
  const r = { minX: v.x - 14, maxX: v.x + 14, minY: v.y - 22, maxY: v.y + 28 };
  // Deck box.
  const d = { minX: -DECK.halfWidth - 6, maxX: DECK.halfWidth + 6, minY: DECK.seaLevel - 3, maxY: 6 };
  const u = {
    minX: Math.min(r.minX, d.minX),
    maxX: Math.max(r.maxX, d.maxX),
    minY: Math.min(r.minY, d.minY),
    maxY: Math.max(r.maxY, d.maxY),
  };
  // Leave room for the HUD at the top and controls at the bottom.
  const vPad = 1.38;
  const hPad = aspect < 1 ? 1.15 : 1.25;
  const halfH = ((u.maxY - u.minY) / 2) * vPad;
  const halfW = ((u.maxX - u.minX) / 2) * hPad;
  let dist = Math.max(halfH / tanV, halfW / tanH, MIN_DIST);
  let cx = (u.minX + u.maxX) / 2;
  let cy = (u.minY + u.maxY) / 2;

  const maxDist = MAX_DIST;
  if (dist > maxDist) {
    // Too far to fit both: keep the vehicle in frame and get as close to the deck as possible.
    dist = maxDist;
    const visH = dist * tanV / vPad;
    const visW = dist * tanH / hPad;
    cy = Math.max(r.maxY - visH, Math.min(cy, r.minY + visH));
    cx = Math.max(r.maxX - visW, Math.min(cx, r.minX + visW));
  }

  // Portrait screens: keep the action below the HUD panel at the top.
  if (aspect < 0.9) cy += dist * tanV * 0.14;
  const closeness = 1 - Math.min(1, (dist - MIN_DIST) / (MAX_DIST - MIN_DIST));
  if (hero) {
    // Title composition: low three-quarter view toward the low sun, subject to
    // the right of centre so the title has room on the left (landscape only).
    const portrait = aspect < 1;
    const heroDist = portrait ? 330 : 255;
    const shift = aspect > 1.1 ? -heroDist * tanH * 0.32 : 0;
    const drift = reducedMotion ? 0 : Math.sin(time * 0.06) * 0.05;
    return { cx: v.x + shift, cy: portrait ? v.y - 32 : v.y - 28, dist: heroDist, fov, lift: -0.06, yaw: 0.42 + drift };
  }
  return { cx, cy, dist, fov, lift: 0.05 + 0.13 * closeness * closeness, yaw: 0 };
}

export function CameraRig({ mode, reducedMotion }: { mode: CameraMode; reducedMotion: boolean }) {
  const { camera, size } = useThree();
  const cur = useRef<Framing | null>(null);
  const cine = useRef({ px: 0, py: 0, pz: 0, tx: 0, ty: 0, init: false });
  const lastAttempt = useRef(runtime.attempt);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const v = runtime.view;

    if (mode === 'replayCinematic') {
      // Chase view at a three-quarter angle. Replay only.
      const c = cine.current;
      const tx = v.x;
      const ty = v.y - 2;
      const px = v.x + 55;
      const py = Math.max(v.y + 6, 4);
      const pz = 95;
      const k = c.init ? 1 - Math.exp(-dt / 0.35) : 1;
      c.px += (px - c.px) * k;
      c.py += (py - c.py) * k;
      c.pz += (pz - c.pz) * k;
      c.tx += (tx - c.tx) * k;
      c.ty += (ty - c.ty) * k;
      c.init = true;
      cam.position.set(c.px, c.py, c.pz);
      cam.lookAt(c.tx, c.ty, 0);
      if (Math.abs(cam.fov - 34) > 0.01) {
        cam.fov = 34;
        cam.updateProjectionMatrix();
      }
      cur.current = null;
    } else {
      cine.current.init = false;
      // A new attempt starts from a clean framing (hidden behind a short fade).
      if (lastAttempt.current !== runtime.attempt) {
        lastAttempt.current = runtime.attempt;
        cur.current = null;
      }
      const target = sideFraming(aspect, mode === 'hero', state.clock.elapsedTime, reducedMotion);
      // Snap instead of swooping when the subject jumps far (e.g. scrubbing a replay).
      if (cur.current && Math.hypot(target.cx - cur.current.cx, target.cy - cur.current.cy) > cur.current.dist * 0.9) {
        cur.current = null;
      }
      if (!cur.current) cur.current = { ...target };
      const c = cur.current;
      const tau = mode === 'hero' ? 0.6 : 0.45;
      const k = 1 - Math.exp(-dt / tau);
      c.cx += (target.cx - c.cx) * k;
      c.cy += (target.cy - c.cy) * k;
      // Distance and FOV move in log space so zooms feel even.
      c.dist = Math.exp(Math.log(c.dist) + (Math.log(target.dist) - Math.log(c.dist)) * k);
      c.fov += (target.fov - c.fov) * k;
      c.lift += (target.lift - c.lift) * k;
      c.yaw += (target.yaw - c.yaw) * k;

      // When the FOV is mid-transition, keep the subject the same apparent size.
      const fovScale = Math.tan(THREE.MathUtils.degToRad(target.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(c.fov / 2));
      const dist = c.dist * fovScale;
      cam.fov = c.fov;
      cam.updateProjectionMatrix();
      cam.position.set(c.cx + Math.sin(c.yaw) * dist, c.cy + c.lift * dist, Math.cos(c.yaw) * dist);
      cam.lookAt(c.cx, c.cy, 0);
    }
    cam.far = 40000;
    cam.near = 1;

    // Screen-space positions for the HUD target cue.
    tmp.set(0, 2, 0).project(cam);
    screenProbe.deckX = tmp.x;
    screenProbe.deckY = tmp.y;
    screenProbe.deckBehind = tmp.z > 1;
    screenProbe.deckOnScreen = Math.abs(tmp.x) < 0.95 && Math.abs(tmp.y) < 0.92 && tmp.z <= 1;
    tmp.set(v.x, v.y, 0).project(cam);
    screenProbe.rocketX = tmp.x;
    screenProbe.rocketY = tmp.y;
    screenProbe.ready = true;
  }, -1);

  return null;
}
