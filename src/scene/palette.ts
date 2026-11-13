import * as THREE from 'three';

/** Direction TOWARD the sun: low, late afternoon, to the left and behind the deck. */
export const SUN_DIR = new THREE.Vector3(-0.5, 0.26, -0.78).normalize();

export const COLORS = {
  sun: new THREE.Color('#ffd7a8'),
  zenith: new THREE.Color('#2a68ad'),
  horizon: new THREE.Color('#a8c2d8'),
  sunHorizon: new THREE.Color('#f6c07e'),
  haze: new THREE.Color('#9db3c6'),
  deep: new THREE.Color('#032039'),
  shallow: new THREE.Color('#0a4468'),
};

/** Shared GLSL for the sky gradient, used by the sky dome, ocean reflections and the environment map. */
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunHorizon;
uniform vec3 uHaze;

vec3 skyColor(vec3 d, float withDisk) {
  float y = d.y;
  float sunAmt = max(dot(d, uSunDir), 0.0);
  vec3 dh = normalize(vec3(d.x, 0.0, d.z) + 1e-5);
  vec3 sh = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
  float az = max(dot(dh, sh), 0.0);
  vec3 horizon = mix(uHorizon, uSunHorizon, pow(az, 4.0) * 0.85);
  float t = pow(clamp(y * 1.6, 0.0, 1.0), 0.55);
  vec3 col = mix(horizon, uZenith, t);
  col = mix(col, uHaze, smoothstep(0.0, -0.06, y));
  col += uSunColor * (pow(sunAmt, 6.0) * 0.25 + pow(sunAmt, 48.0) * 0.4);
  col += uSunColor * smoothstep(0.99988, 0.99994, sunAmt) * 6.0 * withDisk;
  return col;
}
`;

export function skyUniforms() {
  return {
    uSunDir: { value: SUN_DIR.clone() },
    uSunColor: { value: COLORS.sun.clone() },
    uZenith: { value: COLORS.zenith.clone() },
    uHorizon: { value: COLORS.horizon.clone() },
    uSunHorizon: { value: COLORS.sunHorizon.clone() },
    uHaze: { value: COLORS.haze.clone() },
  };
}
