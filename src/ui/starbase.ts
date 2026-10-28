import type { SiteData } from '../data/types.ts';
import { esc, fmtDate, netText, safeUrl } from './format.ts';
import { creditText, ownPhotos, pictureHtml } from './photo.ts';

const STARBASE = { lat: 25.9971, lon: -97.1554, tz: 'America/Chicago' };
/** Flight 12's photo looks down on the launch site, the bay and the coast. */
const BACKDROP_FLIGHT = 12;

// WMO weather interpretation codes used by Open-Meteo.
const WEATHER: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Violent showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with hail',
};
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

interface WeatherNow {
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  wind_speed_10m: number;
  wind_gusts_10m: number;
  wind_direction_10m: number;
  cloud_cover: number;
  weather_code: number;
}

/** "Starbase Live Rover 2.0 Cam SpaceX Starship Launch Complex" becomes "Rover 2.0 Cam". */
export function camName(title: string): string {
  const short = title.split(/:| - |\s+SpaceX\b/)[0]!.trim();
  return short.replace(/^Starbase Live\s+(?=\S)/, '') || short;
}

function hostName(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return host === 'youtube.com' || host === 'youtu.be' ? 'YouTube' : host;
}

function statHtml(label: string, value: string): string {
  return `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
}

function localClock(): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: STARBASE.tz, timeZoneName: 'short' }).format(
    new Date(),
  );
}

async function loadWeather(panel: HTMLElement): Promise<void> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${STARBASE.lat}&longitude=${STARBASE.lon}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover,weather_code' +
    '&wind_speed_unit=kn';
  const body = panel.querySelector<HTMLElement>('[data-weather]')!;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { current: WeatherNow };
    const w = json.current;
    const f = Math.round((w.temperature_2m * 9) / 5 + 32);
    const dir = COMPASS[Math.round(w.wind_direction_10m / 45) % 8];
    body.innerHTML = `
      <p class="weather__temp">${Math.round(w.temperature_2m)}<span class="weather__unit">°C</span></p>
      <p class="weather__desc">${esc(WEATHER[w.weather_code] ?? 'Conditions unavailable')}, ${f}°F<br>Feels like ${Math.round(w.apparent_temperature)}°C</p>
      <dl class="weather__grid">
        ${statHtml('Wind', `${Math.round(w.wind_speed_10m)}<span class="unit">kn ${dir}</span>`)}
        ${statHtml('Gusts', `${Math.round(w.wind_gusts_10m)}<span class="unit">kn</span>`)}
        ${statHtml('Cloud', `${Math.round(w.cloud_cover)}<span class="unit">%</span>`)}
        ${statHtml('Humidity', `${Math.round(w.relative_humidity_2m)}<span class="unit">%</span>`)}
      </dl>`;
  } catch {
    body.innerHTML = `<p class="empty">Live weather is not available right now. It loads from Open-Meteo each time you open the page.</p>`;
  }
}

export function renderStarbase(el: HTMLElement, data: SiteData): void {
  const now = Date.now();
  const upcoming = data.events.upcoming.filter((e) => Date.parse(e.date) > now - 6 * 3600e3);
  const recent = data.events.recent.slice(0, 4);
  const closures = data.roadClosures.filter((c) => Date.parse(c.end) > now);
  const backdrop = ownPhotos(data).get(BACKDROP_FLIGHT);

  const eventItem = (e: (typeof recent)[number]) => {
    const url = safeUrl(e.url);
    const name = esc(e.name.replace(/^SpaceX /, ''));
    const precise = e.datePrecision === 'minute' || e.datePrecision === 'hour' || e.datePrecision === 'second';
    return `<li><span class="list__time">${esc(precise ? fmtDate(e.date) : netText(e.date, e.datePrecision))}</span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${name}</a>` : name}</li>`;
  };

  const events = `
    <section class="board">
      <h3 class="board__title">Tests and events</h3>
      ${
        upcoming.length
          ? `<ul class="list">${upcoming.slice(0, 4).map(eventItem).join('')}</ul>`
          : `<p class="empty">No tests announced yet. Static fires and rollouts show here as soon as they are scheduled.</p>`
      }
      ${recent.length ? `<h4 class="board__sub">Recently</h4><ul class="list">${recent.map(eventItem).join('')}</ul>` : ''}
    </section>`;

  const roads = `
    <section class="board">
      <h3 class="board__title">Highway 4 closures</h3>
      ${
        closures.length
          ? `<ul class="list">${closures
              .map(
                (c) =>
                  `<li><span class="list__time">${esc(fmtDate(c.start))}, ${esc(new Date(c.start).toISOString().slice(11, 16))} to ${esc(new Date(c.end).toISOString().slice(11, 16))} UTC</span>${esc(c.title)}, ${esc(c.status.toLowerCase())}</li>`,
              )
              .join('')}</ul>`
          : `<p class="empty">No road closures are posted. Closures for tests and launches usually show a few days ahead.</p>`
      }
      ${
        data.notices.length
          ? `<h4 class="board__sub">Notices</h4><ul class="list">${data.notices
              .slice(0, 4)
              .map((n) => {
                const url = safeUrl(n.url);
                return `<li>${n.date ? `<span class="list__time">${esc(fmtDate(n.date))}</span>` : ''}${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(n.name)}</a>` : esc(n.name)}</li>`;
              })
              .join('')}</ul>`
          : ''
      }
    </section>`;

  const camLinks = data.liveStreams
    .slice(0, 3)
    .map((s) => {
      const url = safeUrl(s.url);
      if (!url) return '';
      return `<li><a class="cam" href="${esc(url)}" target="_blank" rel="noopener"><span class="cam__title">${esc(camName(s.title))}</span><span class="cam__via">${esc(hostName(url))}</span></a></li>`;
    })
    .join('');
  const cams = `
    <section class="board">
      <h3 class="board__title"><span class="pulse pulse--live" aria-hidden="true"></span>Live cameras</h3>
      ${camLinks ? `<ul class="list list--cams">${camLinks}</ul>` : `<p class="empty">No live camera streams are listed right now.</p>`}
    </section>`;

  el.innerHTML = `
    <div class="starbase__media" aria-hidden="true">${backdrop ? pictureHtml(backdrop, { alt: '' }) : ''}</div>
    ${backdrop ? `<p class="credit starbase__credit">Flight ${BACKDROP_FLIGHT}. ${esc(creditText(backdrop))}</p>` : ''}
    <div class="starbase__inner">
      <header class="section-head">
        <p class="eyebrow"><span>Starbase, Texas. Local time <b data-clock>${esc(localClock())}</b></span></p>
        <h2 class="headline" id="starbase-title">Starbase</h2>
        <p class="lede">Where Starship is built, tested and launched, on the beach at the southern tip of Texas.</p>
      </header>
      <div class="weather" data-weather-panel>
        <h3 class="board__title">Weather at the pad</h3>
        <div data-weather><p class="empty">Loading live weather</p></div>
      </div>
      <div class="starbase__boards">${events}${roads}${cams}</div>
    </div>`;
  void loadWeather(el.querySelector('[data-weather-panel]')!);
  const clock = el.querySelector<HTMLElement>('[data-clock]')!;
  window.setInterval(() => (clock.textContent = localClock()), 30_000);
}
