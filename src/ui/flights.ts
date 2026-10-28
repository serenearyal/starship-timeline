// Every flight as a photo card, newest first. A card opens the flight sheet (a dialog).

import type { Flight, Photo, SiteData, Stage, StageOutcome } from '../data/types.ts';
import { STATUS_LABEL, esc, fmtDate, hasPreciseTime, localTimeText, netText, safeUrl } from './format.ts';
import { creditText, ownPhotos, pictureHtml } from './photo.ts';
import { trackHtml } from './track.ts';

const OUTCOME: Record<StageOutcome, string> = {
  caught: 'Caught',
  splashdown: 'Splashdown',
  lost: 'Lost',
  expended: 'Expended',
  recovered: 'Recovered',
  pending: 'Planned',
  unknown: 'No data',
};

let current: SiteData | null = null;
let photos = new Map<number, Photo>();

function dateText(f: Flight): string {
  return f.upcoming ? netText(f.net, f.netPrecision) : fmtDate(f.net);
}

function outcomeHtml(name: string, stage: Stage): string {
  return `<span class="outcome outcome--${stage.outcome}"><span class="outcome__name">${esc(name)}${stage.serial ? ` ${esc(stage.serial)}` : ''}</span>${esc(OUTCOME[stage.outcome])}</span>`;
}

function cardHtml(f: Flight): string {
  const photo = photos.get(f.number);
  const line = f.highlights[0] ?? f.missionName ?? (f.upcoming ? STATUS_LABEL[f.status] : '');
  return `<a class="card${f.upcoming ? ' card--next' : ''}${photo ? '' : ' card--plain'}" href="#flight-${f.number}" data-open-flight="${f.number}">
    <span class="card__media" aria-hidden="true">${photo ? pictureHtml(photo, { sizes: '(max-width: 640px) 80vw, 380px' }) : `<span class="card__number">${f.number}</span>`}</span>
    <span class="card__body">
      <span class="card__date">${f.upcoming ? 'Next, ' : ''}${esc(dateText(f))}</span>
      <span class="card__title">Flight ${f.number}</span>
      ${line ? `<span class="card__line">${esc(line)}</span>` : ''}
      <span class="card__outcomes">${outcomeHtml('Booster', f.booster)}${outcomeHtml('Ship', f.ship)}</span>
    </span>
  </a>`;
}

export function renderFlights(el: HTMLElement, data: SiteData): void {
  current = data;
  photos = ownPhotos(data);
  el.innerHTML = [...data.flights]
    .sort((a, b) => b.number - a.number)
    .map(cardHtml)
    .join('');
}

/* ---------- Sheet ---------- */

function linksHtml(f: Flight): string {
  const links = [
    ...f.webcasts.slice(0, 1).map((w) => ({ label: f.upcoming ? 'Webcast' : 'Webcast replay', url: w.url })),
    ...f.links,
  ]
    .map((l) => ({ ...l, url: safeUrl(l.url) }))
    .filter((l): l is { label: string; url: string } => Boolean(l.url));
  const seen = new Set<string>();
  const items = links
    .filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true)))
    .slice(0, 4)
    .map((l) => `<a class="btn btn--small" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`);
  return items.length ? `<div class="sheet__links">${items.join('')}</div>` : '';
}

function stageHtml(name: string, stage: Stage): string {
  const reflight = stage.flightOfVehicle && stage.flightOfVehicle > 1 ? ` This was its flight number ${stage.flightOfVehicle}.` : '';
  const text = stage.outcomeText ? `${stage.outcomeText}${reflight}` : stage.outcome === 'pending' ? 'Not flown yet.' : '';
  return `<div class="sheet__stage">
    ${trackHtml(name === 'Booster' ? 'Booster' : 'Ship', stage)}
    ${text ? `<p class="sheet__outcome">${esc(text)}</p>` : ''}
  </div>`;
}

function whenHtml(f: Flight): string {
  if (!f.upcoming) return esc(fmtDate(f.net));
  if (hasPreciseTime(f.netPrecision)) return `${esc(localTimeText(f.net))}`;
  return `No earlier than ${esc(netText(f.net, f.netPrecision))}`;
}

function sheetHtml(f: Flight, data: SiteData): string {
  const photo = photos.get(f.number);
  const numbers = data.flights.map((x) => x.number);
  const prev = numbers.includes(f.number - 1) ? f.number - 1 : null;
  const next = numbers.includes(f.number + 1) ? f.number + 1 : null;
  const meta = [f.version ? `Starship ${f.version}` : null, f.upcoming ? STATUS_LABEL[f.status] : null].filter(Boolean).join(', ');
  return `
    <button class="sheet__close" type="button" data-sheet-close aria-label="Close"></button>
    <div class="sheet__media${photo ? '' : ' sheet__media--plain'}">
      ${photo ? pictureHtml(photo, { sizes: '(max-width: 760px) 100vw, 760px', alt: `Starship on Flight ${f.number}` }) : `<span class="card__number">${f.number}</span>`}
      ${photo ? `<p class="credit sheet__credit">${esc(creditText(photo))}</p>` : ''}
    </div>
    <div class="sheet__body">
      <p class="eyebrow">${whenHtml(f)}${meta ? `, ${esc(meta)}` : ''}</p>
      <h2 class="headline" id="sheet-title">Flight ${f.number}</h2>
      ${f.missionName ? `<p class="sheet__mission">${esc(f.missionName)}</p>` : ''}
      ${f.summary ? `<p class="lede">${esc(f.summary)}</p>` : ''}
      <div class="sheet__stages">${stageHtml('Booster', f.booster)}${stageHtml('Ship', f.ship)}</div>
      ${f.highlights.length ? `<h3 class="sheet__sub">${f.upcoming ? 'Goals' : 'Firsts and results'}</h3><ul class="ticks">${f.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      ${linksHtml(f)}
      <nav class="sheet__nav" aria-label="Other flights">
        ${prev ? `<a class="sheet__step" href="#flight-${prev}" data-open-flight="${prev}"><span>Previous</span>Flight ${prev}</a>` : '<span></span>'}
        ${next ? `<a class="sheet__step sheet__step--next" href="#flight-${next}" data-open-flight="${next}"><span>Next</span>Flight ${next}</a>` : ''}
      </nav>
    </div>`;
}

/** Shows one flight in the sheet. Returns false when the flight is not in the data. */
export function openFlight(number: number): boolean {
  const dialog = document.getElementById('sheet') as HTMLDialogElement | null;
  const flight = current?.flights.find((f) => f.number === number);
  if (!dialog || !current || !flight) return false;
  dialog.innerHTML = sheetHtml(flight, current);
  dialog.scrollTop = 0;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector<HTMLElement>('[data-sheet-close]')?.focus();
  return true;
}

export function setupSheet(onClose: () => void): void {
  const dialog = document.getElementById('sheet') as HTMLDialogElement;
  dialog.addEventListener('click', (e) => {
    // A click on the backdrop lands on the dialog element itself.
    if (e.target === dialog || (e.target as Element).closest('[data-sheet-close]')) dialog.close();
  });
  dialog.addEventListener('close', onClose);
}

/** Arrow buttons and mouse drag for the card strip. */
export function setupStrip(strip: HTMLElement, buttons: HTMLButtonElement[]): void {
  const step = () => Math.max(strip.clientWidth * 0.8, 280);
  const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  for (const b of buttons) {
    b.addEventListener('click', () => strip.scrollBy({ left: Number(b.dataset.strip) * step(), behavior: smooth() }));
  }
  const sync = () => {
    const max = strip.scrollWidth - strip.clientWidth - 2;
    for (const b of buttons) b.disabled = Number(b.dataset.strip) < 0 ? strip.scrollLeft <= 2 : strip.scrollLeft >= max;
  };
  strip.addEventListener('scroll', sync, { passive: true });
  new ResizeObserver(sync).observe(strip);

  let startX = 0;
  let startScroll = 0;
  let dragging = false;
  let moved = false;
  strip.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startScroll = strip.scrollLeft;
  });
  strip.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) > 6) {
      moved = true;
      strip.classList.add('is-dragging');
      strip.setPointerCapture(e.pointerId);
    }
    if (moved) strip.scrollLeft = startScroll - dx;
  });
  const stop = () => {
    dragging = false;
    strip.classList.remove('is-dragging');
  };
  strip.addEventListener('pointerup', stop);
  strip.addEventListener('pointercancel', stop);
  // A drag must not open the card it started on.
  strip.addEventListener(
    'click',
    (e) => {
      if (!moved) return;
      e.preventDefault();
      e.stopPropagation();
      moved = false;
    },
    true,
  );
  strip.addEventListener('dragstart', (e) => e.preventDefault());
}
