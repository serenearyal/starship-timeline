// Horizontal program arc: curated milestones plus future Starship missions from the live manifest.

import { MILESTONES, PLAN_AS_OF, type Milestone } from '../content/milestones.ts';
import type { SiteData } from '../data/types.ts';
import { esc, fmtDate, netText } from './format.ts';

interface ArcItem extends Milestone {
  now?: boolean;
}

function manifestItems(data: SiteData): ArcItem[] {
  return data.manifest
    .filter((m) => m.upcoming)
    .map((m) => ({
      date: m.net,
      when: netText(m.net, m.netPrecision),
      title: (m.missionName ?? m.name.replace(/^Starship \| /, '')).replace(/^SpaceX /, ''),
      detail: firstSentence(m.description) ?? `${m.missionType ?? 'Mission'} on the launch manifest.`,
      planned: true,
    }));
}

function firstSentence(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(/^.*?[.!?](\s|$)/);
  const s = (match ? match[0] : text).trim();
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
}

export function renderMilestones(el: HTMLElement, data: SiteData): void {
  const now = Date.now();
  const items: ArcItem[] = [...MILESTONES, ...manifestItems(data)];
  items.push({ date: new Date(now).toISOString(), title: 'Today', detail: '', now: true });
  items.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  let lastYear = '';
  const nowIndex = items.findIndex((i) => i.now);
  const html = items
    .map((item) => {
      const year = item.date.slice(0, 4);
      const yearHtml = `<div class="milestone__year${year === lastYear ? ' milestone__year--repeat' : ''}" aria-hidden="${year === lastYear}">${year}</div>`;
      lastYear = year;
      if (item.now) {
        return `<div class="milestone milestone--now" aria-hidden="true">${yearHtml}<span class="now-mark"></span><p class="milestone__when">Today</p></div>`;
      }
      const planned = Boolean(item.planned);
      return `<article class="milestone ${planned ? 'milestone--planned' : 'milestone--done'}">
        ${yearHtml}
        <span class="dot"></span>
        <p class="milestone__when">${esc(planned ? (item.when ?? year) : fmtDate(item.date))}</p>
        <h3 class="milestone__title">${esc(item.title)}</h3>
        <p class="milestone__detail">${esc(item.detail)}</p>
      </article>`;
    })
    .join('');

  const nowPct = items.length > 1 ? (nowIndex / (items.length - 1)) * 100 : 50;
  el.innerHTML = `<div class="arc__track" style="--now:${nowPct.toFixed(1)}%">${html}</div>`;
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', 'Program milestones, scroll sideways');

  const note = document.createElement('p');
  note.className = 'arc__note';
  note.textContent = `Plans as reported on ${fmtDate(PLAN_AS_OF)}. Missions listed on the Launch Library manifest are added automatically.`;
  el.after(note);

  // Start with "today" just right of centre so past and future are both in view, and line the
  // first visible milestone up with the page margin instead of cutting it in half.
  requestAnimationFrame(() => {
    const mark = el.querySelector<HTMLElement>('.milestone--now');
    if (!mark) return;
    const track = el.firstElementChild as HTMLElement;
    const margin = parseFloat(getComputedStyle(track).paddingLeft);
    // The rail turns from flown to planned exactly at the "today" mark.
    track.style.setProperty('--now', `${mark.offsetLeft - margin + 4}px`);
    const ideal = mark.offsetLeft - el.clientWidth * 0.62;
    const first = [...track.children].find((m) => (m as HTMLElement).offsetLeft - margin >= ideal) as HTMLElement | undefined;
    el.scrollLeft = Math.max(0, (first ?? mark).offsetLeft - margin);
  });
  enableDragScroll(el);
}

function enableDragScroll(el: HTMLElement): void {
  let startX = 0;
  let startScroll = 0;
  let dragging = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    dragging = true;
    startX = e.clientX;
    startScroll = el.scrollLeft;
    el.classList.add('is-dragging');
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (dragging) el.scrollLeft = startScroll - (e.clientX - startX);
  });
  const stop = () => {
    dragging = false;
    el.classList.remove('is-dragging');
  };
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
}
