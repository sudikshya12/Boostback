import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { VEHICLE, type Recording } from '../sim';
import { runtime } from '../game/runtime';
import type { ReplayOverlays } from '../game/store';

function Arrow({ color, refObj }: { color: string; refObj: React.RefObject<THREE.Group | null> }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }), [color]);
  return (
    <group ref={refObj} renderOrder={20}>
      <mesh position-y={0.5} material={mat} renderOrder={20}>
        <cylinderGeometry args={[0.35, 0.35, 1, 8]} />
      </mesh>
      <mesh position-y={1} material={mat} renderOrder={20} name="head">
        <coneGeometry args={[1.1, 3, 12]} />
      </mesh>
    </group>
  );
}

const up = new THREE.Vector3(0, 1, 0);
const dir = new THREE.Vector3();

function aimArrow(g: THREE.Group, x: number, y: number, dx: number, dy: number, len: number) {
  g.position.set(x, y, 2);
  dir.set(dx, dy, 0);
  if (dir.lengthSq() < 1e-6 || len < 0.5) {
    g.visible = false;
    return;
  }
  g.visible = true;
  dir.normalize();
  g.quaternion.setFromUnitVectors(up, dir);
  const shaft = g.children[0] as THREE.Mesh;
  const head = g.children[1] as THREE.Mesh;
  shaft.scale.set(1, len, 1);
  shaft.position.y = len / 2;
  head.position.y = len + 1.5;
}

/** Analysis overlays for replay: flight path, velocity, thrust direction and usable-zone boundary. */
export function Overlays({ rec, show }: { rec: Recording; show: ReplayOverlays }) {
  const vel = useRef<THREE.Group>(null);
  const thrust = useRef<THREE.Group>(null);

  const path = useMemo(() => {
    const pts = rec.samples.map((s) => new THREE.Vector3(s.x, s.y, 1.5));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#63d3e6', transparent: true, opacity: 0.75, depthTest: false });
    const line = new THREE.Line(geo, mat);
    line.renderOrder = 19;
    return line;
  }, [rec]);
  useEffect(() => () => {
    path.geometry.dispose();
    (path.material as THREE.Material).dispose();
  }, [path]);

  const zone = rec.scenario.usableHalfWidth;
  const boundaryMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#7fe0a0', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
    [],
  );

  useFrame(() => {
    const v = runtime.view;
    if (vel.current) {
      vel.current.visible = show.velocity;
      if (show.velocity) aimArrow(vel.current, v.x, v.y, v.vx, v.vy, Math.hypot(v.vx, v.vy) * 0.8);
    }
    if (thrust.current) {
      thrust.current.visible = show.thrust;
      if (show.thrust) {
        const a = v.theta + v.gimbal;
        const ly = -VEHICLE.nozzleDepth - VEHICLE.cgHeight;
        const ex = v.x + ly * Math.sin(v.theta);
        const ey = v.y + ly * Math.cos(v.theta);
        aimArrow(thrust.current, ex, ey, Math.sin(a), Math.cos(a), v.throttle * 30);
      }
    }
  });

  return (
    <group>
      {show.path && <primitive object={path} />}
      <Arrow color="#63d3e6" refObj={vel} />
      <Arrow color="#f2b155" refObj={thrust} />
      {show.boundary &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[s * zone, 20, 0.5]} material={boundaryMat} renderOrder={18}>
            <planeGeometry args={[0.6, 40]} />
          </mesh>
        ))}
    </group>
  );
}
