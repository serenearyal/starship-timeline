import type { FleetVehicle, SiteData } from '../data/types.ts';
import { esc, fmtDate, plural } from './format.ts';

const STATUS: Record<string, { label: string; dot: string }> = {
  active: { label: 'Active', dot: 'pending' },
  destroyed: { label: 'Destroyed', dot: 'lost' },
  lost: { label: 'Lost at sea', dot: 'skipped' },
  expended: { label: 'Expended', dot: 'skipped' },
  retired: { label: 'Retired', dot: 'done' },
  scrapped: { label: 'Scrapped', dot: 'skipped' },
  converted: { label: 'Converted', dot: 'skipped' },
};

function statusOf(v: FleetVehicle) {
  return STATUS[v.status] ?? { label: v.status ? v.status[0]!.toUpperCase() + v.status.slice(1) : 'Unknown', dot: 'unknown' };
}

interface Tile {
  serial: string;
  label: string;
  dot: string;
  flights: number;
  detail: string;
  next?: boolean;
}

function tileFromVehicle(v: FleetVehicle): Tile {
  const s = statusOf(v);
  const span =
    v.firstFlight && v.lastFlight && v.firstFlight !== v.lastFlight
      ? ` Flew ${fmtDate(v.firstFlight)} and ${fmtDate(v.lastFlight)}.`
      : v.firstFlight
        ? ` Flew ${fmtDate(v.firstFlight)}.`
        : '';
  return {
    serial: v.serial,
    label: s.label,
    dot: s.dot,
    flights: v.flights,
    detail: `${v.details ?? ''}${span}`.trim(),
  };
}

function tileHtml(t: Tile, i: number, group: string): string {
  return `<button class="vehicle-tile${t.next ? ' vehicle-tile--next' : ''}" type="button" aria-pressed="false" data-tile="${group}-${i}">
    <span class="vehicle-tile__serial">${esc(t.serial)}</span>
    <span class="vehicle-tile__flights">${t.next ? 'Next' : t.flights ? plural(t.flights, 'flight') : 'Ground'}</span>
    <span class="vehicle-tile__status"><span class="dot dot--${t.dot}"></span>${esc(t.label)}</span>
  </button>`;
}

function groupHtml(title: string, group: string, tiles: Tile[], note: string): string {
  return `<div class="fleet__group" data-group="${group}">
    <div class="fleet__group-head"><h3 class="fleet__group-title">${esc(title)}</h3><span class="fleet__count">${esc(note)}</span></div>
    <div class="fleet__grid">${tiles.map((t, i) => tileHtml(t, i, group)).join('')}</div>
    <p class="fleet__detail" aria-live="polite"></p>
  </div>`;
}

export function renderFleet(el: HTMLElement, data: SiteData): void {
  const orbital = data.fleet.filter((v) => v.version !== 'prototype');
  const prototypes = data.fleet.filter((v) => v.version === 'prototype');
  const next = data.flights.find((f) => f.id === data.nextFlightId);
  const known = new Set(data.fleet.map((v) => v.serial));

  const build = (kind: 'booster' | 'ship') => {
    const tiles = orbital.filter((v) => v.kind === kind).map(tileFromVehicle);
    const serial = kind === 'booster' ? next?.booster.serial : next?.ship.serial;
    if (next && serial && !known.has(serial)) {
      tiles.push({
        serial,
        label: 'In preparation',
        dot: 'pending',
        flights: 0,
        detail: `Assigned to Flight ${next.number}.`,
        next: true,
      });
    }
    return tiles;
  };
  const boosters = build('booster');
  const ships = build('ship');
  const protoTiles = prototypes.map(tileFromVehicle);
  const flown = (tiles: Tile[]) => tiles.filter((t) => t.flights > 0).length;

  const tilesByGroup: Record<string, Tile[]> = { b: boosters, s: ships, p: protoTiles };
  el.innerHTML =
    groupHtml('Super Heavy boosters', 'b', boosters, `${flown(boosters)} flown`) +
    groupHtml('Starships', 's', ships, `${flown(ships)} flown`) +
    `<details class="fleet__protos">
      <summary class="button button--ghost">Show ${protoTiles.length} prototypes and test articles</summary>
      <div style="margin-top:20px">${groupHtml('Prototypes', 'p', protoTiles, 'Starhopper to SN16, 2019 to 2021')}</div>
    </details>`;

  el.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-tile]');
    if (!btn) return;
    const [group, index] = btn.dataset.tile!.split('-') as [string, string];
    const tile = tilesByGroup[group]?.[Number(index)];
    const wrap = btn.closest('.fleet__group')!;
    const pressed = btn.getAttribute('aria-pressed') === 'true';
    wrap.querySelectorAll('[aria-pressed="true"]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    const detail = wrap.querySelector<HTMLElement>('.fleet__detail')!;
    if (pressed || !tile) {
      detail.textContent = '';
      return;
    }
    btn.setAttribute('aria-pressed', 'true');
    detail.innerHTML = `<b>${esc(tile.serial)}</b> ${esc(tile.detail || tile.label)}`;
  });
}
