// The story: one full-screen photo per chapter, pinned while the words scroll over it.
// The photos crossfade when the next chapter reaches the middle of the screen.

import { CHAPTERS, type Chapter } from '../content/story.ts';
import type { Photo, SiteData } from '../data/types.ts';
import { esc, fmtDate } from './format.ts';
import { creditText, ownPhotos, pictureHtml } from './photo.ts';

interface StoryChapter extends Chapter {
  id: string;
  flight: number | null;
  image: Photo | null;
  render: boolean;
}

/** Curated chapters, plus one for every flight flown after the last curated one. */
export function storyChapters(data: SiteData): StoryChapter[] {
  const photos = ownPhotos(data);
  const chapters: StoryChapter[] = CHAPTERS.map((c) => {
    const flight = 'flight' in c.photo ? c.photo.flight : null;
    const image = 'flight' in c.photo ? (photos.get(c.photo.flight) ?? null) : (data.prototypePhotos[c.photo.prototype] ?? null);
    const render = 'render' in c.photo && c.photo.render === true;
    return { ...c, id: c.label.toLowerCase().replace(/\s+/g, '-'), flight, image, render };
  });
  const lastCurated = Math.max(...chapters.map((c) => c.flight ?? 0));
  for (const f of data.flights) {
    if (f.upcoming || f.number <= lastCurated) continue;
    chapters.push({
      date: f.net.slice(0, 10),
      label: f.name,
      title: f.highlights[0] ?? f.name,
      text: f.summary ?? '',
      photo: { flight: f.number },
      id: `flight-${f.number}-story`,
      flight: f.number,
      image: photos.get(f.number) ?? null,
      render: false,
    });
  }
  return chapters;
}

function longDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
}

function layerHtml(c: StoryChapter, i: number): string {
  const credit = c.render
    ? 'Rendered live in your browser'
    : c.image
      ? `${c.label}, ${fmtDate(c.date)}. ${creditText(c.image)}`
      : '';
  return `<div class="story__layer${c.render ? ' story__layer--render' : ''}${i === 0 ? ' is-active' : ''}" data-layer="${i}">
    ${c.image ? pictureHtml(c.image, { alt: '' }) : ''}
    ${credit ? `<p class="credit story__credit">${esc(credit)}</p>` : ''}
  </div>`;
}

function chapterHtml(c: StoryChapter, i: number): string {
  return `<article class="chapter" id="chapter-${esc(c.id)}" data-chapter="${i}" aria-labelledby="chapter-${esc(c.id)}-title">
    <div class="chapter__copy">
      <p class="eyebrow"><span>${esc(c.label)}, <time datetime="${esc(c.date)}">${esc(longDate(c.date))}</time></span></p>
      <h2 class="headline" id="chapter-${esc(c.id)}-title">${esc(c.title)}</h2>
      ${c.text ? `<p class="lede">${esc(c.text)}</p>` : ''}
      ${c.flight ? `<a class="btn btn--small" href="#flight-${c.flight}" data-open-flight="${c.flight}">Flight ${c.flight} in detail</a>` : ''}
    </div>
    ${c.stat ? `<p class="chapter__stat"><span class="chapter__stat-value">${esc(c.stat.value)}</span><span class="chapter__stat-label">${esc(c.stat.label)}</span></p>` : ''}
  </article>`;
}

const reducedMotion = () => document.documentElement.classList.contains('reduced-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface StoryHandle {
  /** True while the chapter on screen shows the 3D render. */
  readonly renderActive: boolean;
  /** Index of the first chapter that shows the render, or -1. */
  readonly renderIndex: number;
}

export function renderStory(section: HTMLElement, data: SiteData, onChange: (renderActive: boolean) => void): StoryHandle {
  const chapters = storyChapters(data);
  const stage = section.querySelector<HTMLElement>('.story__stage')!;
  const rail = section.querySelector<HTMLElement>('.story__years')!;
  const list = section.querySelector<HTMLElement>('.story__chapters')!;

  stage.innerHTML = chapters.map(layerHtml).join('') + `<p class="story__year" aria-hidden="true">${chapters[0]?.date.slice(0, 4) ?? ''}</p>`;
  list.innerHTML = chapters.map(chapterHtml).join('');
  rail.innerHTML = chapters
    .map(
      (c, i) =>
        `<li><a href="#chapter-${esc(c.id)}" data-rail="${i}"${i === 0 ? ' aria-current="step"' : ''}><span class="story__rail-year">${esc(c.date.slice(0, 4))}</span><span class="story__rail-label">${esc(c.label)}</span></a></li>`,
    )
    .join('');

  const layers = [...stage.querySelectorAll<HTMLElement>('.story__layer')];
  const links = [...rail.querySelectorAll<HTMLAnchorElement>('a')];
  const year = stage.querySelector<HTMLElement>('.story__year')!;
  const renderIndex = chapters.findIndex((c) => c.render);
  let active = 0;
  let inView = false;
  const state = {
    get renderActive() {
      return inView && chapters[active]?.render === true;
    },
    renderIndex,
  };

  const setActive = (i: number) => {
    if (i === active) return;
    layers[active]?.classList.remove('is-active');
    links[active]?.removeAttribute('aria-current');
    active = i;
    layers[i]?.classList.add('is-active');
    links[i]?.setAttribute('aria-current', 'step');
    const nextYear = chapters[i]?.date.slice(0, 4) ?? '';
    if (year.textContent !== nextYear) {
      year.textContent = nextYear;
      if (!reducedMotion()) year.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 1000, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
    onChange(state.renderActive);
  };

  // A chapter is current while it crosses the middle of the screen.
  const chapterObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.chapter));
      }
    },
    { rootMargin: '-50% 0px -50% 0px' },
  );
  list.querySelectorAll('.chapter').forEach((c) => chapterObserver.observe(c));

  // The story owns the screen while it crosses the middle of it; the chapter rail shows only then.
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        inView = entry.isIntersecting;
        document.documentElement.classList.toggle('in-story', inView);
        onChange(state.renderActive);
      }
    },
    { rootMargin: '-50% 0px -50% 0px' },
  );
  sectionObserver.observe(section);

  return state;
}
