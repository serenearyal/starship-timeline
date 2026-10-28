// Loose shapes of the upstream API responses we read.
// Every field is optional: the transforms must survive missing or null data.

export interface LL2Named {
  id?: number;
  name?: string | null;
  abbrev?: string | null;
}

export interface LL2Url {
  priority?: number | null;
  title?: string | null;
  publisher?: string | null;
  source?: string | null;
  url?: string | null;
}

export interface LL2Landing {
  attempt?: boolean | null;
  success?: boolean | null;
  description?: string | null;
  type?: LL2Named | null;
  landing_location?: LL2Named | null;
}

export interface LL2LauncherStage {
  launcher?: { serial_number?: string | null } | null;
  landing?: LL2Landing | null;
}

export interface LL2SpacecraftStage {
  spacecraft?: { serial_number?: string | null } | null;
  landing?: LL2Landing | null;
}

export interface LL2Launch {
  id: string;
  url?: string | null;
  name: string;
  net: string;
  net_precision?: LL2Named | null;
  window_start?: string | null;
  window_end?: string | null;
  status?: LL2Named | null;
  image?: { image_url?: string | null } | null;
  probability?: number | null;
  webcast_live?: boolean | null;
  rocket?: {
    configuration?: { name?: string | null; full_name?: string | null; variant?: string | null } | null;
    launcher_stage?: LL2LauncherStage[] | null;
    spacecraft_stage?: LL2SpacecraftStage | LL2SpacecraftStage[] | null;
  } | null;
  mission?: { name?: string | null; description?: string | null; type?: string | null } | null;
  pad?: { name?: string | null; location?: { name?: string | null } | null } | null;
  vid_urls?: LL2Url[] | null;
  info_urls?: LL2Url[] | null;
}

export interface LL2Event {
  id: number;
  name: string;
  date: string;
  date_precision?: LL2Named | null;
  type?: LL2Named | null;
  description?: string | null;
  location?: string | { name?: string | null } | null;
  webcast_live?: boolean | null;
  vid_urls?: LL2Url[] | null;
  info_urls?: LL2Url[] | null;
}

export interface LL2Vehicle {
  serial_number?: string | null;
  is_placeholder?: boolean | null;
  status?: LL2Named | null;
  flights?: number | null;
  details?: string | null;
  first_launch_date?: string | null;
  last_launch_date?: string | null;
  launcher_config?: { name?: string | null; full_name?: string | null; variant?: string | null } | null;
}

export interface LL2Orbiter {
  serial_number?: string | null;
  is_placeholder?: boolean | null;
  status?: LL2Named | null;
  flights_count?: number | null;
  description?: string | null;
  spacecraft_config?: { name?: string | null } | null;
}

export interface LL2RoadClosure {
  id?: number;
  title?: string | null;
  status?: LL2Named | string | null;
  window_start?: string | null;
  window_end?: string | null;
}

export interface LL2Notice {
  id?: number;
  name?: string | null;
  type?: LL2Named | null;
  date?: string | null;
  url?: string | null;
}

export interface LL2LiveStream {
  title?: string | null;
  url?: string | null;
  image?: string | null;
}

export interface LL2Dashboard {
  live_streams?: LL2LiveStream[] | null;
  road_closures?: LL2RoadClosure[] | null;
  notices?: LL2Notice[] | null;
  vehicles?: LL2Vehicle[] | null;
  orbiters?: LL2Orbiter[] | null;
  upcoming?: { events?: LL2Event[] | null } | null;
  previous?: { events?: LL2Event[] | null } | null;
}

export interface LL2LaunchList {
  count?: number;
  results: LL2Launch[];
}

export interface SnapiArticle {
  id: number;
  title: string;
  url: string;
  news_site?: string | null;
  summary?: string | null;
  published_at: string;
}

export interface SnapiList {
  results: SnapiArticle[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Throws when the response is not a LL2 dashboard. */
export function asDashboard(value: unknown): LL2Dashboard {
  if (!isObject(value) || !Array.isArray(value.vehicles) || !Array.isArray(value.orbiters)) {
    throw new Error('LL2 dashboard response has no vehicles/orbiters arrays');
  }
  return value as LL2Dashboard;
}

/** Throws when the response is not a LL2 launch list. */
export function asLaunchList(value: unknown): LL2LaunchList {
  if (!isObject(value) || !Array.isArray(value.results)) {
    throw new Error('LL2 launch response has no results array');
  }
  return value as unknown as LL2LaunchList;
}

/** Throws when the response is not a SNAPI article list. */
export function asSnapiList(value: unknown): SnapiList {
  if (!isObject(value) || !Array.isArray(value.results)) {
    throw new Error('SNAPI response has no results array');
  }
  return value as unknown as SnapiList;
}
