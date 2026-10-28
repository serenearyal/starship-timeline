import type { SiteData } from '../data/types.ts';
import { esc, fmtDate, netText, relTime, safeUrl } from './format.ts';

const STARBASE = { lat: 25.9971, lon: -97.1554, tz: 'America/Chicago' };

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
  return `<div class="stat"><div class="stat__label">${esc(label)}</div><div class="stat__value" style="font-size:19px">${value}</div></div>`;
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
      <div class="weather__now">
        <span class="weather__temp">${Math.round(w.temperature_2m)}<span class="weather__unit">°C</span></span>
        <span class="weather__desc">${esc(WEATHER[w.weather_code] ?? 'Conditions unavailable')}<br>${f}°F, feels like ${Math.round(w.apparent_temperature)}°C</span>
      </div>
      <div class="weather__grid">
        ${statHtml('Wind', `${Math.round(w.wind_speed_10m)}<span class="stat__unit">kn ${dir}</span>`)}
        ${statHtml('Gusts', `${Math.round(w.wind_gusts_10m)}<span class="stat__unit">kn</span>`)}
        ${statHtml('Cloud cover', `${Math.round(w.cloud_cover)}<span class="stat__unit">%</span>`)}
        ${statHtml('Humidity', `${Math.round(w.relative_humidity_2m)}<span class="stat__unit">%</span>`)}
      </div>`;
  } catch {
    body.innerHTML = `<p class="empty">Live weather is not available right now. It loads from Open-Meteo each time you open the page.</p>`;
  }
}

export function renderStarbase(el: HTMLElement, data: SiteData): void {
  const now = Date.now();
  const upcoming = data.events.upcoming.filter((e) => Date.parse(e.date) > now - 6 * 3600e3);
  const recent = data.events.recent.slice(0, 4);
  const closures = data.roadClosures.filter((c) => Date.parse(c.end) > now);

  const eventItem = (e: (typeof recent)[number]) => {
    const url = safeUrl(e.url);
    const name = esc(e.name.replace(/^SpaceX /, ''));
    return `<li><span class="list-plain__time">${esc(e.datePrecision === 'minute' || e.datePrecision === 'hour' || e.datePrecision === 'second' ? fmtDate(e.date) : netText(e.date, e.datePrecision))}</span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${name}</a>` : name}</li>`;
  };

  const activity = `
    <div class="panel glass">
      <p class="panel__title"><span>Tests and events</span></p>
      ${
        upcoming.length
          ? `<ul class="list-plain">${upcoming.slice(0, 4).map(eventItem).join('')}</ul>`
          : `<p class="empty">No tests announced yet. Static fires and rollouts appear here as soon as they are scheduled.</p>`
      }
      ${recent.length ? `<p class="panel__title" style="margin-top:22px"><span>Recently</span></p><ul class="list-plain">${recent.map(eventItem).join('')}</ul>` : ''}
    </div>`;

  const roads = `
    <div class="panel glass">
      <p class="panel__title"><span>Highway 4 closures</span></p>
      ${
        closures.length
          ? `<ul class="list-plain">${closures
              .map(
                (c) =>
                  `<li><span class="list-plain__time">${esc(fmtDate(c.start))}, ${esc(new Date(c.start).toISOString().slice(11, 16))} to ${esc(new Date(c.end).toISOString().slice(11, 16))} UTC</span>${esc(c.title)} <span class="chip" style="margin-left:6px">${esc(c.status)}</span></li>`,
              )
              .join('')}</ul>`
          : `<p class="empty">No road closures are posted right now. Closures for tests and launches usually appear a few days ahead.</p>`
      }
      ${
        data.notices.length
          ? `<p class="panel__title" style="margin-top:22px"><span>Notices</span></p><ul class="list-plain">${data.notices
              .slice(0, 4)
              .map((n) => {
                const url = safeUrl(n.url);
                return `<li>${n.date ? `<span class="list-plain__time">${esc(fmtDate(n.date))}</span>` : ''}${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(n.name)}</a>` : esc(n.name)}</li>`;
              })
              .join('')}</ul>`
          : ''
      }
    </div>`;

  const weather = `
    <div class="panel glass" data-weather-panel>
      <p class="panel__title"><span>Weather at the pad</span><span data-clock>${esc(localClock())}</span></p>
      <div data-weather><p class="empty">Loading live weather</p></div>
    </div>`;

  const cams = data.liveStreams.length
    ? `<div class="cams">${data.liveStreams
        .slice(0, 3)
        .map((s) => {
          const url = safeUrl(s.url);
          if (!url) return '';
          return `<a class="cam glass" href="${esc(url)}" target="_blank" rel="noopener">
            <span class="cam__live">Live camera</span>
            <span class="cam__title">${esc(camName(s.title))}</span>
            <span class="cam__via">Watch on ${esc(hostName(url))}</span>
          </a>`;
        })
        .join('')}</div>`
    : '';

  el.innerHTML = weather + activity + roads + cams;
  void loadWeather(el.querySelector('[data-weather-panel]')!);
  const clock = el.querySelector<HTMLElement>('[data-clock]')!;
  window.setInterval(() => (clock.textContent = localClock()), 30_000);
}

export function lastSyncText(data: SiteData): string {
  return `Synced ${relTime(data.generatedAt)}`;
}
