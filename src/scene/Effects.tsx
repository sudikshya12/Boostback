import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { runtime } from '../game/runtime';
import { plumeProbe } from './probe';

const vertex = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(-mv.z, 1.0);
  gl_Position = projectionMatrix * mv;
  vAlpha = aAlpha;
  vColor = aColor;
}`;

const fragment = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor, a);
}`;

/** Fixed-size particle pool rendered as one Points draw call. */
class ParticlePool {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly a0: Float32Array;
  private next = 0;
  readonly material: THREE.ShaderMaterial;

  constructor(
    readonly count: number,
    additive: boolean,
    private readonly gravity: number,
    private readonly drag: number,
  ) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.s0 = new Float32Array(count);
    this.s1 = new Float32Array(count);
    this.a0 = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 8 : 7;
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, size0: number, size1: number, alpha: number, color: THREE.Color,
  ) {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.s0[i] = size0;
    this.s1[i] = size1;
    this.a0[i] = alpha;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
  }

  update(dt: number) {
    const k = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const j = i * 3;
      this.vel[j] *= k;
      this.vel[j + 2] *= k;
      this.vel[j + 1] = this.vel[j + 1] * k + this.gravity * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.2 && this.gravity < 0 && Math.abs(this.pos[j]) < 40) {
        this.pos[j + 1] = 0.2;
        this.vel[j + 1] *= -0.3;
      }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      this.alpha[i] = this.a0[i] * (1 - t) * Math.min(1, t * 8);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true;
    a.aSize.needsUpdate = true;
    a.aAlpha.needsUpdate = true;
    a.aColor.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

const C = {
  wash: new THREE.Color('#d8d0c4'),
  spray: new THREE.Color('#eef3f5'),
  smoke: new THREE.Color('#4a4440'),
  spark: new THREE.Color('#ffb25e'),
};

export function Effects({ budget, reducedMotion }: { budget: number; reducedMotion: boolean }) {
  const { size, camera, gl } = useThree();
  const pools = useMemo(
    () => ({
      smoke: new ParticlePool(budget, false, 1.2, 0.9),
      sparks: new ParticlePool(Math.max(40, Math.floor(budget / 4)), true, -9.8, 0.4),
    }),
    [budget],
  );
  useEffect(() => () => {
    pools.smoke.dispose();
    pools.sparks.dispose();
  }, [pools]);

  const state = useRef({ attempt: -1, outcome: null as string | null, washAcc: 0 });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const persp = camera as THREE.PerspectiveCamera;
    const scale = (size.height * gl.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2));
    pools.smoke.material.uniforms.uScale.value = scale;
    pools.sparks.material.uniforms.uScale.value = scale;
    const st = state.current;
    const v = runtime.view;
    const frozen = runtime.mode === 'paused' || (runtime.mode === 'replay' && !runtime.replay?.playing);

    if (st.attempt !== runtime.attempt) {
      st.attempt = runtime.attempt;
      st.outcome = null;
      pools.smoke.clear();
      pools.sparks.clear();
    }
    if (frozen) return;

    // Exhaust wash where the plume meets the deck or sea.
    if (plumeProbe.active && plumeProbe.strength > 0.02) {
      st.washAcc += dt * plumeProbe.strength * (reducedMotion ? 30 : 70) * (budget / 300);
      while (st.washAcc >= 1) {
        st.washAcc -= 1;
        const ang = Math.random() * Math.PI * 2;
        const sp = 8 + Math.random() * 18 * plumeProbe.strength;
        pools.smoke.spawn(
          plumeProbe.x + (Math.random() - 0.5) * 2, plumeProbe.y + 0.6, (Math.random() - 0.5) * 2,
          Math.cos(ang) * sp, 0.5 + Math.random() * 2, Math.sin(ang) * sp * 0.8,
          1.2 + Math.random() * 1.2, 2.5, 11 + Math.random() * 5, plumeProbe.ocean ? 0.32 : 0.26,
          plumeProbe.ocean ? C.spray : C.wash,
        );
      }
    }

    // One-shot impact effects when an outcome appears (live or during replay).
    if (v.outcome && st.outcome !== v.outcome && v.tSinceEnd < 0.5) {
      st.outcome = v.outcome;
      const n = reducedMotion ? 0.4 : 1;
      if (v.surface === 'ocean' || v.surface === 'deckEdge') {
        for (let i = 0; i < 50 * n; i++) {
          const ang = Math.random() * Math.PI * 2;
          pools.smoke.spawn(v.x, -4.5, 0, Math.cos(ang) * 6, 8 + Math.random() * 16, Math.sin(ang) * 6,
            1.2 + Math.random(), 1.5, 7, 0.45, C.spray);
        }
      } else if (v.outcome !== 'landed' && v.outcome !== 'outsideZone' && v.outcome !== 'outOfBounds') {
        for (let i = 0; i < 70 * n; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 8 + Math.random() * 22;
          pools.sparks.spawn(v.x, 0.8, 0, Math.cos(ang) * sp, 4 + Math.random() * 14, Math.sin(ang) * sp * 0.6,
            0.4 + Math.random() * 0.8, 0.7, 0.3, 0.9, C.spark);
        }
        for (let i = 0; i < 26 * n; i++) {
          pools.smoke.spawn(v.x + (Math.random() - 0.5) * 6, 1.5, (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 3,
            2.5 + Math.random() * 1.5, 4, 16, 0.5, C.smoke);
        }
      }
    }
    if (!v.outcome) st.outcome = null;

    pools.smoke.update(dt);
    pools.sparks.update(dt);
  });

  return (
    <>
      <primitive object={pools.smoke.points} />
      <primitive object={pools.sparks.points} />
    </>
  );
}
