// Webcast-style event strip: one dot per flight phase, rail filled up to the last phase reached.

import type { PhaseState, Stage } from '../data/types.ts';
import { esc } from './format.ts';

const STATE_TEXT: Record<PhaseState, string> = {
  done: 'done',
  lost: 'failed or lost here',
  skipped: 'not reached or not tried',
  pending: 'planned',
  unknown: 'no data',
};

export function trackHtml(name: 'Booster' | 'Ship', stage: Stage): string {
  const phases = stage.phases;
  let reached = -1;
  phases.forEach((p, i) => {
    if (p.state === 'done' || p.state === 'lost') reached = i;
  });
  const progress = phases.length > 1 && reached > 0 ? (reached / (phases.length - 1)) * 100 : 0;
  const description = phases.map((p) => `${p.label}: ${STATE_TEXT[p.state]}`).join(', ');
  const dots = phases
    .map((p) => `<span class="dot dot--${p.state}" data-tip="${esc(`${p.label}: ${STATE_TEXT[p.state]}`)}"></span>`)
    .join('');
  const serial = stage.serial ? `<b>${esc(stage.serial)}</b>` : '';
  const kind = name === 'Booster' ? 'booster' : 'ship';
  return `<div class="track track--${kind}">
    <span class="track__name">${name}${serial}</span>
    <span class="track__line" style="--progress:${progress.toFixed(1)}%" role="img" aria-label="${esc(`${name} ${stage.serial ?? ''}. ${description}`)}">${dots}</span>
  </div>`;
}
