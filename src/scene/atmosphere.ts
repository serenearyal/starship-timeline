// Physical constants for the single-scattering atmosphere, shared by the GLSL sky and the CPU light model.
// Units are kilometres. Coefficients follow Bruneton & Hillaire's Earth presets.

import { Vector3 } from 'three';

export const EARTH_RADIUS = 6371;
export const ATMOSPHERE_RADIUS = 6471;
export const RAYLEIGH_HEIGHT = 8;
export const MIE_HEIGHT = 1.2;
export const RAYLEIGH_BETA = [5.802e-3, 13.558e-3, 33.1e-3] as const;
export const MIE_BETA = 2.2e-3;
export const MIE_EXTINCTION = MIE_BETA * 1.11;
export const OZONE_BETA = [0.65e-3, 1.881e-3, 0.085e-3] as const;

export const ATMOSPHERE_GLSL = /* glsl */ `
const float PI_A = 3.14159265359;
const float RE = ${EARTH_RADIUS.toFixed(1)};
const float RA = ${ATMOSPHERE_RADIUS.toFixed(1)};
const float HR = ${RAYLEIGH_HEIGHT.toFixed(1)};
const float HM = ${MIE_HEIGHT.toFixed(1)};
const vec3 BETA_R = vec3(${RAYLEIGH_BETA.map((v) => v.toExponential(4)).join(', ')});
const float BETA_M = ${MIE_BETA.toExponential(4)};
const float BETA_ME = ${MIE_EXTINCTION.toExponential(4)};
const vec3 BETA_O = vec3(${OZONE_BETA.map((v) => v.toExponential(4)).join(', ')});
const float MIE_G = 0.8;

// Ray/sphere hit distances for a sphere at the origin. x > y means a miss.
vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float lo = length(ro);
  float c = (lo - r) * (lo + r);
  float d = b * b - c;
  if (d < 0.0) return vec2(1e9, -1e9);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}

vec3 densities(float h) {
  h = max(h, 0.0);
  return vec3(exp(-h / HR), exp(-h / HM), max(0.0, 1.0 - abs(h - 25.0) / 15.0));
}

vec3 extinction(vec3 od) {
  return BETA_R * od.x + BETA_ME * od.y + BETA_O * od.z;
}

// Optical depth from p towards the sun. Returns a large value when the Earth blocks the sun.
vec3 sunOpticalDepth(vec3 p, vec3 sunDir) {
  vec2 te = raySphere(p, sunDir, RE);
  float tTop = raySphere(p, sunDir, RA).y;
  vec3 od = vec3(0.0);
  float ds = tTop / float(LIGHT_STEPS);
  for (int j = 0; j < LIGHT_STEPS; j++) {
    vec3 q = p + sunDir * (float(j) + 0.5) * ds;
    od += densities(length(q) - RE) * ds;
  }
  if (te.x > 0.0 && te.x < te.y) od += vec3(1e4);
  return od;
}

// Single scattering along a view ray (ro relative to Earth centre) up to tMax.
void atmosphere(vec3 ro, vec3 rd, float tMax, vec3 sunDir, float sunI, out vec3 scatter, out vec3 trans) {
  scatter = vec3(0.0);
  trans = vec3(1.0);
  vec2 ta = raySphere(ro, rd, RA);
  float t0 = max(ta.x, 0.0);
  float t1 = min(ta.y, tMax);
  if (t1 <= t0) return;
  float ds = (t1 - t0) / float(VIEW_STEPS);
  float mu = dot(rd, sunDir);
  float phR = 3.0 / (16.0 * PI_A) * (1.0 + mu * mu);
  float g2 = MIE_G * MIE_G;
  float phM = 3.0 / (8.0 * PI_A) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * MIE_G * mu, 1.5));
  vec3 odView = vec3(0.0);
  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  for (int i = 0; i < VIEW_STEPS; i++) {
    float t = t0 + (float(i) + 0.5) * ds;
    vec3 p = ro + rd * t;
    vec3 d = densities(length(p) - RE) * ds;
    odView += d;
    vec3 att = exp(-extinction(odView + sunOpticalDepth(p, sunDir)));
    sumR += d.x * att;
    sumM += d.y * att;
  }
  scatter = sunI * (sumR * BETA_R * phR + sumM * BETA_M * phM);
  trans = exp(-extinction(odView));
}
`;

function densities(h: number): [number, number, number] {
  const hh = Math.max(h, 0);
  return [Math.exp(-hh / RAYLEIGH_HEIGHT), Math.exp(-hh / MIE_HEIGHT), Math.max(0, 1 - Math.abs(hh - 25) / 15)];
}

/** Sunlight transmittance (rgb) at point p (km, relative to Earth centre) in direction sunDir. */
export function sunTransmittance(p: Vector3, sunDir: Vector3, out = new Vector3()): Vector3 {
  const b = p.dot(sunDir);
  const len = p.length();
  // Earth blocks the sun when the ray towards it hits the surface in front of p.
  const cE = (len - EARTH_RADIUS) * (len + EARTH_RADIUS);
  const dE = b * b - cE;
  if (dE > 0 && -b - Math.sqrt(dE) > 0) return out.set(0, 0, 0);
  const cA = (len - ATMOSPHERE_RADIUS) * (len + ATMOSPHERE_RADIUS);
  const dA = b * b - cA;
  if (dA <= 0) return out.set(1, 1, 1);
  const t0 = Math.max(-b - Math.sqrt(dA), 0);
  const t1 = -b + Math.sqrt(dA);
  if (t1 <= t0) return out.set(1, 1, 1);
  const steps = 64;
  const ds = (t1 - t0) / steps;
  let odR = 0;
  let odM = 0;
  let odO = 0;
  const q = new Vector3();
  for (let i = 0; i < steps; i++) {
    q.copy(sunDir).multiplyScalar(t0 + (i + 0.5) * ds).add(p);
    const [r, m, o] = densities(q.length() - EARTH_RADIUS);
    odR += r * ds;
    odM += m * ds;
    odO += o * ds;
  }
  const ext = (i: 0 | 1 | 2) => Math.exp(-(RAYLEIGH_BETA[i] * odR + MIE_EXTINCTION * odM + OZONE_BETA[i] * odO));
  return out.set(ext(0), ext(1), ext(2));
}
