import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DECK, VEHICLE } from '../sim';
import type { VehicleView } from '../game/runtime';
import { plumeProbe } from './probe';

const R = VEHICLE.bodyRadius;
const LEG = VEHICLE.legs;
const SKIRT_TOP = 2.4;
const INTERSTAGE = 29.5;
const TOP = VEHICLE.bodyLength;
const PIVOT_Y = VEHICLE.gimbalHeight;
const EXIT_Y = -VEHICLE.nozzleDepth;

/** Body livery: warm white, panel seams, light soot, original "BB-07" markings. */
function bodyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 2048;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ece8df';
  g.fillRect(0, 0, c.width, c.height);

  // Soft vertical shading variation and soot toward the base.
  const soot = g.createLinearGradient(0, c.height, 0, c.height * 0.45);
  soot.addColorStop(0, 'rgba(58,50,44,0.55)');
  soot.addColorStop(0.35, 'rgba(70,62,54,0.18)');
  soot.addColorStop(1, 'rgba(70,62,54,0)');
  g.fillStyle = soot;
  g.fillRect(0, 0, c.width, c.height);
  let s = 3;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * c.width;
    const w = 2 + rnd() * 10;
    const len = c.height * (0.15 + rnd() * 0.45);
    const grad = g.createLinearGradient(0, c.height, 0, c.height - len);
    grad.addColorStop(0, `rgba(55,48,42,${0.08 + rnd() * 0.12})`);
    grad.addColorStop(1, 'rgba(55,48,42,0)');
    g.fillStyle = grad;
    g.fillRect(x, c.height - len, w, len);
  }
  // Panel seams.
  g.fillStyle = 'rgba(40,40,40,0.16)';
  for (let y = 120; y < c.height; y += 190) g.fillRect(0, y, c.width, 3);
  for (let x = 0; x < c.width; x += 256) g.fillRect(x, 0, 2, c.height);

  // Front-facing markings (u ≈ 0.5 faces the camera).
  const cx = c.width / 2;
  g.save();
  g.translate(cx, 640);
  g.rotate(-Math.PI / 2);
  g.fillStyle = '#1f2328';
  g.font = '700 150px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('BB-07', 0, 0);
  g.restore();
  // Thin accent band near the top of the white section.
  g.fillStyle = '#d98d2b';
  g.fillRect(0, 150, c.width, 14);
  g.fillStyle = '#1f2328';
  g.fillRect(0, 172, c.width, 6);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const plumeVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const plumeFragment = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uFlicker;
uniform vec3 uHot;
uniform vec3 uMid;
uniform vec3 uCool;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  float along = 1.0 - vUv.y;
  float facing = pow(abs(dot(normalize(vN), normalize(vView))), 1.6);
  float flick = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * 37.0 + along * 18.0)) * 0.25;
  vec3 col = mix(uHot, uMid, smoothstep(0.0, 0.3, along));
  col = mix(col, uCool, smoothstep(0.3, 0.95, along));
  float a = facing * (1.0 - smoothstep(0.15, 1.0, along)) * flick * uIntensity;
  gl_FragColor = vec4(col * a, a);
}`;

function plumeMaterial(hot: string, mid: string, cool: string) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uFlicker: { value: 1 },
      uHot: { value: new THREE.Color(hot) },
      uMid: { value: new THREE.Color(mid) },
      uCool: { value: new THREE.Color(cool) },
    },
    vertexShader: plumeVertex,
    fragmentShader: plumeFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Unit cone: top (radius 1) at y = 0, extends to y = -1. Scaled per frame. */
function unitPlumeGeometry(bottomRatio: number) {
  const g = new THREE.CylinderGeometry(1, bottomRatio, 1, 28, 1, true);
  g.translate(0, -0.5, 0);
  return g;
}

interface BoosterProps {
  view: VehicleView;
  reducedMotion: boolean;
}

export function Booster({ view, reducedMotion }: BoosterProps) {
  const root = useRef<THREE.Group>(null);
  const nozzle = useRef<THREE.Group>(null);
  const plumeOuter = useRef<THREE.Mesh>(null);
  const plumeCore = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.PointLight>(null);
  const throat = useRef<THREE.MeshBasicMaterial>(null);
  const legRefs = useRef<(THREE.Group | null)[]>([]);
  const strutRefs = useRef<(THREE.Mesh | null)[]>([]);
  const padRefs = useRef<(THREE.Group | null)[]>([]);
  const rcsL = useRef<THREE.Mesh>(null);
  const rcsR = useRef<THREE.Mesh>(null);

  const tex = useMemo(bodyTexture, []);
  useEffect(() => () => tex.dispose(), [tex]);

  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05 }),
      dark: new THREE.MeshStandardMaterial({ color: '#25292e', roughness: 0.6, metalness: 0.25 }),
      skirt: new THREE.MeshStandardMaterial({ color: '#33373c', roughness: 0.7, metalness: 0.3 }),
      leg: new THREE.MeshStandardMaterial({ color: '#2b2f34', roughness: 0.55, metalness: 0.35 }),
      metal: new THREE.MeshStandardMaterial({ color: '#5d5853', roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide }),
      pad: new THREE.MeshStandardMaterial({ color: '#3a3e44', roughness: 0.7, metalness: 0.4 }),
      puffL: new THREE.MeshBasicMaterial({ color: '#f4f6f8', transparent: true, opacity: 0, depthWrite: false }),
      puffR: new THREE.MeshBasicMaterial({ color: '#f4f6f8', transparent: true, opacity: 0, depthWrite: false }),
    }),
    [tex],
  );
  const plume = useMemo(
    () => ({
      outer: plumeMaterial('#fff1d0', '#ff9a45', '#c8501e'),
      core: plumeMaterial('#ffffff', '#ffe2a8', '#ff9a45'),
      outerGeo: unitPlumeGeometry(2.4),
      coreGeo: unitPlumeGeometry(0.5),
    }),
    [],
  );

  const bellGeo = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const r = 0.38 + (VEHICLE.nozzleRadius - 0.38) * Math.pow(t, 0.7);
      pts.push(new THREE.Vector2(r, -0.15 - t * (PIVOT_Y - EXIT_Y - 0.15)));
    }
    return new THREE.LatheGeometry(pts, 28);
  }, []);

  // Leg azimuths: two in the simulation plane (±x), two toward/away from the camera.
  const legAz = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
  const tmpA = useMemo(() => new THREE.Vector3(), []);
  const tmpB = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame((state) => {
    const v = view;
    const g = root.current;
    if (!g) return;
    g.position.set(v.x, v.y, 0);
    g.rotation.z = -v.theta;

    if (nozzle.current) nozzle.current.rotation.z = -v.gimbal;

    // Legs: rotate each about its hinge by the deployment angle.
    const phi = v.legs * LEG.deployedAngle;
    for (let i = 0; i < 4; i++) {
      const leg = legRefs.current[i];
      if (leg) leg.rotation.z = -phi;
      const pad = padRefs.current[i];
      if (pad) pad.rotation.z = phi;
      const strut = strutRefs.current[i];
      if (strut) {
        // Strut from the body to 45% along the leg, in the leg's azimuth plane.
        const s = 0.45 * LEG.length;
        tmpA.set(R - 0.15, 10.2, 0);
        tmpB.set(LEG.hingeRadius + s * Math.sin(phi), LEG.hingeHeight + s * Math.cos(phi), 0);
        const len = tmpA.distanceTo(tmpB);
        strut.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
        strut.scale.set(1, len, 1);
        strut.quaternion.setFromUnitVectors(up, tmpB.sub(tmpA).normalize());
      }
    }

    // Engine plume: length follows applied thrust and is clipped at the deck or sea.
    const thr = v.outcome ? 0 : v.throttle;
    const on = thr > 0.002 && v.fuel > 0;
    const t = state.clock.elapsedTime;
    let len = on ? 3 + 24 * thr : 0;
    const a = v.theta + v.gimbal;
    const dx = -Math.sin(a);
    const dy = -Math.cos(a);
    // Nozzle exit in world coordinates.
    const ly = EXIT_Y - VEHICLE.cgHeight;
    const ex = v.x + ly * Math.sin(v.theta);
    const ey = v.y + ly * Math.cos(v.theta);
    plumeProbe.active = false;
    if (on && dy < -0.2) {
      const overDeck = Math.abs(ex) < DECK.halfWidth + 2;
      const surface = overDeck ? 0 : DECK.seaLevel;
      const dist = (ey - surface) / -dy;
      const reach = 3 + 30 * thr;
      if (dist < reach + 14) {
        plumeProbe.active = true;
        plumeProbe.x = ex + dx * dist;
        plumeProbe.y = surface;
        plumeProbe.strength = thr * (1 - Math.max(0, dist - reach) / 14);
        plumeProbe.ocean = !overDeck;
      }
      if (dist < len) len = Math.max(0.5, dist);
    }
    const width = 0.55 + 0.25 * thr;
    for (const [mesh, mat, lenScale, wScale] of [
      [plumeOuter.current, plume.outer, 1, 1],
      [plumeCore.current, plume.core, 0.42, 0.7],
    ] as const) {
      if (!mesh) continue;
      mesh.visible = on;
      mesh.scale.set(width * wScale, Math.max(0.01, len * lenScale), width * wScale);
      mat.uniforms.uTime.value = t;
      mat.uniforms.uIntensity.value = on ? 0.55 + 0.6 * thr : 0;
      mat.uniforms.uFlicker.value = reducedMotion ? 0 : 1;
    }
    if (glow.current) glow.current.intensity = on ? 600 * thr : 0;
    if (throat.current) throat.current.color.setRGB(on ? 1 : 0.15, on ? 0.6 + 0.3 * thr : 0.12, on ? 0.3 : 0.1);

    // Attitude-thruster puffs: positive torque fires the left thruster outward.
    const rcs = v.outcome ? 0 : v.rcs;
    if (rcsL.current) {
      mats.puffL.opacity = Math.max(0, rcs) * 0.55;
      rcsL.current.visible = rcs > 0.05;
    }
    if (rcsR.current) {
      mats.puffR.opacity = Math.max(0, -rcs) * 0.55;
      rcsR.current.visible = rcs < -0.05;
    }
  });

  return (
    <group ref={root}>
      {/* Body frame: origin at the body base. */}
      <group position-y={-VEHICLE.cgHeight}>
        {/* Engine section skirt */}
        <mesh position-y={SKIRT_TOP / 2} material={mats.skirt} castShadow>
          <cylinderGeometry args={[R, R + 0.1, SKIRT_TOP, 40]} />
        </mesh>
        {/* Main white body */}
        <mesh position-y={(SKIRT_TOP + INTERSTAGE) / 2} material={mats.body} castShadow>
          <cylinderGeometry args={[R, R, INTERSTAGE - SKIRT_TOP, 48, 1, false, Math.PI]} />
        </mesh>
        {/* Dark upper section */}
        <mesh position-y={(INTERSTAGE + TOP) / 2} material={mats.dark} castShadow>
          <cylinderGeometry args={[R + 0.02, R + 0.02, TOP - INTERSTAGE, 40]} />
        </mesh>
        <mesh position-y={TOP + 0.05} material={mats.skirt}>
          <cylinderGeometry args={[R - 0.25, R + 0.02, 0.1, 40]} />
        </mesh>
        {/* Fixed, decorative fins (not modelled aerodynamically). */}
        {[Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].map((az) => (
          <group key={az} rotation-y={az}>
            <mesh position={[R + 0.55, 32.6, 0]} material={mats.dark} castShadow>
              <boxGeometry args={[1.1, 2.4, 0.12]} />
            </mesh>
          </group>
        ))}
        {/* Attitude-thruster pods and their puffs. */}
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * (R + 0.12), 34.2, 0]} material={mats.skirt}>
            <boxGeometry args={[0.3, 0.6, 0.6]} />
          </mesh>
        ))}
        <mesh ref={rcsL} position={[-R - 1.5, 34.2, 0]} rotation-z={-Math.PI / 2} material={mats.puffL}>
          <coneGeometry args={[0.6, 2.4, 10, 1, true]} />
        </mesh>
        <mesh ref={rcsR} position={[R + 1.5, 34.2, 0]} rotation-z={Math.PI / 2} material={mats.puffR}>
          <coneGeometry args={[0.6, 2.4, 10, 1, true]} />
        </mesh>
        {/* Heat shield */}
        <mesh position-y={0.02} rotation-x={Math.PI / 2} material={mats.dark}>
          <circleGeometry args={[R + 0.1, 40]} />
        </mesh>
        {/* Gimballed engine */}
        <group ref={nozzle} position-y={PIVOT_Y}>
          <mesh geometry={bellGeo} material={mats.metal} castShadow />
          <mesh position-y={-0.2} rotation-x={Math.PI / 2}>
            <circleGeometry args={[0.37, 20]} />
            <meshBasicMaterial ref={throat} color="#26201a" side={THREE.DoubleSide} />
          </mesh>
          <group position-y={EXIT_Y - PIVOT_Y + 0.15}>
            <mesh ref={plumeOuter} geometry={plume.outerGeo} material={plume.outer} renderOrder={5} frustumCulled={false} />
            <mesh ref={plumeCore} geometry={plume.coreGeo} material={plume.core} renderOrder={6} frustumCulled={false} />
            <pointLight ref={glow} color="#ffae5c" intensity={0} distance={160} decay={2} position-y={-4} />
          </group>
        </group>
        {/* Landing legs */}
        {legAz.map((az, i) => (
          <group key={i} rotation-y={az}>
            <group
              position={[LEG.hingeRadius, LEG.hingeHeight, 0]}
              ref={(el) => {
                legRefs.current[i] = el;
              }}
            >
              <mesh position-y={LEG.length / 2} material={mats.leg} castShadow>
                <boxGeometry args={[0.42, LEG.length, 0.85]} />
              </mesh>
              {/* Foot pad, kept level with the body; its underside is the contact point. */}
              <group
                position-y={LEG.length}
                ref={(el) => {
                  padRefs.current[i] = el;
                }}
              >
                <mesh position-y={0.14} material={mats.pad} castShadow>
                  <cylinderGeometry args={[0.55, 0.7, 0.28, 16]} />
                </mesh>
              </group>
            </group>
            <mesh
              ref={(el) => {
                strutRefs.current[i] = el;
              }}
              material={mats.metal}
              castShadow
            >
              <cylinderGeometry args={[0.11, 0.11, 1, 8]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
