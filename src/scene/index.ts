// Hero scene: Starship coasting over the Gulf of Mexico at orbital sunrise.
// One fixed canvas sits behind the page. Scroll pulls the camera back; the sun rises once on load.

import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Group,
  LinearMipmapLinearFilter,
  MathUtils,
  Matrix3,
  Matrix4,
  Mesh,
  NoColorSpace,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  SRGBColorSpace,
  Scene,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Texture,
  type WebGLRenderTarget,
} from 'three';
import { EARTH_RADIUS, sunTransmittance } from './atmosphere.ts';
import { createPost } from './post.ts';
import { createShip, SHIP_LENGTH } from './ship.ts';
import { Sky } from './sky.ts';

export interface HeroSceneOptions {
  reducedMotion: boolean;
  dayTexture: string;
  auxTexture: string;
  lightsTexture: string;
  onFirstFrame?: () => void;
}

export interface HeroScene {
  setScroll(progress: number): void;
  /** Runs the render loop only while the scene is on screen. The sunrise starts on the first activation. */
  setActive(active: boolean): void;
  dispose(): void;
}

interface Quality {
  pixelRatio: number;
  minPixelRatio: number;
  msaa: number;
  shadowSize: number;
  viewSteps: number;
  lightSteps: number;
  detailOctaves: number;
}

const ALTITUDE_KM = 275; // Flight 14's parking orbit
const START_LAT = 24.5;
const START_LON = -88;
const GROUND_TRACK_DEG_PER_S = 0.012;
const SUNRISE_SECONDS = 9;

/** Art direction. Angles in degrees, in the ship's local frame (azimuth from east towards south). */
const LOOK = {
  sunAzimuth: -95,
  sunStartElevation: -19,
  sunEndElevation: 28,
  sunLight: 3.1,
  exposure: 1,
  /** Ship heading, pitch and roll in degrees. Heading 0 = nose east, positive turns north. */
  heading: 0,
  pitch: 7,
  roll: -10,
};

interface CameraKey {
  position: Vector3;
  target: Vector3;
  fov: number;
}

const KEYS_WIDE: CameraKey[] = [
  // Hero: the ship side-on above the limb, nose to the upper left.
  { position: new Vector3(-116, 8, 44), target: new Vector3(-10, -13, -7), fov: 34 },
  // Content: the camera turns east, the ship slides out of frame and only the limb stays.
  { position: new Vector3(-130, 20, 60), target: new Vector3(-70, -8, -126), fov: 44 },
];

// Portrait screens: further back and aimed low, so the whole ship fits across the top of the screen.
const KEYS_TALL: CameraKey[] = [
  { position: new Vector3(-190, 8, 70), target: new Vector3(-6, -48, 8), fov: 44 },
  { position: new Vector3(-130, 20, 60), target: new Vector3(-70, -8, -126), fov: 50 },
];

function detectQuality(): Quality {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const dpr = window.devicePixelRatio || 1;
  if (coarse || small) {
    return { pixelRatio: Math.min(dpr, 1.5), minPixelRatio: 0.75, msaa: 2, shadowSize: 1024, viewSteps: 10, lightSteps: 4, detailOctaves: 3 };
  }
  return { pixelRatio: Math.min(dpr, 2), minPixelRatio: 0.85, msaa: 4, shadowSize: 2048, viewSteps: 16, lightSteps: 6, detailOctaves: 5 };
}

function sceneToEarth(latDeg: number, lonDeg: number, out: Matrix3): Matrix3 {
  const lat = MathUtils.degToRad(latDeg);
  const lon = MathUtils.degToRad(lonDeg);
  const up = new Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
  const east = new Vector3(Math.cos(lon), 0, -Math.sin(lon));
  const north = new Vector3().crossVectors(up, east);
  // Scene axes: +X = south, +Y = up, -Z = east.
  const m = new Matrix4().makeBasis(north.negate(), up, east.negate());
  return out.setFromMatrix4(m);
}

function sunDirection(elevation: number, azimuth: number, out: Vector3): Vector3 {
  const c = Math.cos(elevation);
  return out.set(Math.sin(azimuth) * c, Math.sin(elevation), -Math.cos(azimuth) * c).normalize();
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function loadTexture(loader: TextureLoader, url: string): Promise<Texture> {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

/** Median time between animation frames, measured over a short idle sample. */
function measureFrameInterval(samples = 24): Promise<number> {
  return new Promise((resolve) => {
    const times: number[] = [];
    const step = (t: number) => {
      times.push(t);
      if (times.length <= samples) {
        requestAnimationFrame(step);
        return;
      }
      const gaps = times
        .slice(1)
        .map((x, i) => x - times[i]!)
        .sort((a, b) => a - b);
      resolve(gaps[Math.floor(gaps.length / 2)]!);
    };
    requestAnimationFrame(step);
  });
}

export function createHeroScene(canvas: HTMLCanvasElement, options: HeroSceneOptions): HeroScene {
  const quality = detectQuality();
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  let keys = KEYS_WIDE;
  const camera = new PerspectiveCamera(keys[0]!.fov, 1, 0.5, 14000);

  const sky = new Sky(quality);
  sky.uniforms.uEarthCenter.value.set(0, -(EARTH_RADIUS + ALTITUDE_KM), 0);
  scene.add(sky.mesh);

  // A second mesh with the same material renders the environment probe at the ship.
  const envScene = new Scene();
  envScene.add(new Mesh(sky.mesh.geometry, sky.material));
  const pmrem = new PMREMGenerator(renderer);
  let envTarget: WebGLRenderTarget | null = null;

  const ship = createShip();
  const shipPivot = new Group();
  ship.group.position.y = -SHIP_LENGTH / 2;
  shipPivot.add(ship.group);
  // Nose east (-Z), tiles down towards Earth (-Y).
  const base = new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(new Vector3(-1, 0, 0), new Vector3(0, 0, -1), new Vector3(0, -1, 0)),
  );
  const attitude = new Quaternion();
  scene.add(shipPivot);

  const sun = new DirectionalLight(0xffffff, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  const sc = sun.shadow.camera;
  sc.left = -32;
  sc.right = 32;
  sc.top = 32;
  sc.bottom = -32;
  sc.near = 1;
  sc.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);

  const post = createPost(renderer, scene, camera, quality.msaa);

  // State
  const sunDir = new Vector3();
  const shipPosKm = new Vector3(0, EARTH_RADIUS + ALTITUDE_KM, 0);
  const sunColor = new Vector3();
  const lightColor = new Color();
  let scrollTarget = 0;
  let scroll = 0;
  const pointer = new Vector2();
  const pointerSmooth = new Vector2();
  let pixelRatio = quality.pixelRatio;
  let width = 0;
  let height = 0;
  let disposed = false;
  let raf = 0;
  let firstFrame = true;
  let active = false;
  let activated = false;
  let lastEnv = -Infinity;
  let elapsed = options.reducedMotion ? SUNRISE_SECONDS : 0;
  let lastTime = performance.now();
  const frameTimes: number[] = [];
  // The browser may cap the frame rate (Chrome's energy saver runs pages at 30 fps). Measure the
  // interval before the scene runs, so a capped display is not taken for a slow GPU.
  let frameInterval = 1000 / 60;
  void measureFrameInterval().then((ms) => (frameInterval = ms));

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    post.setSize(width, height, pixelRatio);
    camera.aspect = width / height;
    keys = camera.aspect < 0.8 ? KEYS_TALL : KEYS_WIDE;
    camera.updateProjectionMatrix();
  }

  function updateEnvironment() {
    const next = pmrem.fromScene(envScene, 0, 0.1, 14000, { size: quality.shadowSize >= 2048 ? 256 : 128 });
    scene.environment = next.texture;
    envTarget?.dispose();
    envTarget = next;
  }

  const tmpPos = new Vector3();
  const tmpTarget = new Vector3();
  const lookOffset = new Vector3();

  function update(dt: number) {
    elapsed += dt;
    const sunT = options.reducedMotion ? 1 : smoothstep(Math.min(elapsed / SUNRISE_SECONDS, 1));
    const elevation = MathUtils.degToRad(MathUtils.lerp(LOOK.sunStartElevation, LOOK.sunEndElevation, sunT));
    sunDirection(elevation, MathUtils.degToRad(LOOK.sunAzimuth), sunDir);
    renderer.toneMappingExposure = LOOK.exposure;
    sky.uniforms.uSunDir.value.copy(sunDir);

    const lon = START_LON + (options.reducedMotion ? 0 : elapsed * GROUND_TRACK_DEG_PER_S);
    sceneToEarth(START_LAT, lon, sky.uniforms.uSceneToEarth.value);
    sky.uniforms.uCloudShift.value = options.reducedMotion ? 0 : elapsed * 0.000004;

    // Direct sunlight colour at the ship, through whatever air lies between.
    sunTransmittance(shipPosKm, sunDir, sunColor);
    lightColor.setRGB(sunColor.x, sunColor.y * 0.975, sunColor.z * 0.93);
    sun.color.copy(lightColor);
    sun.intensity = LOOK.sunLight;
    sun.position.copy(sunDir).multiplyScalar(120);

    // Slow attitude drift so reflections keep moving across the steel.
    const t = options.reducedMotion ? 0 : elapsed;
    const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), MathUtils.degToRad(LOOK.heading));
    attitude.setFromAxisAngle(new Vector3(1, 0, 0), MathUtils.degToRad(LOOK.pitch) + Math.sin(t * 0.05) * 0.02);
    const roll = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), MathUtils.degToRad(LOOK.roll) + Math.sin(t * 0.037) * 0.03);
    shipPivot.quaternion.copy(yaw).multiply(attitude).multiply(roll).multiply(base);

    // Camera: scroll keyframes, a slow orbit and pointer parallax.
    scroll += (scrollTarget - scroll) * Math.min(dt * 4, 1);
    const k = easeInOut(MathUtils.clamp(scroll, 0, 1));
    tmpPos.lerpVectors(keys[0]!.position, keys[1]!.position, k);
    tmpTarget.lerpVectors(keys[0]!.target, keys[1]!.target, k);
    camera.fov = MathUtils.lerp(keys[0]!.fov, keys[1]!.fov, k);
    const orbit = options.reducedMotion ? 0 : Math.sin(t * 0.045) * 0.09;
    tmpPos.applyAxisAngle(new Vector3(0, 1, 0), orbit);
    pointerSmooth.lerp(pointer, Math.min(dt * 2.5, 1));
    lookOffset.set(pointerSmooth.x * 2.4, -pointerSmooth.y * 1.4, 0);
    camera.position.copy(tmpPos).add(lookOffset);
    camera.lookAt(tmpTarget.addScaledVector(lookOffset, 0.3));
    camera.updateProjectionMatrix();

    sky.uniforms.uStarIntensity.value = 0.34;
    post.lens.uniforms.uTime!.value = elapsed;
  }

  function adaptQuality(frameMs: number) {
    frameTimes.push(frameMs);
    if (frameTimes.length < 90) return;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    frameTimes.length = 0;
    // When frames take clearly longer than the display allows, trade a little sharpness for smooth motion.
    if (avg > Math.max(19, frameInterval * 1.2) && pixelRatio > quality.minPixelRatio) {
      pixelRatio = Math.max(quality.minPixelRatio, pixelRatio * 0.85);
      resize();
    }
  }

  function frame(now: number) {
    if (disposed) return;
    const dtMs = Math.min(now - lastTime, 100);
    lastTime = now;
    const dt = dtMs / 1000;
    update(dt);
    const sunrising = elapsed < SUNRISE_SECONDS + 0.5;
    if (now - lastEnv > (sunrising ? 140 : 2500)) {
      updateEnvironment();
      lastEnv = now;
    }
    post.composer.render(dt);
    if (firstFrame) {
      firstFrame = false;
      options.onFirstFrame?.();
    } else {
      adaptQuality(dtMs);
    }
    if (active && !options.reducedMotion) raf = requestAnimationFrame(frame);
  }

  function renderOnce() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function onPointer(e: PointerEvent) {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }

  function onVisibility() {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else if (active) {
      lastTime = performance.now();
      renderOnce();
    }
  }

  function onResize() {
    resize();
    if (options.reducedMotion) renderOnce();
  }

  resize();
  window.addEventListener('resize', onResize);
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  const loader = new TextureLoader();
  Promise.all([
    loadTexture(loader, options.dayTexture),
    loadTexture(loader, options.auxTexture),
    loadTexture(loader, options.lightsTexture),
  ])
    .then(([day, aux, lights]) => {
      day.colorSpace = SRGBColorSpace;
      aux.colorSpace = NoColorSpace;
      lights.colorSpace = NoColorSpace;
      for (const tex of [day, aux, lights]) {
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        tex.minFilter = LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
      }
      sky.setTextures(day, aux, lights);
      lastEnv = -Infinity;
      if (options.reducedMotion) renderOnce();
    })
    .catch((err: unknown) => console.warn('Earth textures failed to load', err));

  renderOnce();

  if (import.meta.env.DEV) {
    (window as unknown as { __hero: unknown }).__hero = {
      camera,
      get KEYS() {
        return keys;
      },
      LOOK,
      sky,
      sun,
      renderer,
      post,
      shipPivot,
      setElapsed: (v: number) => (elapsed = v),
      refreshEnv: () => (lastEnv = -Infinity),
    };
  }

  return {
    setScroll(progress: number) {
      scrollTarget = progress;
      if (options.reducedMotion) {
        scroll = progress;
        renderOnce();
      }
    },
    setActive(on: boolean) {
      if (on === active) return;
      active = on;
      if (!on) {
        cancelAnimationFrame(raf);
        return;
      }
      if (!activated && !options.reducedMotion) elapsed = 0;
      activated = true;
      lastTime = performance.now();
      renderOnce();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      envTarget?.dispose();
      pmrem.dispose();
      post.composer.dispose();
      renderer.dispose();
    },
  };
}
