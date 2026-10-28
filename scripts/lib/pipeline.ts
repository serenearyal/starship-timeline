// Assembles SiteData from the three sources, with fallback to the previously published data.
// All I/O comes in through `PipelineInput`, so tests can drive every path with fixtures.

import { BOOSTER_PHASES, SHIP_PHASES } from '../../src/data/phases.ts';
import type { FleetVehicle, Flight, ManifestLaunch, SiteData, SourceStatus } from '../../src/data/types.ts';
import { applyCurated, validateCurated } from './curated.ts';
import { asDashboard, asLaunchList, asSnapiList } from './sources.ts';
import type { LL2Dashboard } from './sources.ts';
import {
  buildEvents,
  buildFleet,
  buildFlights,
  buildLiveStreams,
  buildManifest,
  buildNews,
  buildNotices,
  buildRoadClosures,
  buildImageCredits,
  buildPrototypeSources,
  buildStats,
  finaliseFlights,
  findNextFlightId,
} from './transform.ts';
import type { PhotoSource } from './transform.ts';

export const LL2_DASHBOARD_URL = 'https://ll.thespacedevs.com/2.3.0/dashboard/starship/';
// Newest first, so a growing manifest never pushes the latest flights off the page.
export const LL2_LAUNCHES_URL =
  'https://ll.thespacedevs.com/2.3.0/launches/?search=starship&mode=detailed&limit=100&ordering=-net';
export const SNAPI_URL = 'https://api.spaceflightnewsapi.net/v4/articles/?search=starship&limit=40&ordering=-published_at';

export interface PipelineInput {
  fetchDashboard: () => Promise<unknown>;
  fetchLaunches: () => Promise<unknown>;
  fetchNews: () => Promise<unknown>;
  /** Previously published SiteData, or null. Called at most once, and only when a source failed. */
  loadPrevious: () => Promise<unknown>;
  /** Parsed data/curated/flights.json (null or undefined when the file is missing). */
  curated: unknown;
  now: Date;
}

export interface PipelineResult {
  data: SiteData;
  /** One line per source, plus warnings. */
  log: string[];
  /** Image credits and prototype photo sources for scripts/lib/images.ts. */
  photoSources: PhotoSources;
}

export interface PhotoSources {
  /** Credit and licence per LL2 image URL, from this run's launch list (empty when it failed). */
  credits: Map<string, PhotoSource>;
  /** Prototype photo sources by key ("starhopper", "sn8", ...) from this run's launch list. */
  prototypes: Record<string, PhotoSource>;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

async function attempt<T>(run: () => Promise<unknown>, parse: (raw: unknown) => T): Promise<Outcome<T>> {
  try {
    return { ok: true, value: parse(await run()) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Loose check that an object is SiteData we can reuse parts of. */
export function asPreviousData(raw: unknown): SiteData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Partial<SiteData>;
  if (data.schemaVersion !== 1 || !Array.isArray(data.flights)) return null;
  return data as SiteData;
}

/** Throws when the final object is not safe to publish. */
export function validateSiteData(data: SiteData): void {
  const errors: string[] = [];
  if (!Array.isArray(data.flights) || data.flights.length === 0) errors.push('flights is empty');
  const numbers = new Set<number>();
  for (const [i, f] of (data.flights ?? []).entries()) {
    const where = `flights[${i}]`;
    if (!Number.isInteger(f.number) || f.number < 1) errors.push(`${where}: bad number ${String(f.number)}`);
    if (numbers.has(f.number)) errors.push(`${where}: duplicate number ${f.number}`);
    numbers.add(f.number);
    if (typeof f.net !== 'string' || Number.isNaN(Date.parse(f.net))) errors.push(`${where}: bad net`);
    const boosterKeys = f.booster?.phases?.map((p) => p.key).join(',');
    const shipKeys = f.ship?.phases?.map((p) => p.key).join(',');
    if (boosterKeys !== BOOSTER_PHASES.map((p) => p.key).join(',')) errors.push(`${where}: booster phases incomplete`);
    if (shipKeys !== SHIP_PHASES.map((p) => p.key).join(',')) errors.push(`${where}: ship phases incomplete`);
  }
  if (data.nextFlightId !== null && !data.flights.some((f) => f.id === data.nextFlightId)) {
    errors.push(`nextFlightId ${data.nextFlightId} is not in flights`);
  }
  if (errors.length > 0) throw new Error(`site data is invalid:\n  - ${errors.join('\n  - ')}`);
}

export async function buildSiteData(input: PipelineInput): Promise<PipelineResult> {
  const nowIso = input.now.toISOString();
  const log: string[] = [];
  const curated = validateCurated(input.curated ?? []);

  const [dashboard, launches, news] = await Promise.all([
    attempt(input.fetchDashboard, asDashboard),
    attempt(input.fetchLaunches, asLaunchList),
    attempt(input.fetchNews, (raw) => asSnapiList(raw).results),
  ]);

  let previousLoaded = false;
  let previousCache: SiteData | null = null;
  const previous = async (): Promise<SiteData | null> => {
    if (!previousLoaded) {
      previousLoaded = true;
      try {
        previousCache = asPreviousData(await input.loadPrevious());
      } catch (error) {
        log.push(`previous data: unavailable (${error instanceof Error ? error.message : String(error)})`);
        previousCache = null;
      }
    }
    return previousCache;
  };
  const previousSource = (prev: SiteData | null, id: SourceStatus['id']) =>
    prev?.sources?.find((s) => s.id === id) ?? null;

  // --- Launch Library 2: flights and manifest from the launch list, the rest from the dashboard.
  let flights: Flight[];
  let manifest: ManifestLaunch[];
  const photoSources: PhotoSources = { credits: new Map(), prototypes: {} };
  const ll2Errors: string[] = [];
  if (launches.ok) {
    const { results, count } = launches.value;
    flights = buildFlights(results);
    photoSources.credits = buildImageCredits(results);
    photoSources.prototypes = buildPrototypeSources(results);
    manifest = buildManifest(results);
    // Past the first page, older launches are carried over from the previous data.
    if (typeof count === 'number' && count > results.length) {
      const prev = await previous();
      const numbers = new Set(flights.map((f) => f.number));
      const ids = new Set(manifest.map((m) => m.id));
      const olderFlights = (prev?.flights ?? []).filter((f) => !numbers.has(f.number) && !f.upcoming);
      const olderManifest = (prev?.manifest ?? []).filter((m) => !ids.has(m.id) && !m.upcoming);
      flights = [...flights, ...olderFlights];
      manifest = [...manifest, ...olderManifest].sort((a, b) => Date.parse(a.net) - Date.parse(b.net));
      log.push(`ll2: ${count} launches, first page has ${results.length}; kept ${olderFlights.length} older flights`);
    }
  } else {
    ll2Errors.push(`launches: ${launches.error}`);
    const prev = await previous();
    if (!prev || prev.flights.length === 0) {
      throw new Error(`LL2 launches failed (${launches.error}) and there is no previous data to fall back on`);
    }
    flights = prev.flights;
    manifest = prev.manifest ?? [];
  }

  const merged = applyCurated(flights, curated);
  flights = finaliseFlights(merged.flights);
  if (merged.unmatched.length > 0) {
    log.push(`curated: no LL2 flight for number(s) ${merged.unmatched.join(', ')}; ignored`);
  }

  let events: SiteData['events'];
  let roadClosures: SiteData['roadClosures'];
  let notices: SiteData['notices'];
  let liveStreams: SiteData['liveStreams'];
  let fleet: FleetVehicle[];
  if (dashboard.ok) {
    const d: LL2Dashboard = dashboard.value;
    events = buildEvents(d);
    roadClosures = buildRoadClosures(d);
    notices = buildNotices(d);
    liveStreams = buildLiveStreams(d);
    fleet = buildFleet(d, flights);
  } else {
    ll2Errors.push(`dashboard: ${dashboard.error}`);
    const prev = await previous();
    if (!prev) {
      throw new Error(`LL2 dashboard failed (${dashboard.error}) and there is no previous data to fall back on`);
    }
    events = prev.events ?? { upcoming: [], recent: [] };
    roadClosures = prev.roadClosures ?? [];
    notices = prev.notices ?? [];
    liveStreams = prev.liveStreams ?? [];
    fleet = prev.fleet ?? [];
  }

  let ll2Status: SourceStatus;
  if (ll2Errors.length === 0) {
    ll2Status = { id: 'll2', name: 'Launch Library 2', url: 'https://thespacedevs.com/llapi', ok: true, fetchedAt: nowIso, note: null };
  } else {
    const old = previousSource(await previous(), 'll2');
    ll2Status = {
      id: 'll2',
      name: 'Launch Library 2',
      url: 'https://thespacedevs.com/llapi',
      ok: false,
      fetchedAt: old?.fetchedAt ?? null,
      note: `Fetch failed (${ll2Errors.join('; ')}); showing earlier data.`,
    };
  }
  log.push(
    `ll2: ${ll2Status.ok ? 'ok' : `FALLBACK (${ll2Errors.join('; ')})`}, ${flights.length} flights, ` +
      `${manifest.length} manifest, ${fleet.length} fleet, ${events.upcoming.length}+${events.recent.length} events, ` +
      `${roadClosures.length} closures, ${notices.length} notices, ${liveStreams.length} streams`,
  );

  // --- Spaceflight News API
  let articles: SiteData['news'];
  let snapiStatus: SourceStatus;
  const snapiBase = { id: 'snapi' as const, name: 'Spaceflight News API', url: 'https://spaceflightnewsapi.net' };
  if (news.ok) {
    articles = buildNews(news.value);
    snapiStatus = { ...snapiBase, ok: true, fetchedAt: nowIso, note: null };
    log.push(`snapi: ok, ${articles.length} articles kept of ${news.value.length}`);
  } else {
    const prev = await previous();
    articles = prev?.news ?? [];
    snapiStatus = {
      ...snapiBase,
      ok: false,
      fetchedAt: previousSource(prev, 'snapi')?.fetchedAt ?? null,
      note: `Fetch failed (${news.error}); showing earlier news.`,
    };
    log.push(`snapi: FALLBACK (${news.error}), reused ${articles.length} articles`);
  }

  const data: SiteData = {
    schemaVersion: 1,
    generatedAt: nowIso,
    sources: [ll2Status, snapiStatus],
    flights,
    nextFlightId: findNextFlightId(flights),
    manifest,
    events,
    roadClosures,
    notices,
    liveStreams,
    fleet,
    news: articles,
    stats: buildStats(flights),
    // Filled in by scripts/lib/images.ts.
    prototypePhotos: {},
  };
  validateSiteData(data);
  return { data, log, photoSources };
}
