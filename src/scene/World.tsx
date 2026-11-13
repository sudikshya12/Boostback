import { useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DECK } from '../sim';
import type { Quality } from '../game/persistence';
import { COLORS, SKY_GLSL, SUN_DIR, skyUniforms } from './palette';

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vDir = w.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * w;
  gl_Position.z = gl_Position.w * 0.99999; // keep just inside the far plane
}`;

const skyFragment = /* glsl */ `
${SKY_GLSL}
uniform float uDisk;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  gl_FragColor = vec4(skyColor(d, uDisk), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function SkyDome({ disk = 1, radius = 18000 }: { disk?: number; radius?: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...skyUniforms(), uDisk: { value: disk } },
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [disk],
  );
  return (
    <mesh material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[radius, 48, 24]} />
    </mesh>
  );
}

const oceanVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const oceanFragment = /* glsl */ `
${SKY_GLSL}
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec2 uDeckHalf;
uniform float uDetail;
varying vec3 vWorld;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Each wave fades out once a pixel covers a sizeable fraction of its wavelength,
// which removes the moire that plain sine sums produce at grazing angles.
void wave(inout vec2 grad, vec2 p, vec2 dir, float len, float amp, float foot) {
  float fade = 1.0 - smoothstep(len * 0.03, len * 0.14, foot);
  if (fade <= 0.0) return;
  vec2 d = normalize(dir);
  float k = 6.2831853 / len;
  float ph = dot(d, p) * k + uTime * sqrt(9.81 * k);
  grad += d * (amp * k * cos(ph) * fade);
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam.xz);
  vec3 V = normalize(toCam);
  vec2 p = vWorld.xz;
  vec2 fw = fwidth(p);
  float foot = max(fw.x, fw.y);
  vec2 grad = vec2(0.0);
  wave(grad, p, vec2(1.0, 0.35), 83.0, 0.55, foot);
  wave(grad, p, vec2(0.62, -0.79), 47.0, 0.32, foot);
  wave(grad, p, vec2(-0.31, 1.0), 29.0, 0.2, foot);
  wave(grad, p, vec2(0.93, 0.61), 17.3, 0.11, foot);
  if (uDetail > 0.5) {
    wave(grad, p, vec2(-0.72, 0.33), 9.7, 0.06, foot);
    wave(grad, p, vec2(0.21, -1.0), 5.3, 0.03, foot);
    wave(grad, p, vec2(0.83, 0.47), 2.9, 0.016, foot);
    wave(grad, p, vec2(-0.45, -0.9), 1.7, 0.009, foot);
  }
  // Break up the regularity of the sine sum with slow, large-scale variation.
  float swell = vnoise(p / 260.0 + uTime * 0.01) * 0.75 + vnoise(p / 90.0 - uTime * 0.02) * 0.5;
  grad *= 0.35 + swell;
  vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));


  float ndv = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 sky = skyColor(R, 0.0) * 0.82;
  float lit = 0.6 + 0.4 * max(dot(N, uSunDir), 0.0);
  vec3 water = mix(uDeep, uShallow, clamp(0.3 + grad.x * 0.5, 0.0, 1.0)) * lit;
  vec3 col = mix(water, sky, fres * 0.62);

  vec3 H = normalize(uSunDir + V);
  float nh = max(dot(N, H), 0.0);
  col += uSunColor * (pow(nh, 900.0) * 5.0 + pow(nh, 90.0) * 0.12);

  // Gentle foam where the sea meets the platform hull (purely visual).
  vec2 q = abs(p) - uDeckHalf;
  float dd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  if (dd > 0.0) {
    float band = 1.0 - smoothstep(0.0, 7.0, dd);
    float n = 0.5 + 0.5 * sin(dd * 1.7 - uTime * 1.3 + sin(p.x * 0.31 + p.y * 0.17) * 3.0);
    col = mix(col, vec3(0.82, 0.87, 0.88), band * n * 0.32);
  }

  // Distant water fades into the sky's own horizon colour in that direction, so
  // there is no seam between sea and sky.
  vec3 horizonDir = normalize(vec3(-V.x, 0.0, -V.z));
  vec3 haze = mix(skyColor(horizonDir, 0.0), uHaze, 0.25);
  float h = 1.0 - exp(-dist / 16000.0);
  col = mix(col, haze, smoothstep(0.0, 1.0, h) * 0.95);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function Ocean({ quality }: { quality: Quality }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          ...skyUniforms(),
          uTime: { value: 0 },
          uDeep: { value: COLORS.deep.clone() },
          uShallow: { value: COLORS.shallow.clone() },
          uDeckHalf: { value: new THREE.Vector2(DECK.halfWidth + 1, DECK.halfDepth + 1) },
          uDetail: { value: quality === 'low' ? 0 : 1 },
        },
        vertexShader: oceanVertex,
        fragmentShader: oceanFragment,
      }),
    [quality],
  );
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += Math.min(dt, 0.1);
  });
  return (
    <mesh material={mat} rotation-x={-Math.PI / 2} position-y={DECK.seaLevel} renderOrder={-5}>
      <planeGeometry args={[60000, 60000, 1, 1]} />
    </mesh>
  );
}

function cloudTexture(seed: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = 70 + rnd() * 372;
    const y = 120 + (rnd() - 0.5) * 70;
    const r = 30 + rnd() * 70;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const warm = rnd() > 0.5;
    grad.addColorStop(0, warm ? 'rgba(255,240,225,0.55)' : 'rgba(240,244,248,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Clouds({ count }: { count: number }) {
  const clouds = useMemo(() => {
    const out: { pos: [number, number, number]; scale: [number, number, number]; mat: THREE.SpriteMaterial }[] = [];
    for (let i = 0; i < count; i++) {
      const tex = cloudTexture(1000 + i * 77);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.32, depthWrite: false, fog: false });
      const x = -7000 + ((i * 3779) % 14000);
      const z = -5500 - ((i * 1931) % 4000);
      const y = 500 + ((i * 911) % 1500);
      const w = 2200 + ((i * 577) % 1800);
      out.push({ pos: [x, y, z], scale: [w, w * 0.2, 1], mat });
    }
    return out;
  }, [count]);
  return (
    <group>
      {clouds.map((c, i) => (
        <sprite key={i} position={c.pos} scale={c.scale} material={c.mat} renderOrder={-8} />
      ))}
    </group>
  );
}

function Sun({ quality }: { quality: Quality }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const size = quality === 'high' ? 2048 : 1024;
  return (
    <>
      <directionalLight
        ref={light}
        color={'#ffe0bb'}
        intensity={2.7}
        position={SUN_DIR.clone().multiplyScalar(500).toArray()}
        castShadow={quality !== 'low'}
        shadow-mapSize-width={size}
        shadow-mapSize-height={size}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={10}
        shadow-camera-far={1400}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <hemisphereLight args={['#b4cde6', '#1d2c3a', 0.85]} />
    </>
  );
}

/** Low-resolution environment map rendered from the same sky, for soft reflections. No network access. */
function SkyEnvironment() {
  return (
    <Environment resolution={64} frames={1}>
      <SkyDome disk={0} radius={100} />
      <mesh rotation-x={-Math.PI / 2} position-y={-1}>
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial color={COLORS.deep} />
      </mesh>
    </Environment>
  );
}

export function World({ quality }: { quality: Quality }) {
  return (
    <>
      <SkyDome />
      <SkyEnvironment />
      <Sun quality={quality} />
      <Ocean quality={quality} />
      <Clouds count={quality === 'low' ? 4 : 8} />
    </>
  );
}
