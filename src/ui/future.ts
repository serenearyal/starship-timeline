// What comes next, over the live 3D render: SpaceX's stated plans plus future missions on the manifest.

import { MILESTONES, PLAN_AS_OF } from '../content/milestones.ts';
import { FUTURE } from '../content/story.ts';
import type { SiteData } from '../data/types.ts';
import { esc, fmtDate, netText } from './format.ts';

interface PlanItem {
  date: string;
  when: string;
  title: string;
  detail: string;
}

function firstSentence(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(/^.*?[.!?](\s|$)/);
  const s = (match ? match[0] : text).trim();
  if (s.length <= 160) return s;
  const cut = s.slice(0, 157);
  return `${cut.slice(0, cut.lastIndexOf(' '))}...`;
}

export function planItems(data: SiteData): PlanItem[] {
  const planned: PlanItem[] = MILESTONES.filter((m) => m.planned).map((m) => ({
    date: m.date,
    when: m.when ?? m.date.slice(0, 4),
    title: m.title,
    detail: m.detail,
  }));
  const manifest: PlanItem[] = data.manifest
    .filter((m) => m.upcoming)
    .map((m) => ({
      date: m.net,
      when: netText(m.net, m.netPrecision),
      title: (m.missionName ?? m.name.replace(/^Starship \| /, '')).replace(/^SpaceX /, ''),
      detail: firstSentence(m.description) ?? `${m.missionType ?? 'Mission'} on the Starship launch manifest.`,
    }));
  return [...planned, ...manifest].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

export function renderFuture(el: HTMLElement, data: SiteData): void {
  const items = planItems(data)
    .map(
      (p) => `<li class="plan__item">
        <p class="plan__when">${esc(p.when)}</p>
        <div><h3 class="plan__title">${esc(p.title)}</h3><p class="plan__detail">${esc(p.detail)}</p></div>
      </li>`,
    )
    .join('');
  el.innerHTML = `
    <div class="future__head">
      <h2 class="headline headline--xl" id="future-title">${esc(FUTURE.title)}</h2>
      <p class="lede">${esc(FUTURE.text)}</p>
    </div>
    <div class="future__plan">
      <div class="panel">
        <ol class="plan">${items}</ol>
        <p class="note">Plans as SpaceX and NASA stated them on ${esc(fmtDate(PLAN_AS_OF))}. Missions on the Launch Library manifest are added automatically.</p>
      </div>
    </div>`;
}
