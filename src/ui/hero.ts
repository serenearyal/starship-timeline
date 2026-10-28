// The opening screen: the latest flight photo, full bleed, under the next flight.

import type { Flight, SiteData } from '../data/types.ts';
import { esc, fmtDate, hasPreciseTime, localTimeText, netText, safeUrl } from './format.ts';
import { creditText, ownPhotos, pictureHtml } from './photo.ts';

export function lastFlown(data: SiteData): Flight | null {
  return data.flights.filter((f) => !f.upcoming).at(-1) ?? null;
}

export function nextFlight(data: SiteData): Flight | null {
  return data.flights.find((f) => f.id === data.nextFlightId) ?? null;
}

function countdownHtml(): string {
  const part = (key: string, unit: string) =>
    `<span class="countdown__part"><span class="countdown__num" data-${key}>00</span><span class="countdown__unit">${unit}</span></span>`;
  return `<p class="countdown" data-countdown aria-hidden="true">
    <span class="countdown__sign">T−</span>${part('d', 'Days')}${part('h', 'Hours')}${part('m', 'Min')}${part('s', 'Sec')}
  </p>`;
}

function statusText(flight: Flight, isNext: boolean, live: boolean): string {
  if (live) return 'Live now';
  if (!isNext) return `Latest flight, ${fmtDate(flight.net)}`;
  if (flight.status === 'go') return 'Next flight, go for launch';
  if (flight.status === 'hold') return 'Next flight, on hold';
  if (hasPreciseTime(flight.netPrecision)) return 'Next flight';
  return `Next flight, no earlier than ${netText(flight.net, flight.netPrecision)}`;
}

export function renderHero(el: HTMLElement, data: SiteData): void {
  const next = nextFlight(data);
  const last = lastFlown(data);
  const flight = next ?? last;
  const photos = ownPhotos(data);
  const photoFlight = [...data.flights].reverse().find((f) => photos.has(f.number));
  const photo = photoFlight ? photos.get(photoFlight.number)! : null;

  if (!flight) {
    el.innerHTML = `<div class="hero__copy"><h1 class="display" id="hero-title">Starship</h1></div>`;
    return;
  }

  const isNext = flight === next;
  const precise = isNext && hasPreciseTime(flight.netPrecision);
  const webcast = flight.webcasts.map((w) => safeUrl(w.url)).find(Boolean) ?? null;
  const live = Boolean(isNext && flight.webcastLive && webcast);

  const actions = [
    live ? `<a class="btn btn--fill" href="${esc(webcast)}" target="_blank" rel="noopener">Watch live</a>` : '',
    `<a class="btn${live ? '' : ' btn--fill'}" href="#flight-${flight.number}" data-open-flight="${flight.number}">${isNext ? 'The mission' : 'The flight'}</a>`,
    `<a class="btn" href="#story">The story so far</a>`,
  ].join('');

  const stats = [
    { value: data.stats.flightsFlown, label: 'Flights' },
    { value: data.stats.boosterCatches, label: 'Boosters caught' },
    { value: data.stats.shipSplashdowns, label: 'Ships splashed down' },
  ];

  el.classList.toggle('hero--live', live);
  el.innerHTML = `
    <div class="hero__media" aria-hidden="${photo ? 'false' : 'true'}">
      ${photo && photoFlight ? pictureHtml(photo, { eager: true, alt: `Starship on Flight ${photoFlight.number}, ${fmtDate(photoFlight.net)}` }) : ''}
    </div>
    <div class="hero__copy">
      <p class="eyebrow hero__status"><span class="pulse" aria-hidden="true"></span>${esc(statusText(flight, isNext, live))}</p>
      <h1 class="display" id="hero-title">Flight ${flight.number}</h1>
      ${flight.summary ? `<p class="lede hero__lede">${esc(flight.summary)}</p>` : ''}
      ${precise ? `${countdownHtml()}<p class="hero__time">${esc(localTimeText(flight.net))}</p>` : ''}
      <div class="actions">${actions}</div>
    </div>
    <dl class="hero__stats">
      ${stats.map((s) => `<div><dt>${esc(s.label)}</dt><dd data-count="${s.value}">${s.value}</dd></div>`).join('')}
    </dl>
    ${photo && photoFlight ? `<p class="credit hero__credit">Flight ${photoFlight.number}, ${esc(fmtDate(photoFlight.net))}. ${esc(creditText(photo))}</p>` : ''}`;
}

/** Counts the hero numbers up from zero once, as part of the opening. */
export function countUp(el: HTMLElement, reducedMotion: boolean): void {
  if (reducedMotion) return;
  const nodes = [...el.querySelectorAll<HTMLElement>('[data-count]')];
  const start = performance.now() + 500;
  const duration = 1600;
  const step = (now: number) => {
    const t = Math.min(Math.max((now - start) / duration, 0), 1);
    const eased = 1 - Math.pow(1 - t, 4);
    for (const node of nodes) node.textContent = String(Math.round(Number(node.dataset.count) * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Ticks the hero countdown. Returns a stop function. */
export function startCountdown(root: HTMLElement, data: SiteData): () => void {
  const next = nextFlight(data);
  const node = root.querySelector<HTMLElement>('[data-countdown]');
  if (!next || !node) return () => {};
  const target = Date.parse(next.net);
  const get = (key: string) => node.querySelector<HTMLElement>(`[data-${key}]`)!;
  const parts = { sign: node.querySelector<HTMLElement>('.countdown__sign')!, d: get('d'), h: get('h'), m: get('m'), s: get('s') };
  const tick = () => {
    const diff = target - Date.now();
    const t = Math.abs(diff) / 1000;
    parts.sign.textContent = diff >= 0 ? 'T−' : 'T+';
    parts.d.textContent = String(Math.floor(t / 86400)).padStart(2, '0');
    parts.h.textContent = String(Math.floor((t % 86400) / 3600)).padStart(2, '0');
    parts.m.textContent = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    parts.s.textContent = String(Math.floor(t % 60)).padStart(2, '0');
  };
  tick();
  const id = window.setInterval(tick, 1000);
  return () => window.clearInterval(id);
}
