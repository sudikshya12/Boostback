import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { footLocal, VEHICLE } from '../sim';
import { runtime } from '../game/runtime';

/**
 * "Previous attempt" — a faint, flat silhouette aligned by simulation time.
 * Deliberately simpler than the real booster (no plume, no lighting) so it is
 * never confused with the active vehicle.
 */
export function Ghost() {
  const root = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.2, depthWrite: false }),
    [],
  );
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const d = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const g = root.current;
    if (!g) return;
    g.visible = runtime.ghostVisible;
    if (!g.visible) return;
    const v = runtime.ghostView;
    g.position.set(v.x, v.y, -6);
    g.rotation.z = -v.theta;
    for (const [mesh, side] of [[legL.current, -1], [legR.current, 1]] as const) {
      if (!mesh) continue;
      const f = footLocal(v.legs, side);
      const hx = side * VEHICLE.legs.hingeRadius;
      const hy = VEHICLE.legs.hingeHeight - VEHICLE.cgHeight;
      d.set(f.x - hx, f.y - VEHICLE.legs.hingeHeight, 0);
      mesh.position.set((hx + f.x) / 2, (hy + f.y - VEHICLE.cgHeight) / 2, 0);
      mesh.scale.set(1, d.length(), 1);
      mesh.quaternion.setFromUnitVectors(up, d.normalize());
    }
  });

  const H = VEHICLE.bodyLength;
  return (
    <group ref={root} visible={false}>
      <mesh position-y={H / 2 - VEHICLE.cgHeight} material={mat}>
        <cylinderGeometry args={[VEHICLE.bodyRadius, VEHICLE.bodyRadius, H, 16]} />
      </mesh>
      <mesh position-y={-VEHICLE.cgHeight - 0.8} material={mat}>
        <cylinderGeometry args={[0.4, VEHICLE.nozzleRadius, 1.6, 12]} />
      </mesh>
      <mesh ref={legL} material={mat}>
        <boxGeometry args={[0.45, 1, 0.45]} />
      </mesh>
      <mesh ref={legR} material={mat}>
        <boxGeometry args={[0.45, 1, 0.45]} />
      </mesh>
    </group>
  );
}
