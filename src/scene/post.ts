// Post-processing: HDR bloom, filmic tone mapping, then a lens pass with chromatic fringing,
// vignette and fine grain in display space.

import { HalfFloatType, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const LensShader = {
  name: 'LensShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uGrain: { value: 0.03 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uGrain;
    varying vec2 vUv;
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 shift = d * 0.0025 * r2;
      vec3 col = vec3(
        texture2D(tDiffuse, vUv - shift).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv + shift).b
      );
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(luma), col, 1.12), 0.0);
      col *= mix(1.0, 0.62, smoothstep(0.08, 0.6, r2 * 1.6));
      float n = hash(vUv * uResolution + fract(uTime * 7.13) * 431.0) - 0.5;
      col += n * uGrain * (0.35 + 0.65 * (1.0 - dot(col, vec3(0.333))));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface Post {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  lens: ShaderPass;
  setSize(width: number, height: number, pixelRatio: number): void;
}

export function createPost(renderer: WebGLRenderer, scene: Scene, camera: Camera, msaa: number): Post {
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: msaa });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.32, 0.45, 1.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const lens = new ShaderPass(LensShader);
  composer.addPass(lens);
  return {
    composer,
    bloom,
    lens,
    setSize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      bloom.resolution.set(width * pixelRatio * 0.5, height * pixelRatio * 0.5);
      (lens.uniforms.uResolution!.value as Vector2).set(width * pixelRatio, height * pixelRatio);
    },
  };
}
