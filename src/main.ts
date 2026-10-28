import './styles/main.css';
import type { SiteData } from './data/types.ts';
import { openFlight, renderFlights } from './ui/flights.ts';
import { relTime } from './ui/format.ts';
import { renderFleet } from './ui/fleet.ts';
import { renderHero, renderLatest, startCountdown } from './ui/hero.ts';
import { renderMilestones } from './ui/milestones.ts';
import { renderFooter, renderNews } from './ui/news.ts';
import { renderStarbase } from './ui/starbase.ts';
import { renderVehicle } from './ui/vehicle.ts';

const DATA_URL = 'data/starship.json';
const REFRESH_MS = 5 * 60 * 1000;
const params = new URLSearchParams(location.search);
const reducedMotion = params.has('still') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

async function loadData(): Promise<SiteData> {
  const res = await fetch(DATA_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`data request failed with ${res.status}`);
  return (await res.json()) as SiteData;
}

let stopCountdown = () => {};

function renderDynamic(data: SiteData): void {
  stopCountdown();
  renderHero($('hero'), data);
  renderLatest($('latest'), data);
  stopCountdown = startCountdown($('hero'), data);
  renderFlights($('flight-list'), data);
  renderNews($('news-list'), data);
  renderFooter($('footer'), data);
  updateSync(data);
}

function updateSync(data: SiteData): void {
  const el = $('sync');
  const age = Date.now() - Date.parse(data.generatedAt);
  const failed = data.sources.some((s) => !s.ok);
  el.classList.toggle('sync--fresh', age < 75 * 60 * 1000 && !failed);
  el.classList.toggle('sync--stale', age > 6 * 3600 * 1000 || failed);
  el.querySelector('.sync__text')!.textContent = `Updated ${relTime(data.generatedAt)}`;
  el.title = data.sources.map((s) => `${s.name}: ${s.ok ? 'ok' : (s.note ?? 'failed')}`).join('\n');
}

function renderStatic(data: SiteData): void {
  renderMilestones($('milestone-arc'), data);
  renderVehicle($('vehicle-view'), $('engine-view'));
  renderFleet($('fleet-view'), data);
  renderStarbase($('starbase-view'), data);
}

function showError(error: unknown): void {
  console.error(error);
  $('hero').innerHTML = `<h1 class="hero__title" id="hero-title">Starship</h1>
    <p class="hero__plan">The flight data did not load. Check your connection and reload the page.</p>`;
  root.classList.add('is-ready');
}

/* Scroll: dim the scene under the content, pull the camera back, mark the current section. */
function setupScroll(onProgress: (p: number) => void): void {
  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    const p = Math.min(window.scrollY / vh, 1.6);
    root.style.setProperty('--scroll', Math.min(Math.max((window.scrollY - vh * 0.35) / (vh * 0.75), 0), 1).toFixed(3));
    root.classList.toggle('is-scrolled', window.scrollY > 40);
    onProgress(p);
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();

  const links = [...document.querySelectorAll<HTMLAnchorElement>('.nav a')];
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach((a) => a.setAttribute('aria-current', String(a.hash === `#${entry.target.id}`)));
      }
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  document.querySelectorAll('main > section[id]').forEach((s) => observer.observe(s));
}

function setupLinks(): void {
  document.addEventListener('click', (e) => {
    const link = (e.target as Element).closest<HTMLElement>('[data-open-flight]');
    if (!link) return;
    e.preventDefault();
    openFlight(Number(link.dataset.openFlight));
    history.replaceState(null, '', `#flight-${link.dataset.openFlight}`);
  });
  // Deep links straight to a flight open it.
  const m = location.hash.match(/^#flight-(\d+)$/);
  if (m) requestAnimationFrame(() => openFlight(Number(m[1])));
}

/* Brushed-steel sheen on the hero title follows the pointer. */
function setupSheen(): void {
  if (reducedMotion) return;
  window.addEventListener(
    'pointermove',
    (e) => root.style.setProperty('--sheen', `${(20 + (e.clientX / window.innerWidth) * 60).toFixed(1)}%`),
    { passive: true },
  );
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2'));
  } catch {
    return false;
  }
}

async function startScene(): Promise<((p: number) => void) | null> {
  if (params.has('noscene') || !webglAvailable()) return null;
  const { createHeroScene } = await import('./scene/index.ts');
  const scene = createHeroScene($<HTMLCanvasElement>('scene'), {
    reducedMotion,
    dayTexture: 'textures/earth-day.jpg',
    auxTexture: 'textures/earth-aux.jpg',
    lightsTexture: 'textures/earth-lights.jpg',
    onFirstFrame: () => root.classList.add('is-scene-ready'),
  });
  return (p) => scene.setScroll(p);
}

async function main(): Promise<void> {
  setupLinks();
  setupSheen();
  let sceneScroll: ((p: number) => void) | null = null;
  setupScroll((p) => sceneScroll?.(p));
  const scenePromise = startScene().catch((err: unknown) => {
    console.warn('3D scene unavailable', err);
    return null;
  });

  let data: SiteData;
  try {
    data = await loadData();
  } catch (error) {
    showError(error);
    return;
  }
  renderDynamic(data);
  renderStatic(data);
  requestAnimationFrame(() => root.classList.add('is-ready'));

  sceneScroll = await scenePromise;
  sceneScroll?.(Math.min(window.scrollY / window.innerHeight, 1.6));

  // The site rebuilds itself every 30 minutes; an open tab picks up new data without a reload.
  window.setInterval(async () => {
    try {
      const fresh = await loadData();
      if (fresh.generatedAt !== data.generatedAt) {
        data = fresh;
        renderDynamic(data);
        root.classList.add('is-ready');
      } else {
        updateSync(data);
      }
    } catch {
      /* keep showing what we have */
    }
  }, REFRESH_MS);
}

void main();
