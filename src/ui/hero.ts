import type { Flight, SiteData } from '../data/types.ts';
import {
  STATUS_LABEL,
  esc,
  fmtDate,
  hasPreciseTime,
  localTimeText,
  netText,
  safeUrl,
  statusChipClass,
} from './format.ts';
import { trackHtml } from './track.ts';

export function lastFlown(data: SiteData): Flight | null {
  const flown = data.flights.filter((f) => !f.upcoming);
  return flown.at(-1) ?? null;
}

function factHtml(label: string, value: string | null): string {
  if (!value) return '';
  return `<div class="fact"><span class="fact__label">${esc(label)}</span><span class="fact__value">${esc(value)}</span></div>`;
}

function padText(f: Flight): string | null {
  if (!f.pad) return null;
  const site = f.site?.split(',')[0]?.replace('SpaceX ', '') ?? null;
  const pad = f.pad.replace('Orbital Launch Pad', 'Pad');
  return site ? `${pad}, ${site}` : pad;
}

function countdownHtml(): string {
  return `<span class="countdown" data-countdown aria-live="off">
    <span class="countdown__sign">T−</span><span data-d>0</span><span class="countdown__unit">d</span><span data-h>00</span><span class="countdown__unit">h</span><span data-m>00</span><span class="countdown__unit">m</span><span data-s>00</span><span class="countdown__unit">s</span>
  </span>`;
}

export function renderHero(el: HTMLElement, data: SiteData): void {
  const next = data.flights.find((f) => f.id === data.nextFlightId) ?? null;
  const last = lastFlown(data);
  const flight = next ?? last;
  if (!flight) {
    el.innerHTML = `<h1 class="hero__title" id="hero-title">Starship</h1>`;
    return;
  }

  const isNext = flight === next;
  const precise = isNext && hasPreciseTime(flight.netPrecision);
  const webcast = flight.webcasts.map((w) => safeUrl(w.url)).find(Boolean) ?? null;
  const live = isNext && flight.webcastLive && webcast;

  const kicker = isNext
    ? `<p class="kicker reveal">Next flight <span class="${live ? 'chip chip--live' : statusChipClass(flight.status)}">${live ? 'Live now' : esc(STATUS_LABEL[flight.status])}</span></p>`
    : `<p class="kicker reveal">Latest flight</p>`;

  const when = isNext
    ? `<div class="hero__when reveal">
        ${precise ? countdownHtml() : ''}
        <span class="hero__net">${precise ? esc(localTimeText(flight.net)) : `No earlier than ${esc(netText(flight.net, flight.netPrecision))}`}</span>
      </div>`
    : `<div class="hero__when reveal"><span class="hero__net">Flew ${esc(fmtDate(flight.net))}</span></div>`;

  const actions: string[] = [];
  if (live) actions.push(`<a class="button" href="${esc(webcast)}" target="_blank" rel="noopener">Watch live</a>`);
  else if (isNext && webcast) actions.push(`<a class="button" href="${esc(webcast)}" target="_blank" rel="noopener">Webcast</a>`);
  actions.push(`<a class="button ${actions.length ? 'button--ghost' : ''}" href="#flight-${flight.number}" data-open-flight="${flight.number}">Flight details</a>`);
  actions.push(`<a class="button button--ghost" href="#flights">All flights</a>`);

  el.innerHTML = `
    ${kicker}
    <h1 class="hero__title reveal" id="hero-title">Flight ${flight.number}</h1>
    ${when}
    ${flight.summary ? `<p class="hero__plan reveal">${esc(flight.summary)}</p>` : ''}
    <div class="hero__facts reveal">
      ${factHtml('Booster', flight.booster.serial)}
      ${factHtml('Ship', flight.ship.serial)}
      ${factHtml('Version', flight.version ? `Starship ${flight.version}` : null)}
      ${factHtml('Launch site', padText(flight))}
    </div>
    <div class="hero__actions reveal">${actions.join('')}</div>`;
}

export function renderLatest(el: HTMLElement, data: SiteData): void {
  const next = data.flights.find((f) => f.id === data.nextFlightId) ?? null;
  const last = lastFlown(data);
  // When there is no upcoming flight, the hero already shows the last one.
  if (!last || !next) {
    el.innerHTML = '';
    return;
  }
  el.classList.add('glass', 'reveal');
  el.innerHTML = `
    <div class="latest__head">
      <span class="latest__label">Last flight</span>
      <span class="latest__date">${esc(fmtDate(last.net))}</span>
    </div>
    <p class="latest__title">Flight ${last.number}${last.missionName ? ` <span class="latest__mission">${esc(last.missionName)}</span>` : ''}</p>
    ${last.highlights[0] ? `<p class="latest__text">${esc(last.highlights.slice(0, 2).join('. '))}.</p>` : ''}
    <div class="latest__tracks">
      ${trackHtml('Booster', last.booster)}
      ${trackHtml('Ship', last.ship)}
    </div>
    <a class="latest__link" href="#flight-${last.number}" data-open-flight="${last.number}">Read the full flight</a>`;
}

/** Ticks the hero countdown. Returns a stop function. */
export function startCountdown(root: HTMLElement, data: SiteData): () => void {
  const next = data.flights.find((f) => f.id === data.nextFlightId);
  const node = root.querySelector<HTMLElement>('[data-countdown]');
  if (!next || !node) return () => {};
  const target = Date.parse(next.net);
  const parts = {
    sign: node.querySelector<HTMLElement>('.countdown__sign')!,
    d: node.querySelector<HTMLElement>('[data-d]')!,
    h: node.querySelector<HTMLElement>('[data-h]')!,
    m: node.querySelector<HTMLElement>('[data-m]')!,
    s: node.querySelector<HTMLElement>('[data-s]')!,
  };
  const tick = () => {
    const diff = target - Date.now();
    const t = Math.abs(diff) / 1000;
    parts.sign.textContent = diff >= 0 ? 'T−' : 'T+';
    parts.d.textContent = String(Math.floor(t / 86400));
    parts.h.textContent = String(Math.floor((t % 86400) / 3600)).padStart(2, '0');
    parts.m.textContent = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    parts.s.textContent = String(Math.floor(t % 60)).padStart(2, '0');
  };
  tick();
  const id = window.setInterval(tick, 1000);
  return () => window.clearInterval(id);
}
