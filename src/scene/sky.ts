// The whole far field in one shader: Earth, clouds, city lights, ocean glint, a ray-marched
// atmosphere, the Sun and the stars. Rays are traced per pixel against analytic spheres, so the
// limb stays perfectly round at any zoom and the same mesh renders the environment map.

import {
  BackSide,
  Matrix3,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Texture,
} from 'three';
import { ATMOSPHERE_GLSL } from './atmosphere.ts';

export interface SkyQuality {
  viewSteps: number;
  lightSteps: number;
  detailOctaves: number;
}

const vertexShader = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D tDay;
uniform sampler2D tAux;
uniform sampler2D tLights;
uniform float uTexturesReady;
uniform mat3 uSceneToEarth;
uniform vec3 uSunDir;
uniform vec3 uEarthCenter;
uniform float uSunIntensity;
uniform float uCloudShift;
uniform float uStarIntensity;
uniform float uGroundHaze;
varying vec3 vWorldPos;

${ATMOSPHERE_GLSL}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

float fbm(vec3 x) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < DETAIL_OCTAVES; i++) {
    v += a * vnoise(x);
    x = x * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}

// Cloud cover from the 20 km NASA map, sharpened with procedural detail near the camera.
float cloudCover(float coarse, vec3 p, float detailFade) {
  float d = fbm(p * 0.07);
  float detailed = smoothstep(0.18, 0.62, coarse * (0.35 + 1.25 * d));
  return mix(smoothstep(0.12, 0.85, coarse), detailed, detailFade);
}

// Point stars on a cube-sphere grid: one candidate star per cell, sized to the pixel footprint.
vec3 starLayer(vec3 dir, float cells, float density, float pixelAngle) {
  vec3 a = abs(dir);
  vec3 axis = a.x > a.y && a.x > a.z ? vec3(1, 0, 0) : (a.y > a.z ? vec3(0, 1, 0) : vec3(0, 0, 1));
  vec3 p = dir / dot(a, axis);
  vec3 cell = floor(p * cells);
  vec3 col = vec3(0.0);
  vec3 h = hash33(cell + axis * 17.0);
  if (h.x < density) {
    vec3 sp = normalize((cell + 0.15 + 0.7 * h) / cells * (1.0 - axis) + axis * sign(dot(dir, axis)) );
    float ang = acos(clamp(dot(dir, sp), -1.0, 1.0));
    float px = pixelAngle * 0.75;
    float b = exp(-0.5 * (ang * ang) / (px * px));
    float mag = pow(h.y, 9.0);
    float temp = h.z;
    vec3 tint = mix(vec3(1.0, 0.78, 0.6), vec3(0.72, 0.82, 1.0), temp);
    col = tint * b * (0.003 + 2.4 * mag);
  }
  return col;
}

// Length of the ray segment inside the shell between radii r0 and r1, cut off at tMax.
float shellPath(vec3 ro, vec3 rd, float r0, float r1, float tMax) {
  vec2 outer = raySphere(ro, rd, r1);
  vec2 inner = raySphere(ro, rd, r0);
  float a = max(min(outer.y, tMax) - max(outer.x, 0.0), 0.0);
  float b = inner.x < inner.y ? max(min(inner.y, tMax) - max(inner.x, 0.0), 0.0) : 0.0;
  return a - b;
}

vec2 earthUv(vec3 n) {
  vec3 e = uSceneToEarth * n;
  float lat = asin(clamp(e.y, -1.0, 1.0));
  float lon = atan(e.x, e.z);
  return vec2(lon / (2.0 * PI_A) + 0.5, lat / PI_A + 0.5);
}

// Seam-free sampling: pick whichever longitude parametrisation has the smaller derivative.
vec4 sampleSeamless(sampler2D tex, vec2 uv) {
  vec2 uvB = vec2(fract(uv.x + 0.5) - 0.5, uv.y);
  vec2 dxA = dFdx(uv), dyA = dFdy(uv);
  vec2 dxB = dFdx(uvB), dyB = dFdy(uvB);
  bool useB = abs(dxB.x) + abs(dyB.x) < abs(dxA.x) + abs(dyA.x) - 1e-6;
  return useB ? textureGrad(tex, uvB, dxB, dyB) : textureGrad(tex, uv, dxA, dyA);
}

void main() {
  vec3 rd = normalize(vWorldPos - cameraPosition);
  vec3 ro = cameraPosition * 0.001 - uEarthCenter;
  vec3 sunDir = normalize(uSunDir);
  // Screen derivatives are only defined in uniform control flow, so take the pixel size here,
  // before the Earth/sky branch. Inside it, 2x2 quads on the limb would see garbage.
  float pixelAngle = max(length(fwidth(rd)), 1e-5);

  vec2 te = raySphere(ro, rd, RE);
  bool hitEarth = te.x > 0.0 && te.x < te.y;
  float tMax = hitEarth ? te.x : 1e9;

  vec3 scatter, trans;
  atmosphere(ro, rd, tMax, sunDir, uSunIntensity, scatter, trans);

  vec3 color = vec3(0.0);
  if (hitEarth) {
    vec3 p = ro + rd * te.x;
    vec3 n = normalize(p);
    vec2 uv = earthUv(n);
    vec3 day = sampleSeamless(tDay, uv).rgb;
    vec4 aux = sampleSeamless(tAux, uv);
    // Procedural detail only where a pixel covers less than a few kilometres.
    float footprint = length(fwidth(p));
    float detailFade = 1.0 - smoothstep(2.0, 12.0, footprint);
    vec2 cuv = uv + vec2(uCloudShift, 0.0);
    float cloud = cloudCover(sampleSeamless(tAux, cuv).r, p, detailFade);
    // Shadow of the cloud deck, offset along the projected sun direction.
    vec3 shadowP = normalize(n + (sunDir - n * dot(sunDir, n)) * 0.0016);
    float cloudShadow = cloudCover(sampleSeamless(tAux, earthUv(shadowP) + vec2(uCloudShift, 0.0)).r, shadowP * RE, detailFade);
    float water = aux.g;
    day *= mix(1.0, 0.8 + 0.4 * fbm(p * 0.25 + 40.0), detailFade * (1.0 - water));
    // Blue Marble paints the open ocean almost black; real open ocean reflects a few percent of blue.
    day = mix(day, vec3(0.010, 0.028, 0.068), water);
    float lights = sampleSeamless(tLights, uv).r;
    // Break the 11 km texels into clusters of streetlights when they are close to the camera.
    float cluster = vnoise(p * 0.9) * 0.65 + vnoise(p * 3.1) * 0.35;
    lights *= mix(1.0, smoothstep(0.35, 0.8, cluster) * 2.2, detailFade);

    vec3 sunAtGround = uSunIntensity * exp(-extinction(sunOpticalDepth(p * (1.0 + 2e-6), sunDir)));
    float ndl = dot(n, sunDir);
    vec3 ground = mix(day, vec3(0.95, 0.96, 0.98), cloud);
    float shade = mix(1.0, 0.55, cloudShadow * (1.0 - cloud));
    // Wrapped diffuse keeps a soft dawn gradient across the terminator.
    float diffuse = clamp((ndl + 0.04) / 1.04, 0.0, 1.0);
    color = ground * sunAtGround * diffuse * shade * (1.0 / PI_A) * 1.9;

    // Sun glint on open water.
    vec3 h = normalize(sunDir - rd);
    float nh = max(dot(n, h), 0.0);
    float glint = pow(nh, 900.0) * 9.0 + pow(nh, 90.0) * 0.18;
    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
    color += sunAtGround * glint * water * (1.0 - cloud) * (0.2 + fresnel) * step(0.0, ndl);
    // Faint skylight so the dark side keeps some shape.
    color += ground * vec3(0.004, 0.006, 0.012) * (1.0 - smoothstep(-0.3, 0.1, ndl));

    float night = 1.0 - smoothstep(-0.12, 0.04, ndl);
    vec3 cityColor = vec3(1.0, 0.68, 0.38);
    color += cityColor * pow(lights, 2.2) * night * (1.0 - cloud * 0.85) * 2.4;
    // Pixels on the silhouette mix ground and sky inside one 2x2 quad, so their texture
    // derivatives are garbage. The surface there is behind a huge air mass anyway.
    color *= uTexturesReady * smoothstep(0.0, 0.06, dot(n, -rd));
  } else {
    float starFade = 1.0 - smoothstep(0.0, 0.08, dot(scatter, vec3(0.333)));
    vec3 stars = starLayer(rd, 60.0, 0.22, pixelAngle) + starLayer(rd, 180.0, 0.1, pixelAngle) * 0.45;
    color += stars * uStarIntensity * starFade;

    // Sun disc with limb darkening, reddened by the air it shines through.
    float cosA = dot(rd, sunDir);
    float ang = acos(clamp(cosA, -1.0, 1.0));
    float r = 0.0048;
    float px = pixelAngle;
    float disc = 1.0 - smoothstep(r - px, r + px, ang);
    float limb = sqrt(max(1.0 - (ang / r) * (ang / r), 0.0));
    color += vec3(1.0, 0.96, 0.9) * disc * (0.4 + 0.6 * limb) * uSunIntensity * 2.5;
  }

  // A touch less haze over the ground keeps oceans and clouds crisp; the limb keeps full glow.
  color = color * trans + scatter * (hitEarth ? uGroundHaze : 1.0);

  // Night airglow: the green oxygen layer near 95 km. Seen edge-on it draws a thin line on the limb,
  // as in photos from the ISS. Daylight drowns it, so it fades out as the sun rises at the ship.
  float dark = 1.0 - smoothstep(-0.25, -0.03, dot(normalize(ro), sunDir));
  color += vec3(0.42, 1.0, 0.5) * shellPath(ro, rd, RE + 90.0, RE + 98.0, tMax) * 1.3e-4 * dark;
  gl_FragColor = vec4(color, 1.0);
}
`;

export class Sky {
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  readonly material: ShaderMaterial;

  constructor(quality: SkyQuality) {
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      defines: { VIEW_STEPS: quality.viewSteps, LIGHT_STEPS: quality.lightSteps, DETAIL_OCTAVES: quality.detailOctaves },
      uniforms: {
        tDay: { value: null },
        tAux: { value: null },
        tLights: { value: null },
        uTexturesReady: { value: 0 },
        uSceneToEarth: { value: new Matrix3() },
        uSunDir: { value: new Vector3(0, 0, -1) },
        uEarthCenter: { value: new Vector3() },
        uSunIntensity: { value: 22 },
        uCloudShift: { value: 0 },
        uStarIntensity: { value: 1 },
        uGroundHaze: { value: 0.66 },
      },
    });
    // Big enough to contain the camera and the environment-map probe at the origin.
    this.mesh = new Mesh(new SphereGeometry(6000, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  setTextures(day: Texture, aux: Texture, lights: Texture): void {
    this.material.uniforms.tDay!.value = day;
    this.material.uniforms.tAux!.value = aux;
    this.material.uniforms.tLights!.value = lights;
    this.material.uniforms.uTexturesReady!.value = 1;
  }

  get uniforms() {
    return this.material.uniforms as {
      uSceneToEarth: { value: Matrix3 };
      uSunDir: { value: Vector3 };
      uEarthCenter: { value: Vector3 };
      uSunIntensity: { value: number };
      uCloudShift: { value: number };
      uStarIntensity: { value: number };
      uGroundHaze: { value: number };
    };
  }
}
