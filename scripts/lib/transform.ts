// Pure transforms from the upstream API shapes to the SiteData contract.
// No I/O here: scripts/fetch-data.ts does the network and file work.

import { BOOSTER_PHASES, SHIP_PHASES } from '../../src/data/phases.ts';
import type {
  Article,
  DatePrecision,
  FleetVehicle,
  Flight,
  LaunchStatus,
  Link,
  LiveStream,
  ManifestLaunch,
  Notice,
  Phase,
  PhaseState,
  RoadClosure,
  Stage,
  StageOutcome,
  StarbaseEvent,
  Stats,
  VehicleVersion,
} from '../../src/data/types.ts';
import type {
  LL2Dashboard,
  LL2Event,
  LL2Landing,
  LL2Launch,
  LL2Named,
  LL2Url,
  SnapiArticle,
} from './sources.ts';

// ---------------------------------------------------------------------------
// Small mappers

const STATUS_BY_ABBREV: Record<string, LaunchStatus> = {
  go: 'go',
  tbc: 'tbc',
  tbd: 'tbd',
  hold: 'hold',
  'in flight': 'inflight',
  success: 'success',
  'partial failure': 'partial',
  failure: 'failure',
};

/** LL2 status abbrev -> LaunchStatus. Anything unrecognised counts as "tbd" (upcoming). */
export function mapStatus(status: LL2Named | null | undefined): LaunchStatus {
  const key = (status?.abbrev ?? '').trim().toLowerCase();
  return STATUS_BY_ABBREV[key] ?? 'tbd';
}

export function isUpcomingStatus(status: LaunchStatus): boolean {
  return status !== 'success' && status !== 'partial' && status !== 'failure';
}

const PRECISION_BY_ABBREV: Record<string, DatePrecision> = {
  SEC: 'second',
  MIN: 'minute',
  HR: 'hour',
  HOUR: 'hour',
  MOR: 'morning',
  AFT: 'afternoon',
  D: 'day',
  DAY: 'day',
  W: 'week',
  WEEK: 'week',
  M: 'month',
  MONTH: 'month',
  Q1: 'quarter',
  Q2: 'quarter',
  Q3: 'quarter',
  Q4: 'quarter',
  H1: 'half',
  H2: 'half',
  Y: 'year',
  YEAR: 'year',
  FY: 'year',
};

const PRECISION_BY_NAME_PREFIX: Array<[string, DatePrecision]> = [
  ['second', 'second'],
  ['minute', 'minute'],
  ['hour', 'hour'],
  ['morning', 'morning'],
  ['afternoon', 'afternoon'],
  ['day', 'day'],
  ['week', 'week'],
  ['month', 'month'],
  ['quarter', 'quarter'],
  ['half', 'half'],
  ['year', 'year'],
  ['fiscal year', 'year'],
];

/** LL2 net_precision -> DatePrecision. Matches the abbrev first, then the name. */
export function mapPrecision(precision: LL2Named | null | undefined): DatePrecision {
  if (!precision) return 'unknown';
  const abbrev = (precision.abbrev ?? '').trim().toUpperCase();
  const byAbbrev = PRECISION_BY_ABBREV[abbrev];
  if (byAbbrev) return byAbbrev;
  const name = (precision.name ?? '').trim().toLowerCase();
  for (const [prefix, value] of PRECISION_BY_NAME_PREFIX) {
    if (name.startsWith(prefix)) return value;
  }
  return 'unknown';
}

/** "Starship V3" / variant "V3" -> "V3". Returns null when no V1-V4 marker exists. */
export function parseVersion(...candidates: Array<string | null | undefined>): VehicleVersion | null {
  for (const text of candidates) {
    const match = /\bV([1-4])\b/i.exec(text ?? '');
    if (match) return `V${match[1]}` as VehicleVersion;
  }
  return null;
}

/** "Booster 21" -> "B21". "S41", "SN15", "Starhopper" stay as they are. */
export function shortSerial(serial: string | null | undefined): string | null {
  const text = (serial ?? '').trim();
  if (!text) return null;
  const booster = /^(?:Booster|Super Heavy|B)\s*(\d+(?:\.\d+)?)$/i.exec(text);
  if (booster) return `B${booster[1]}`;
  const ship = /^(?:Ship)\s+(\d+(?:\.\d+)?)$/i.exec(text);
  if (ship) return `S${ship[1]}`;
  return text;
}

/**
 * Integrated flight test number from an LL2 launch name.
 * "Starship | Integrated Flight Test" -> 1, "... Integrated Flight Test 2" -> 2,
 * "Starship | Flight 7" -> 7, "Starship | Starlink Group 31-1 (Starship Flight 14)" -> 14.
 * Returns null for prototype hops and unnumbered missions.
 */
export function parseFlightNumber(name: string): number | null {
  const ift = /Integrated Flight Test(?:\s+(\d+))?\b/i.exec(name);
  if (ift) return ift[1] ? Number(ift[1]) : 1;
  const flight = /\bFlight\s+(\d+)\b/i.exec(name);
  return flight ? Number(flight[1]) : null;
}

/**
 * Extra mission name from an LL2 launch name, or null for plain test flights.
 * "Starship | Starlink Group 31-1 (Starship Flight 14)" -> "Starlink Group 31-1".
 */
export function parseMissionName(name: string): string | null {
  const afterPipe = name.includes('|') ? name.slice(name.indexOf('|') + 1) : name;
  const cleaned = afterPipe
    .replace(/\((?:Starship\s+)?(?:Integrated\s+)?Flight(?:\s+Test)?\s*\d*\)/i, '')
    .trim();
  if (!cleaned) return null;
  if (/^(?:Starship\s+)?(?:Integrated\s+)?Flight(?:\s+Test)?(?:\s+\d+)?$/i.test(cleaned)) return null;
  return cleaned;
}

/** First `count` sentences of a text, or null. */
export function firstSentences(text: string | null | undefined, count: number): string | null {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const sentences = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])/);
  return sentences.slice(0, count).join(' ');
}

function nonEmpty(text: string | null | undefined): string | null {
  const value = (text ?? '').trim();
  return value ? value : null;
}

function isHttpUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

/** LL2 vid_urls / info_urls -> Link[], sorted by LL2 priority (lower first), deduplicated by URL. */
export function urlsToLinks(urls: LL2Url[] | null | undefined): Link[] {
  const sorted = [...(urls ?? [])]
    .map((u, index) => ({ u, index }))
    .sort((a, b) => (a.u.priority ?? 999) - (b.u.priority ?? 999) || a.index - b.index);
  const seen = new Set<string>();
  const links: Link[] = [];
  for (const { u } of sorted) {
    if (!isHttpUrl(u.url) || seen.has(u.url)) continue;
    seen.add(u.url);
    links.push({ label: nonEmpty(u.title) ?? nonEmpty(u.publisher) ?? nonEmpty(u.source) ?? u.url, url: u.url });
  }
  return links;
}

export function dedupeLinks(links: Link[]): Link[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Phases and stage outcomes

export function phasesFrom(
  list: ReadonlyArray<{ key: string; label: string }>,
  states: Record<string, PhaseState>,
  fallback: PhaseState,
): Phase[] {
  return list.map(({ key, label }) => ({ key, label, state: states[key] ?? fallback }));
}

/** Caught when LL2 says RTLS, or the location is a tower (OLM-*, "tower", "chopsticks"). */
function isCatch(landing: LL2Landing): boolean {
  const type = (landing.type?.abbrev ?? landing.type?.name ?? '').toUpperCase();
  const location = `${landing.landing_location?.abbrev ?? ''} ${landing.landing_location?.name ?? ''}`.toUpperCase();
  return type === 'RTLS' || location.includes('OLM') || location.includes('TOWER') || location.includes('CHOPSTICK');
}

/** Stage outcome from LL2 landing data. Used for every past flight. */
export function outcomeFromLanding(landing: LL2Landing | null | undefined): StageOutcome {
  if (!landing || !landing.attempt || landing.success === null || landing.success === undefined) return 'unknown';
  if (landing.success === false) return 'lost';
  return isCatch(landing) ? 'caught' : 'splashdown';
}

/**
 * Default booster event track from LL2 data (curated entries refine it):
 * - upcoming: every phase pending.
 * - status failure: liftoff done, the rest unknown (LL2 cannot tell where it ended).
 * - success / partial: liftoff and staging done, then from the landing record:
 *   success true -> boostback, landing, recovery done;
 *   success false -> boostback unknown, landing and recovery lost;
 *   no attempt or null -> unknown.
 */
export function defaultBoosterPhases(status: LaunchStatus, landing: LL2Landing | null | undefined): Phase[] {
  if (isUpcomingStatus(status)) return phasesFrom(BOOSTER_PHASES, {}, 'pending');
  if (status === 'failure') return phasesFrom(BOOSTER_PHASES, { liftoff: 'done' }, 'unknown');
  const base: Record<string, PhaseState> = { liftoff: 'done', staging: 'done' };
  if (landing?.attempt && landing.success === true) {
    return phasesFrom(BOOSTER_PHASES, { ...base, boostback: 'done', landing: 'done', recovery: 'done' }, 'unknown');
  }
  if (landing?.attempt && landing.success === false) {
    return phasesFrom(BOOSTER_PHASES, { ...base, boostback: 'unknown', landing: 'lost', recovery: 'lost' }, 'unknown');
  }
  return phasesFrom(BOOSTER_PHASES, base, 'unknown');
}

/**
 * Default ship event track from LL2 data:
 * - upcoming: every phase pending.
 * - status failure: every phase unknown.
 * - success / partial: ascent and space done, deploy and relight unknown, then from the landing record:
 *   success true -> reentry and landing done; success false -> reentry unknown, landing lost;
 *   no attempt or null -> unknown.
 */
export function defaultShipPhases(status: LaunchStatus, landing: LL2Landing | null | undefined): Phase[] {
  if (isUpcomingStatus(status)) return phasesFrom(SHIP_PHASES, {}, 'pending');
  if (status === 'failure') return phasesFrom(SHIP_PHASES, {}, 'unknown');
  const base: Record<string, PhaseState> = { ascent: 'done', space: 'done', deploy: 'unknown', relight: 'unknown' };
  if (landing?.attempt && landing.success === true) {
    return phasesFrom(SHIP_PHASES, { ...base, reentry: 'done', landing: 'done' }, 'unknown');
  }
  if (landing?.attempt && landing.success === false) {
    return phasesFrom(SHIP_PHASES, { ...base, reentry: 'unknown', landing: 'lost' }, 'unknown');
  }
  return phasesFrom(SHIP_PHASES, base, 'unknown');
}

// ---------------------------------------------------------------------------
// Flights

function launcherStage(launch: LL2Launch) {
  return launch.rocket?.launcher_stage?.[0] ?? null;
}

function spacecraftStage(launch: LL2Launch) {
  const stage = launch.rocket?.spacecraft_stage;
  if (Array.isArray(stage)) return stage[0] ?? null;
  return stage ?? null;
}

function buildStage(
  serial: string | null,
  status: LaunchStatus,
  landing: LL2Landing | null | undefined,
  phases: Phase[],
): Stage {
  const upcoming = isUpcomingStatus(status);
  return {
    serial,
    flightOfVehicle: null,
    outcome: upcoming ? 'pending' : outcomeFromLanding(landing),
    outcomeText: upcoming ? null : firstSentences(landing?.description, 1),
    phases,
  };
}

/** True when the launch is a numbered integrated flight test. */
export function isIntegratedFlight(launch: LL2Launch): boolean {
  return parseFlightNumber(launch.name) !== null;
}

/** One LL2 launch -> Flight, without curated data and without flightOfVehicle. */
export function launchToFlight(launch: LL2Launch): Flight {
  const number = parseFlightNumber(launch.name);
  if (number === null) throw new Error(`Not an integrated flight: ${launch.name}`);
  const status = mapStatus(launch.status);
  const booster = launcherStage(launch);
  const ship = spacecraftStage(launch);
  const config = launch.rocket?.configuration;
  const links = urlsToLinks(launch.info_urls);
  if (isHttpUrl(launch.url)) links.push({ label: 'Launch Library 2', url: launch.url });
  return {
    id: launch.id,
    number,
    name: `Flight ${number}`,
    missionName: parseMissionName(launch.name),
    net: launch.net,
    netPrecision: mapPrecision(launch.net_precision),
    windowStart: launch.window_start ?? null,
    windowEnd: launch.window_end ?? null,
    status,
    statusLabel: nonEmpty(launch.status?.name) ?? status,
    upcoming: isUpcomingStatus(status),
    version: parseVersion(config?.variant, config?.full_name, config?.name),
    pad: nonEmpty(launch.pad?.name),
    site: nonEmpty(launch.pad?.location?.name),
    booster: buildStage(
      shortSerial(booster?.launcher?.serial_number),
      status,
      booster?.landing,
      defaultBoosterPhases(status, booster?.landing),
    ),
    ship: buildStage(
      shortSerial(ship?.spacecraft?.serial_number),
      status,
      ship?.landing,
      defaultShipPhases(status, ship?.landing),
    ),
    summary: firstSentences(launch.mission?.description, 2),
    highlights: [],
    description: nonEmpty(launch.mission?.description),
    webcastLive: launch.webcast_live === true,
    webcasts: urlsToLinks(launch.vid_urls),
    links: dedupeLinks(links),
    image: nonEmpty(launch.image?.image_url),
    probability: typeof launch.probability === 'number' ? launch.probability : null,
  };
}

function byNet(a: { net: string }, b: { net: string }): number {
  return Date.parse(a.net) - Date.parse(b.net);
}

/** Sort flights oldest first (by number, then NET) and set flightOfVehicle for each stage. */
export function finaliseFlights(flights: Flight[]): Flight[] {
  const sorted = [...flights].sort((a, b) => a.number - b.number || byNet(a, b));
  const boosterCount = new Map<string, number>();
  const shipCount = new Map<string, number>();
  const count = (map: Map<string, number>, serial: string | null): number | null => {
    if (!serial) return null;
    const n = (map.get(serial) ?? 0) + 1;
    map.set(serial, n);
    return n;
  };
  return sorted.map((flight) => ({
    ...flight,
    booster: { ...flight.booster, flightOfVehicle: count(boosterCount, flight.booster.serial) },
    ship: { ...flight.ship, flightOfVehicle: count(shipCount, flight.ship.serial) },
  }));
}

/** Integrated flight tests from the LL2 detailed launch list, oldest first, upcoming included. */
export function buildFlights(launches: LL2Launch[]): Flight[] {
  const byNumber = new Map<number, Flight>();
  for (const launch of launches) {
    if (!isIntegratedFlight(launch)) continue;
    const flight = launchToFlight(launch);
    // If LL2 ever lists the same number twice, keep the later NET (the rescheduled entry).
    const existing = byNumber.get(flight.number);
    if (!existing || byNet(existing, flight) < 0) byNumber.set(flight.number, flight);
  }
  return finaliseFlights([...byNumber.values()]);
}

/** Every Starship launch that is not a numbered integrated flight: prototype hops and future missions. */
export function buildManifest(launches: LL2Launch[]): ManifestLaunch[] {
  return launches
    .filter((launch) => !isIntegratedFlight(launch))
    .map((launch): ManifestLaunch => {
      const status = mapStatus(launch.status);
      const config = launch.rocket?.configuration;
      const prototype = /prototype/i.test(config?.full_name ?? config?.name ?? '');
      const serial = shortSerial(launcherStage(launch)?.launcher?.serial_number);
      return {
        id: launch.id,
        name: launch.name,
        missionName: nonEmpty(launch.mission?.name),
        missionType: nonEmpty(launch.mission?.type),
        net: launch.net,
        netPrecision: mapPrecision(launch.net_precision),
        status,
        statusLabel: nonEmpty(launch.status?.name) ?? status,
        upcoming: isUpcomingStatus(status),
        vehicle: (prototype ? serial : null) ?? nonEmpty(config?.full_name) ?? nonEmpty(config?.name),
        pad: nonEmpty(launch.pad?.name),
        description: nonEmpty(launch.mission?.description),
      };
    })
    .sort(byNet);
}

/** The earliest upcoming flight, or null. */
export function findNextFlightId(flights: Flight[]): string | null {
  const upcoming = flights.filter((f) => f.upcoming).sort((a, b) => byNet(a, b) || a.number - b.number);
  return upcoming[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Dashboard: events, closures, notices, streams

function eventToStarbase(event: LL2Event): StarbaseEvent {
  const location = typeof event.location === 'string' ? event.location : event.location?.name;
  const url = urlsToLinks(event.vid_urls)[0]?.url ?? urlsToLinks(event.info_urls)[0]?.url ?? null;
  return {
    id: event.id,
    name: event.name,
    type: nonEmpty(event.type?.name) ?? 'Event',
    date: event.date,
    datePrecision: mapPrecision(event.date_precision),
    description: nonEmpty(event.description),
    location: nonEmpty(location),
    webcastLive: event.webcast_live === true,
    url,
  };
}

export const RECENT_EVENT_LIMIT = 12;

export function buildEvents(dashboard: LL2Dashboard): { upcoming: StarbaseEvent[]; recent: StarbaseEvent[] } {
  const valid = (e: LL2Event | null | undefined): e is LL2Event =>
    !!e && typeof e.id === 'number' && typeof e.name === 'string' && !Number.isNaN(Date.parse(e.date));
  const upcoming = (dashboard.upcoming?.events ?? []).filter(valid).map(eventToStarbase);
  const recent = (dashboard.previous?.events ?? []).filter(valid).map(eventToStarbase);
  upcoming.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  recent.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return { upcoming, recent: recent.slice(0, RECENT_EVENT_LIMIT) };
}

export function buildRoadClosures(dashboard: LL2Dashboard): RoadClosure[] {
  const closures: RoadClosure[] = [];
  for (const c of dashboard.road_closures ?? []) {
    if (!c || typeof c.id !== 'number' || !c.window_start || !c.window_end) continue;
    const status = typeof c.status === 'string' ? c.status : c.status?.name;
    closures.push({
      id: c.id,
      title: nonEmpty(c.title) ?? 'Road closure',
      status: nonEmpty(status) ?? 'Unknown',
      start: c.window_start,
      end: c.window_end,
    });
  }
  return closures.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export function buildNotices(dashboard: LL2Dashboard): Notice[] {
  const notices: Notice[] = [];
  for (const n of dashboard.notices ?? []) {
    if (!n || typeof n.id !== 'number') continue;
    notices.push({
      id: n.id,
      name: nonEmpty(n.name) ?? 'Notice',
      type: nonEmpty(n.type?.name),
      date: nonEmpty(n.date),
      url: isHttpUrl(n.url) ? n.url : null,
    });
  }
  return notices;
}

export function buildLiveStreams(dashboard: LL2Dashboard): LiveStream[] {
  const streams: LiveStream[] = [];
  for (const s of dashboard.live_streams ?? []) {
    if (!s || !isHttpUrl(s.url)) continue;
    streams.push({ title: nonEmpty(s.title) ?? 'Live stream', url: s.url, image: isHttpUrl(s.image) ? s.image : null });
  }
  return streams;
}

// ---------------------------------------------------------------------------
// Fleet

function serialSortKey(serial: string): [string, number] {
  const match = /^(\D*?)\s*(\d+(?:\.\d+)?)/.exec(serial);
  if (!match) return [serial, Number.POSITIVE_INFINITY];
  return [match[1] ?? '', Number(match[2])];
}

function compareFleet(a: FleetVehicle, b: FleetVehicle): number {
  if (a.kind !== b.kind) return a.kind === 'booster' ? -1 : 1;
  const aProto = a.version === 'prototype';
  const bProto = b.version === 'prototype';
  if (aProto !== bProto) return aProto ? -1 : 1;
  const [aPrefix, aNum] = serialSortKey(a.serial);
  const [bPrefix, bNum] = serialSortKey(b.serial);
  if (aPrefix !== bPrefix) return aPrefix.localeCompare(bPrefix);
  return aNum - bNum;
}

function lowerStatus(status: LL2Named | null | undefined): string {
  const name = (status?.name ?? '').trim().toLowerCase();
  return !name || name === 'n/a' ? 'unknown' : name;
}

/** First and last NET per stage serial, from past integrated flights. */
function flightDatesBySerial(flights: Flight[]): Map<string, { first: string; last: string }> {
  const dates = new Map<string, { first: string; last: string }>();
  for (const flight of flights) {
    if (flight.upcoming) continue;
    for (const serial of [flight.booster.serial, flight.ship.serial]) {
      if (!serial) continue;
      const entry = dates.get(serial);
      if (!entry) dates.set(serial, { first: flight.net, last: flight.net });
      else {
        if (Date.parse(flight.net) < Date.parse(entry.first)) entry.first = flight.net;
        if (Date.parse(flight.net) > Date.parse(entry.last)) entry.last = flight.net;
      }
    }
  }
  return dates;
}

/**
 * Boosters and ships from the dashboard.
 * LL2 lists ship prototypes (Starhopper, Mk1, SN*) under `vehicles` with the "Starship Prototype" config;
 * they become kind "ship" with version "prototype". Super Heavy prototypes (BN*, Booster 3) stay boosters.
 */
export function buildFleet(dashboard: LL2Dashboard, flights: Flight[]): FleetVehicle[] {
  const dates = flightDatesBySerial(flights);
  const fleet: FleetVehicle[] = [];
  for (const v of dashboard.vehicles ?? []) {
    const serial = shortSerial(v?.serial_number);
    if (!v || !serial || v.is_placeholder || /^unknown\b/i.test(serial)) continue;
    const config = v.launcher_config;
    const configText = `${config?.full_name ?? ''} ${config?.name ?? ''} ${config?.variant ?? ''}`;
    const prototype = /prototype/i.test(configText);
    const shipPrototype = prototype && /starship prototype/i.test(configText);
    const derived = dates.get(serial);
    fleet.push({
      serial,
      kind: shipPrototype ? 'ship' : 'booster',
      status: lowerStatus(v.status),
      flights: typeof v.flights === 'number' ? v.flights : 0,
      version: prototype ? 'prototype' : parseVersion(config?.variant, config?.full_name),
      details: nonEmpty(v.details),
      firstFlight: nonEmpty(v.first_launch_date) ?? derived?.first ?? null,
      lastFlight: nonEmpty(v.last_launch_date) ?? derived?.last ?? null,
    });
  }
  for (const o of dashboard.orbiters ?? []) {
    const serial = shortSerial(o?.serial_number);
    if (!o || !serial || o.is_placeholder || /^unknown\b/i.test(serial)) continue;
    const derived = dates.get(serial);
    fleet.push({
      serial,
      kind: 'ship',
      status: lowerStatus(o.status),
      flights: typeof o.flights_count === 'number' ? o.flights_count : 0,
      version: parseVersion(o.spacecraft_config?.name),
      details: nonEmpty(o.description),
      firstFlight: derived?.first ?? null,
      lastFlight: derived?.last ?? null,
    });
  }
  return fleet.sort(compareFleet);
}

// ---------------------------------------------------------------------------
// Stats

/**
 * Counters over past integrated flights.
 * `reflights` counts reflown stages (a flight with a reflown booster and ship counts twice).
 */
export function buildStats(flights: Flight[]): Stats {
  const flown = flights.filter((f) => !f.upcoming);
  const count = (pred: (f: Flight) => boolean) => flown.filter(pred).length;
  const last = [...flown].sort(byNet).at(-1);
  return {
    flightsFlown: flown.length,
    successfulFlights: count((f) => f.status === 'success'),
    boosterCatches: count((f) => f.booster.outcome === 'caught'),
    boosterSplashdowns: count((f) => f.booster.outcome === 'splashdown'),
    shipSplashdowns: count((f) => f.ship.outcome === 'splashdown'),
    shipCatches: count((f) => f.ship.outcome === 'caught'),
    reflights:
      count((f) => (f.booster.flightOfVehicle ?? 0) > 1) + count((f) => (f.ship.flightOfVehicle ?? 0) > 1),
    lastFlightAt: last?.net ?? null,
  };
}

// ---------------------------------------------------------------------------
// News

export const NEWS_LIMIT = 12;
export const SUMMARY_MAX = 280;

const ROBOT_PATTERN = /starship technologies|delivery robot/i;

/** True for articles about Starship Technologies, the delivery-robot company. */
export function isDeliveryRobotArticle(article: Pick<SnapiArticle, 'title' | 'summary'>): boolean {
  return ROBOT_PATTERN.test(article.title ?? '') || ROBOT_PATTERN.test(article.summary ?? '');
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '-',
  mdash: '-',
};

/** Strip HTML tags and entities, the WordPress "The post ... appeared first on ..." tail, and extra whitespace. */
export function cleanSummary(text: string | null | undefined, max = SUMMARY_MAX): string {
  let clean = (text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s*The post .* appeared first on .*$/s, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length > max) {
    const cut = clean.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    clean = `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:\-…]+$/, '')}…`;
  }
  return clean;
}

/** SNAPI articles -> newest NEWS_LIMIT articles about the rocket. */
export function buildNews(articles: SnapiArticle[]): Article[] {
  return articles
    .filter((a) => a && typeof a.id === 'number' && isHttpUrl(a.url) && !Number.isNaN(Date.parse(a.published_at)))
    .filter((a) => !isDeliveryRobotArticle(a))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
    .slice(0, NEWS_LIMIT)
    .map((a) => ({
      id: a.id,
      title: (a.title ?? '').replace(/\s+/g, ' ').trim(),
      url: a.url,
      source: nonEmpty(a.news_site) ?? new URL(a.url).hostname,
      summary: cleanSummary(a.summary),
      publishedAt: a.published_at,
    }));
}
