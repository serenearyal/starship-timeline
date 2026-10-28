import type { SiteData } from '../data/types.ts';
import { esc, relTime, safeUrl } from './format.ts';

export function renderNews(el: HTMLElement, data: SiteData): void {
  const items = data.news
    .map((a) => ({ ...a, url: safeUrl(a.url) }))
    .filter((a) => a.url)
    .slice(0, 10);
  if (!items.length) {
    el.innerHTML = `<li><p class="empty" style="padding:22px 0">No recent articles. News loads from the Spaceflight News API on the next sync.</p></li>`;
    return;
  }
  el.innerHTML = items
    .map(
      (a) => `<li><a href="${esc(a.url)}" target="_blank" rel="noopener">
        <span class="news__meta"><b>${esc(a.source)}</b><time datetime="${esc(a.publishedAt)}">${esc(relTime(a.publishedAt))}</time></span>
        <span class="news__title">${esc(a.title)}</span>
        ${a.summary ? `<span class="news__summary">${esc(a.summary)}</span>` : ''}
      </a></li>`,
    )
    .join('');
}

export function renderFooter(el: HTMLElement, data: SiteData): void {
  const sources = data.sources
    .map((s) => `${esc(s.name)}${s.ok ? '' : ' (showing earlier data)'}`)
    .join(', ');
  el.innerHTML = `
    <div>
      <p>An unofficial fan site. Not affiliated with SpaceX.</p>
      <p>Updates itself every 30 minutes with GitHub Actions. Last update ${esc(relTime(data.generatedAt))}.</p>
      <p><a href="https://github.com/serenearyal/starship-timeline" target="_blank" rel="noopener">Source code on GitHub</a></p>
    </div>
    <div class="footer__sources">
      <p>Launch data: ${sources}, by <a href="https://thespacedevs.com" target="_blank" rel="noopener">The Space Devs</a>.</p>
      <p>Weather: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>. Earth imagery: NASA Visible Earth.</p>
      <p>Flight details checked against SpaceX flight recaps and the space press.</p>
    </div>`;
}
