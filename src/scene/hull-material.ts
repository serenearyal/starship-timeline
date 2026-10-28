// Procedural Starship skin on top of three.js physical shading.
// Stainless rings with weld seams and per-ring sheen, hexagonal heat-shield tiles with gaps and
// per-tile variation, temper tint along the tile line. Everything is computed per pixel from the
// object-space position, so it stays sharp at any distance with no texture memory.

import { MeshPhysicalMaterial } from 'three';

export type HullMode = 'hull' | 'flap' | 'steel';

export interface HullOptions {
  mode: HullMode;
  /** Ship body radius in metres. */
  radius?: number;
}

const commonGlsl = /* glsl */ `
varying vec3 vObjPos;
varying vec3 vObjNormal;

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

// Pointy-top hex grid. xy = offset from the cell centre, zw = cell id. Flat-to-flat width is 1.
vec4 hexGrid(vec2 uv) {
  const vec2 r = vec2(1.0, 1.7320508);
  const vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h;
  vec2 b = mod(uv - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  return vec4(gv, uv - gv);
}
float hexEdge(vec2 p) {
  p = abs(p);
  return 0.5 - max(dot(p, vec2(0.5, 0.8660254)), p.x);
}

struct Skin { vec3 albedo; float rough; float metal; float height; };

const float TILE = 0.31;      // tile width (m)
const float RING = 1.83;      // steel ring height (m)

Skin tileSkin(vec2 st, float tileEdgeDist) {
  vec4 hg = hexGrid(st / TILE);
  vec2 id = hg.zw;
  float e = hexEdge(hg.xy) * TILE;            // metres to the tile edge
  float aa = max(fwidth(e), 1e-4);
  float gap = 1.0 - smoothstep(0.0035 - aa, 0.0035 + aa, e);
  float far = smoothstep(0.004, 0.012, aa); // gaps finer than a pixel fade into an average tone
  float rnd = hash12(id);
  float rnd2 = hash12(id + 17.31);
  Skin s;
  s.albedo = vec3(0.016 + 0.007 * rnd) * vec3(1.0, 0.985, 0.97);
  // A few tiles painted white, as on the Flight 12 and 13 heat-shield imaging tests.
  float white = step(0.9992, rnd2);
  s.albedo = mix(s.albedo, vec3(0.62), white);
  s.rough = 0.58 + 0.2 * rnd2;
  s.albedo = mix(s.albedo, vec3(0.008), gap * (1.0 - far));
  s.rough = mix(s.rough, 1.0, gap * (1.0 - far));
  s.metal = 0.0;
  float bevel = 1.0 - smoothstep(0.0, 0.03, e);
  s.height = (-0.004 * bevel - 0.006 * gap) * (1.0 - far);
  return s;
}

Skin steelSkin(float theta, float y, float r, float edgeDist, bool rings) {
  float ring = floor(y / RING);
  float rr = hash11(ring * 13.7 + 1.3);
  float rr2 = hash11(ring * 7.1 + 9.2);
  float s = theta * r;
  // Rolled-sheet streaks run around the circumference.
  float streak = hash11(floor(y * 60.0) + ring * 101.0);
  float streak2 = hash11(floor(y * 11.0) + 7.0);
  Skin k;
  vec3 base = vec3(0.64, 0.635, 0.625);
  base *= mix(0.9, 1.04, rr);
  base *= mix(vec3(1.0), vec3(1.03, 1.0, 0.95), rr2);
  k.albedo = base * (0.97 + 0.03 * streak);
  k.rough = 0.3 + 0.16 * rr2 + 0.05 * streak2 + 0.03 * streak;
  k.metal = 1.0;
  k.height = 0.0;
  if (rings) {
    float dy = abs(fract(y / RING + 0.5) - 0.5) * RING;
    float aaY = max(fwidth(y), 1e-4);
    float weld = 1.0 - smoothstep(0.004 - aaY, 0.012 + aaY, dy);
    float far = smoothstep(0.004, 0.02, aaY);
    weld *= 1.0 - far;
    // Three vertical seams per ring.
    float seam = 0.0;
    float circ = 6.2831853 * r;
    for (int i = 0; i < 3; i++) {
      float pos = hash11(ring * 3.1 + float(i) * 11.7) * circ;
      float d = abs(mod(s - pos + circ * 0.5, circ) - circ * 0.5);
      seam = max(seam, 1.0 - smoothstep(0.003, 0.009 + aaY, d));
    }
    seam *= 1.0 - far;
    float joint = max(weld, seam * 0.8);
    k.albedo *= 1.0 - 0.28 * joint;
    k.rough = mix(k.rough, 0.55, joint);
    k.height = 0.0009 * joint;
  }
  // Heat tint: straw and blue temper colours on the steel next to the tiles.
  float tint = 1.0 - smoothstep(0.0, 1.1, edgeDist);
  vec3 temper = mix(vec3(0.74, 0.55, 0.3), vec3(0.38, 0.4, 0.6), smoothstep(0.1, 0.7, edgeDist));
  k.albedo = mix(k.albedo, temper, 0.5 * tint);
  k.rough = mix(k.rough, 0.38, tint * 0.6);
  return k;
}

vec3 skinPerturb(vec3 surfPos, vec3 surfNorm, float h, float faceDir) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

function surfaceGlsl(mode: HullMode, radius: number): string {
  if (mode === 'hull') {
    return /* glsl */ `
Skin computeSkin() {
  float theta = atan(vObjPos.x, vObjPos.z);  // 0 = windward (+Z)
  float r = max(length(vObjPos.xz), 0.05);
  float y = vObjPos.y;
  vec2 st = vec2(theta * r, y);
  // Tile membership is decided per tile, so the tile line is the jagged hex edge it is in reality.
  vec4 hg = hexGrid(st / TILE);
  float cellTheta = (hg.z * TILE) / r;
  float limit = radians(92.0 + 0.8 * sin(y * 0.21));
  float aftSkirt = step(0.35, y);
  bool tiled = abs(cellTheta) < limit && aftSkirt > 0.5;
  float edgeDist = max((abs(theta) - limit) * r, 0.0);
  if (tiled) return tileSkin(st, edgeDist);
  return steelSkin(theta, y, ${radius.toFixed(2)}, edgeDist, true);
}`;
  }
  if (mode === 'flap') {
    return /* glsl */ `
Skin computeSkin() {
  // Flap geometry: shape in XY, extruded along Z. +Z faces windward.
  if (vObjNormal.z > 0.5) return tileSkin(vObjPos.xy, 9.0);
  return steelSkin(vObjPos.x * 0.3, vObjPos.y + 40.0, 4.5, 9.0, false);
}`;
  }
  return /* glsl */ `
Skin computeSkin() {
  return steelSkin(atan(vObjPos.x, vObjPos.z), vObjPos.y + 20.0, 4.5, 9.0, false);
}`;
}

export function createHullMaterial({ mode, radius = 4.5 }: HullOptions): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 0.3,
    envMapIntensity: 1,
    specularIntensity: 1,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvObjNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${commonGlsl}\n${surfaceGlsl(mode, radius)}\nSkin skin;`)
      .replace('#include <map_fragment>', 'skin = computeSkin();\ndiffuseColor.rgb = skin.albedo;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = skin.rough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = skin.metal;')
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal = skinPerturb(-vViewPosition, normal, skin.height, faceDirection);',
      );
  };
  material.customProgramCacheKey = () => `starship-skin-${mode}`;
  return material;
}
