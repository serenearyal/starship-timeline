import type { Flight, SiteData } from '../data/types.ts';
import { STATUS_LABEL, esc, fmtDate, netText, safeUrl } from './format.ts';
import { trackHtml } from './track.ts';

function dateText(f: Flight): string {
  return f.upcoming ? netText(f.net, f.netPrecision) : fmtDate(f.net);
}

function subText(f: Flight): string {
  const parts: string[] = [];
  if (f.version) parts.push(f.version);
  if (f.missionName) parts.push(f.missionName);
  else if (f.upcoming) parts.push(STATUS_LABEL[f.status]);
  return parts.map((p) => `<span>${esc(p)}</span>`).join('');
}

function outcomeHtml(label: string, text: string | null): string {
  if (!text) return '';
  return `<div class="outcome"><dt>${esc(label)}</dt><dd>${esc(text)}</dd></div>`;
}

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
    .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`);
  return items.length ? `<div class="links">${items.join('')}</div>` : '';
}

function flightHtml(f: Flight): string {
  const reflight = (n: number | null) => (n && n > 1 ? ` (flight ${n} of this vehicle)` : '');
  return `<details class="flight${f.upcoming ? ' flight--upcoming' : ''}" id="flight-${f.number}">
    <summary class="flight__row">
      <span class="flight__number" aria-label="Flight ${f.number}">${f.number}</span>
      <span class="flight__meta">
        <span class="flight__date">${esc(dateText(f))}</span>
        <span class="flight__sub">${subText(f)}</span>
      </span>
      ${trackHtml('Booster', f.booster)}
      ${trackHtml('Ship', f.ship)}
      <span class="flight__chevron" aria-hidden="true"></span>
    </summary>
    <div class="flight__body">
      ${f.summary ? `<p class="flight__summary">${esc(f.summary)}</p>` : ''}
      <dl class="flight__outcomes">
        ${outcomeHtml('Booster', f.booster.outcomeText ? f.booster.outcomeText + reflight(f.booster.flightOfVehicle) : null)}
        ${outcomeHtml('Ship', f.ship.outcomeText ? f.ship.outcomeText + reflight(f.ship.flightOfVehicle) : null)}
      </dl>
      <div class="flight__aside">
        ${f.highlights.length ? `<ul class="firsts">${f.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
        ${linksHtml(f)}
      </div>
    </div>
  </details>`;
}

export function renderFlights(el: HTMLElement, data: SiteData): void {
  const flights = [...data.flights].sort((a, b) => b.number - a.number);
  el.classList.add('glass');
  el.innerHTML = flights.map(flightHtml).join('');
}

/** Open a flight row and bring it into view (used by links in the hero and the latest card). */
export function openFlight(number: number): void {
  const row = document.getElementById(`flight-${number}`) as HTMLDetailsElement | null;
  if (!row) return;
  row.open = true;
  row.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
