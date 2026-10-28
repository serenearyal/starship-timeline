// To-scale side views of each Starship stack (metres), with a Saturn V ghost for reference.

import { ENGINES, ENGINE_SOURCE, STACKS, type StackVersion } from '../content/vehicle.ts';
import { esc } from './format.ts';

const GROUND = 152;
const RADIUS = 4.5;
const SPACING = 25;
const FIRST_X = 42;
const VIEW_W = FIRST_X + SPACING * 3 + 16;
const VIEW_H = GROUND + 14;

const n = (v: number) => Number(v.toFixed(2));

function noseRadius(t: number): number {
  // Same blunt ogive as the 3D model: t = 0 at the nose base, 1 at the tip.
  return RADIUS * Math.pow(Math.max(1 - Math.pow(t, 1.85), 0), 1 / 1.75);
}

function shipOutline(cx: number, base: number, height: number): string {
  const nose = height * 0.3;
  const barrelTop = base - (height - nose);
  const right: string[] = [];
  const left: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const y = barrelTop - t * nose;
    const r = noseRadius(t);
    right.push(`${n(cx + r)},${n(y)}`);
    left.unshift(`${n(cx - r)},${n(y)}`);
  }
  return `M${n(cx - RADIUS)},${n(base)} L${n(cx + RADIUS)},${n(base)} L${right.join(' L')} L${left.join(' L')} Z`;
}

/** Windward half of the ship, dark tiles, with a sawtooth edge. */
function tileArea(cx: number, base: number, height: number): string {
  const nose = height * 0.3;
  const barrelTop = base - (height - nose);
  const pts: string[] = [`${n(cx - RADIUS)},${n(base)}`];
  // Sawtooth edge up the barrel, 0.6 m teeth.
  const edge = cx - 0.4;
  for (let y = base; y > barrelTop; y -= 0.6) {
    pts.push(`${n(edge + 0.25)},${n(y)}`, `${n(edge - 0.1)},${n(y - 0.3)}`);
  }
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const y = barrelTop - t * nose * 0.985;
    const r = noseRadius(t);
    pts.push(`${n(cx - 0.4 * (r / RADIUS))},${n(y)}`);
  }
  for (let i = 20; i >= 0; i--) {
    const t = i / 20;
    const y = barrelTop - t * nose * 0.985;
    pts.push(`${n(cx - noseRadius(t))},${n(y)}`);
  }
  return `M${pts.join(' L')} Z`;
}

function flap(cx: number, side: 1 | -1, bottom: number, root: number, span: number, tipLen: number, inset = 0): string {
  const x0 = cx + side * (RADIUS - 0.1 - inset);
  const x1 = cx + side * (RADIUS + span - inset);
  return `M${n(x0)},${n(bottom)} L${n(x1)},${n(bottom - (root - tipLen) * 0.35)} L${n(x1)},${n(bottom - (root - tipLen) * 0.35 - tipLen)} L${n(x0)},${n(bottom - root)} Z`;
}

function stackSvg(v: StackVersion, cx: number, active: boolean): string {
  const bh = v.boosterHeight;
  const sh = v.shipHeight;
  const boosterTop = GROUND - bh;
  const shipBase = boosterTop;
  const shipNose = sh * 0.3;
  const fwdBase = shipBase - (sh - shipNose) - (v.draw.forwardFlap === 'large' ? 0.5 : 2.2);
  const rings: string[] = [];
  for (let y = GROUND - 1.83; y > shipBase - (sh - shipNose); y -= 1.83) {
    rings.push(`M${n(cx - RADIUS)},${n(y)} H${n(cx + RADIUS)}`);
  }
  const finSize = v.draw.gridFins === 3 ? { w: 3.2, h: 3.6 } : { w: 2.4, h: 2.8 };
  const finY = boosterTop + 3.2;
  const fins = [1, -1]
    .map((s) => {
      const x = s === 1 ? cx + RADIUS : cx - RADIUS - finSize.w;
      return `<rect class="fin" x="${n(x)}" y="${n(finY)}" width="${finSize.w}" height="${finSize.h}" rx="0.3"/>`;
    })
    .join('');
  const hotStage = v.draw.integratedHotStage
    ? `<rect x="${n(cx - RADIUS)}" y="${n(boosterTop)}" width="9" height="2.2" fill="url(#vent)"/>`
    : `<rect x="${n(cx - RADIUS)}" y="${n(boosterTop)}" width="9" height="1.8" fill="url(#vent)"/><path d="M${n(cx - RADIUS)},${n(boosterTop + 1.8)} H${n(cx + RADIUS)}" stroke="#000" stroke-opacity="0.5" stroke-width="0.12"/>`;
  const fwdFlaps =
    v.draw.forwardFlap === 'large'
      ? [flap(cx, 1, fwdBase, 7.5, 3.3, 3.4, 0.7), flap(cx, -1, fwdBase, 7.5, 3.3, 3.4, 0.7)]
      : [flap(cx, 1, fwdBase, 6.2, 2.3, 2.6, 1.1), flap(cx, -1, fwdBase, 6.2, 2.3, 2.6, 1.1)];
  const aftFlaps = [flap(cx, 1, shipBase - 1.4, 10.6, 4.0, 7.4), flap(cx, -1, shipBase - 1.4, 10.6, 4.0, 7.4)];

  return `<g class="stack${active ? ' is-active' : ''}" data-version="${v.id}" role="button" tabindex="-1" aria-label="${esc(v.name)}">
    <rect x="${n(cx - 12)}" y="0" width="24" height="${VIEW_H}" fill="transparent"/>
    <rect x="${n(cx - RADIUS)}" y="${n(boosterTop)}" width="9" height="${bh}" fill="url(#steel)"/>
    <rect x="${n(cx - RADIUS)}" y="${n(GROUND - 1.6)}" width="9" height="1.6" fill="#1a1b1e"/>
    ${hotStage}
    ${fins}
    <path d="${aftFlaps.join(' ')}" fill="url(#steel-flap)"/>
    <path d="${fwdFlaps.join(' ')}" fill="url(#steel-flap)"/>
    <path d="${shipOutline(cx, shipBase, sh)}" fill="url(#steel)"/>
    <path d="${tileArea(cx, shipBase, sh)}" fill="#121315"/>
    <path d="${rings.join(' ')}" stroke="#000" stroke-opacity="0.13" stroke-width="0.08"/>
    <text x="${n(cx)}" y="${GROUND + 7}" text-anchor="middle" font-size="4.2" font-weight="560" style="font-stretch:118%">${v.id}</text>
    <text x="${n(cx)}" y="${GROUND + 12}" text-anchor="middle" font-size="3" opacity="0.8">${(bh + sh).toFixed(1)} m</text>
  </g>`;
}

function saturnV(cx: number): string {
  const g = GROUND;
  const p = (pts: [number, number][]) =>
    pts.map(([r, h], i) => `${i ? 'L' : 'M'}${n(cx + r)},${n(g - h)}`).join(' ') +
    ' ' +
    [...pts]
      .reverse()
      .map(([r, h]) => `L${n(cx - r)},${n(g - h)}`)
      .join(' ') +
    ' Z';
  const body = p([
    [5.05, 0],
    [5.05, 66.9],
    [3.3, 72.3],
    [3.3, 90],
    [1.95, 98.5],
    [1.95, 102.3],
    [0.4, 105.5],
    [0.12, 105.6],
    [0.12, 109.4],
    [0.3, 109.6],
    [0.05, 110.6],
  ]);
  const fins = `M${n(cx + 5.05)},${n(g - 9)} L${n(cx + 7.4)},${n(g - 2)} L${n(cx + 7.4)},${n(g)} L${n(cx + 5.05)},${n(g)} M${n(cx - 5.05)},${n(g - 9)} L${n(cx - 7.4)},${n(g - 2)} L${n(cx - 7.4)},${n(g)} L${n(cx - 5.05)},${n(g)}`;
  return `<g class="ghost" aria-hidden="true">
    <path d="${body} ${fins}" fill="none" stroke="currentColor" stroke-width="0.22" stroke-dasharray="0.8 0.6"/>
    <text x="${n(cx)}" y="${GROUND + 7}" text-anchor="middle" font-size="3.4" opacity="0.75">Saturn V</text>
    <text x="${n(cx)}" y="${GROUND + 12}" text-anchor="middle" font-size="3" opacity="0.6">110.6 m</text>
  </g>`;
}

function svgHtml(activeId: string): string {
  const grid = [0, 50, 100, 150]
    .map(
      (m) =>
        `<path d="M8,${GROUND - m} H${VIEW_W}" stroke="currentColor" stroke-opacity="${m === 0 ? 0.35 : 0.12}" stroke-width="0.15"/>` +
        (m ? `<text x="1" y="${GROUND - m + 1.2}" font-size="3" opacity="0.6">${m} m</text>` : ''),
    )
    .join('');
  return `<svg class="stacks__svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMax meet" role="group" aria-label="Starship versions drawn to scale next to a Saturn V">
    <defs>
      <linearGradient id="steel" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#4f555c"/>
        <stop offset="0.16" stop-color="#b9bfc6"/>
        <stop offset="0.42" stop-color="#f1f3f5"/>
        <stop offset="0.68" stop-color="#9aa1a9"/>
        <stop offset="1" stop-color="#3f444a"/>
      </linearGradient>
      <linearGradient id="steel-flap" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#c4c9cf"/>
        <stop offset="1" stop-color="#6d737b"/>
      </linearGradient>
      <pattern id="vent" width="1" height="2.4" patternUnits="userSpaceOnUse">
        <rect width="1" height="2.4" fill="#26282c"/>
        <rect x="0.25" y="0.35" width="0.5" height="1.5" rx="0.2" fill="#08090a"/>
      </pattern>
    </defs>
    <g color="#a6adb6">${grid}${saturnV(20)}</g>
    ${STACKS.map((v, i) => stackSvg(v, FIRST_X + 4 + i * SPACING, v.id === activeId)).join('')}
  </svg>`;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function deltaHtml(curr: number, prev: number | undefined, unit: string): string {
  if (prev === undefined || curr === prev) return '';
  const d = Number((curr - prev).toFixed(1));
  const text = Number.isInteger(d) ? fmt(Math.abs(d)) : Math.abs(d).toFixed(1);
  return `<span class="spec__delta">${d > 0 ? '+' : '−'}${text} ${esc(unit)}</span>`;
}

function rowHtml(label: string, value: string, unit: string, delta = ''): string {
  return `<div class="spec__row"><dt>${esc(label)}</dt><dd><span class="spec__value">${value}</span><span class="spec__unit">${esc(unit)}</span>${delta}</dd></div>`;
}

function specHtml(v: StackVersion): string {
  const i = STACKS.indexOf(v);
  const prev = i > 0 ? STACKS[i - 1] : undefined;
  const height = Number((v.shipHeight + v.boosterHeight).toFixed(1));
  const prevHeight = prev ? Number((prev.shipHeight + prev.boosterHeight).toFixed(1)) : undefined;
  const prop = v.shipPropellant + v.boosterPropellant;
  const prevProp = prev ? prev.shipPropellant + prev.boosterPropellant : undefined;
  return `
    <p class="spec__name">${esc(v.name)}</p>
    <p class="spec__flown">${esc(v.flown)}${prev ? `. Changes against ${esc(prev.id)}.` : ''}</p>
    <dl class="spec__table">
      ${rowHtml('Height', fmt(height), 'm', deltaHtml(height, prevHeight, 'm'))}
      ${rowHtml('Liftoff thrust', fmt(v.liftoffThrust), 'tf', deltaHtml(v.liftoffThrust, prev?.liftoffThrust, 'tf'))}
      ${rowHtml('Propellant', fmt(prop), 't', deltaHtml(prop, prevProp, 't'))}
      ${rowHtml('Payload to orbit', esc(v.payload.replace(/^About /, '')), 'reusable')}
      ${rowHtml('Super Heavy', String(v.boosterHeight), 'm', `<span class="spec__note">${esc(v.boosterEngines)}</span>`)}
      ${rowHtml('Ship', String(v.shipHeight), 'm', `<span class="spec__note">${esc(v.shipEngines)}</span>`)}
    </dl>
    <h3 class="spec__sub">What changed</h3>
    <ul class="ticks">${v.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`;
}

export function renderVehicle(el: HTMLElement, enginesEl: HTMLElement): void {
  let active = 'V3';
  el.innerHTML = `
    <header class="section-head">
      <h2 class="headline" id="vehicle-title">The vehicle</h2>
      <p class="lede">Super Heavy and Starship, stacked: the largest and most powerful rocket ever built, made to be caught, refuelled and flown again.</p>
    </header>
    <div class="vehicle__grid">
      <div class="stacks">
        <div class="stacks__art" data-svg>${svgHtml(active)}</div>
        <div class="tabs" role="tablist" aria-label="Starship version">
          ${STACKS.map((v) => `<button class="tab" role="tab" id="tab-${v.id}" aria-controls="spec" aria-selected="${v.id === active}" tabindex="${v.id === active ? 0 : -1}" data-version="${v.id}">${v.id}</button>`).join('')}
        </div>
      </div>
      <div class="spec" id="spec" role="tabpanel" aria-labelledby="tab-${active}" aria-live="polite">${specHtml(STACKS.find((s) => s.id === active)!)}</div>
    </div>`;

  const select = (id: string) => {
    const v = STACKS.find((s) => s.id === id);
    if (!v) return;
    active = id;
    el.querySelectorAll<SVGGElement>('.stack').forEach((g) => g.classList.toggle('is-active', g.dataset.version === id));
    el.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => {
      const on = b.dataset.version === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    const spec = el.querySelector<HTMLElement>('#spec')!;
    spec.setAttribute('aria-labelledby', `tab-${id}`);
    spec.innerHTML = specHtml(v);
  };
  el.addEventListener('click', (e) => {
    const target = (e.target as Element).closest<HTMLElement | SVGElement>('[data-version]');
    if (target?.dataset.version) select(target.dataset.version);
  });
  el.querySelector('.tabs')!.addEventListener('keydown', (e) => {
    const key = (e as KeyboardEvent).key;
    if (key !== 'ArrowRight' && key !== 'ArrowLeft') return;
    const i = STACKS.findIndex((s) => s.id === active);
    const next = STACKS[(i + (key === 'ArrowRight' ? 1 : STACKS.length - 1)) % STACKS.length]!;
    select(next.id);
    el.querySelector<HTMLButtonElement>(`#tab-${next.id}`)?.focus();
  });

  const max = Math.max(...ENGINES.map((e) => e.thrust));
  enginesEl.innerHTML = `
    <h3 class="headline headline--s">Raptor</h3>
    <div class="engines__grid">
      ${ENGINES.map(
        (e) => `<div class="engine">
          <p class="engine__name">${esc(e.id)}</p>
          <p class="engine__thrust"><span class="spec__value">${e.thrust}</span><span class="spec__unit">tf thrust</span></p>
          <div class="engine__bar" aria-hidden="true"><span style="width:${((e.thrust / max) * 100).toFixed(1)}%"></span></div>
          <p class="engine__nums">${fmt(e.mass)} kg, ${e.isp} s specific impulse</p>
          <p class="engine__change">${esc(e.change)}</p>
        </div>`,
      ).join('')}
    </div>
    <p class="note">${esc(ENGINE_SOURCE)}</p>`;
}
