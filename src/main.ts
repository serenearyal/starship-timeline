import './styles/main.css';
import type { SiteData } from './data/types.ts';
import type { HeroScene } from './scene/index.ts';
import { openFlight, renderFlights, setupSheet, setupStrip } from './ui/flights.ts';
import { relTime } from './ui/format.ts';
import { renderFleet } from './ui/fleet.ts';
import { renderFuture } from './ui/future.ts';
import { countUp, renderHero, startCountdown } from './ui/hero.ts';
import { renderFooter, renderNews } from './ui/news.ts';
import { renderStarbase } from './ui/starbase.ts';
import { renderStory, type StoryHandle } from './ui/story.ts';
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

/** Everything that changes when the data changes. */
function renderDynamic(data: SiteData): void {
  stopCountdown();
  renderHero($('hero'), data);
  stopCountdown = startCountdown($('hero'), data);
  renderFuture($('future'), data);
  renderFlights($('flight-strip'), data);
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

function showError(error: unknown): void {
  console.error(error);
  $('hero').innerHTML = `<div class="hero__copy"><h1 class="display" id="hero-title">Starship</h1>
    <p class="lede">The flight data did not load. Check your connection and reload the page.</p></div>`;
  root.classList.add('is-ready');
}

/* ---------- Navigation ---------- */

function setupNav(): void {
  const header = document.querySelector<HTMLElement>('.topbar')!;
  const toggle = header.querySelector<HTMLButtonElement>('.menu')!;
  const setOpen = (open: boolean) => {
    root.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!root.classList.contains('nav-open')));
  header.addEventListener('click', (e) => {
    if ((e.target as Element).closest('.nav a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('nav-open')) {
      setOpen(false);
      toggle.focus();
    }
  });

  let ticking = false;
  const update = () => {
    ticking = false;
    root.classList.toggle('is-scrolled', window.scrollY > 40);
  };
  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();

  const links = [...document.querySelectorAll<HTMLAnchorElement>('.nav a')];
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach((a) => (a.hash === `#${entry.target.id}` ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
      }
    },
    { rootMargin: '-50% 0px -50% 0px' },
  );
  document.querySelectorAll('main > section[id]').forEach((s) => observer.observe(s));
}

/* ---------- Flight sheet and deep links ---------- */

function flightFromHash(): number | null {
  const m = location.hash.match(/^#flight-(\d+)$/);
  return m ? Number(m[1]) : null;
}

function setupLinks(): void {
  setupSheet(() => {
    if (flightFromHash() !== null) history.replaceState(null, '', location.pathname + location.search);
  });
  document.addEventListener('click', (e) => {
    const link = (e.target as Element).closest<HTMLElement>('[data-open-flight]');
    if (!link) return;
    e.preventDefault();
    const n = Number(link.dataset.openFlight);
    if (openFlight(n)) history.replaceState(null, '', `#flight-${n}`);
  });
  window.addEventListener('hashchange', () => {
    const n = flightFromHash();
    if (n !== null) openFlight(n);
  });
}

/* ---------- The 3D scene: loaded near the end of the story, running only while on screen ---------- */

function webglAvailable(): boolean {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

function setupScene(story: StoryHandle): void {
  const future = $('future');
  if (params.has('noscene') || !webglAvailable()) {
    root.classList.add('no-scene');
    return;
  }

  let scene: HeroScene | null = null;
  let loading = false;
  let futureVisible = false;

  const progress = () => {
    const rect = future.getBoundingClientRect();
    const travel = Math.max(rect.height - window.innerHeight, 1);
    return Math.min(Math.max(-rect.top / travel, 0), 1);
  };

  const sync = () => {
    const on = story.renderActive || futureVisible;
    root.classList.toggle('scene-on', on);
    scene?.setActive(on);
    if (on) scene?.setScroll(progress());
  };

  const load = async () => {
    if (loading) return;
    loading = true;
    try {
      const { createHeroScene } = await import('./scene/index.ts');
      scene = createHeroScene($<HTMLCanvasElement>('scene'), {
        reducedMotion,
        dayTexture: 'textures/earth-day.jpg',
        auxTexture: 'textures/earth-aux.jpg',
        lightsTexture: 'textures/earth-lights.jpg',
        onFirstFrame: () => root.classList.add('is-scene-ready'),
      });
      sync();
    } catch (err) {
      console.warn('3D scene unavailable', err);
      root.classList.add('no-scene');
    }
  };

  // Start loading three.js about two screens before the render is needed.
  const near = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        near.disconnect();
        void load();
      }
    },
    { rootMargin: '200% 0px 200% 0px' },
  );
  const renderChapter = document.querySelector(`[data-chapter="${story.renderIndex}"]`);
  near.observe(renderChapter ?? future);
  near.observe(future);

  new IntersectionObserver((entries) => {
    for (const entry of entries) futureVisible = entry.isIntersecting;
    sync();
  }).observe(future);

  window.addEventListener('scroll', () => {
    if (futureVisible) scene?.setScroll(progress());
  }, { passive: true });

  syncScene = sync;
}

let syncScene = () => {};

/* ---------- Start ---------- */

async function main(): Promise<void> {
  root.classList.toggle('reduced-motion', reducedMotion);
  setupNav();
  setupLinks();
  setupStrip($('flight-strip'), [...document.querySelectorAll<HTMLButtonElement>('[data-strip]')]);

  let data: SiteData;
  try {
    data = await loadData();
  } catch (error) {
    showError(error);
    return;
  }

  renderDynamic(data);
  const story = renderStory($('story'), data, () => syncScene());
  renderVehicle($('vehicle-view'), $('engine-view'));
  renderFleet($('fleet-view'), data);
  renderStarbase($('starbase'), data);
  setupScene(story);
  requestAnimationFrame(() => root.classList.add('is-ready'));
  countUp($('hero'), reducedMotion);

  const deepLink = flightFromHash();
  if (deepLink !== null) openFlight(deepLink);

  // The site rebuilds itself every 30 minutes; an open tab picks up new data without a reload.
  window.setInterval(async () => {
    try {
      const fresh = await loadData();
      if (fresh.generatedAt !== data.generatedAt) {
        data = fresh;
        renderDynamic(data);
      } else {
        updateSync(data);
      }
    } catch {
      /* keep showing what we have */
    }
  }, REFRESH_MS);
}

void main();
