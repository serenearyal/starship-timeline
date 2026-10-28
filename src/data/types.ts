// Data contract between the fetch pipeline (scripts/fetch-data.ts) and the UI.
// The pipeline writes one `SiteData` object to public/data/starship.json.

export type IsoDate = string;

/** How exact a launch date is. Mirrors Launch Library 2 `net_precision`. */
export type DatePrecision =
  | 'second'
  | 'minute'
  | 'hour'
  | 'morning'
  | 'afternoon'
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'half'
  | 'year'
  | 'unknown';

/** Normalised launch status. `go`/`tbc`/`tbd`/`hold`/`inflight` are upcoming states. */
export type LaunchStatus =
  | 'go'
  | 'tbc'
  | 'tbd'
  | 'hold'
  | 'inflight'
  | 'success'
  | 'partial'
  | 'failure';

export type VehicleVersion = 'V1' | 'V2' | 'V3' | 'V4';

/** Webcast-style event track. One entry per flight phase. */
export type PhaseState = 'done' | 'lost' | 'skipped' | 'pending' | 'unknown';

export interface Phase {
  key: string;
  label: string;
  state: PhaseState;
}

export type StageOutcome =
  | 'caught'
  | 'splashdown'
  | 'lost'
  | 'expended'
  | 'recovered'
  | 'pending'
  | 'unknown';

export interface Stage {
  /** Short serial as shown on the site, e.g. "B21" or "S41". Null when not assigned yet. */
  serial: string | null;
  /** 1 for the first flight of this vehicle, 2 for its first reflight, ... */
  flightOfVehicle: number | null;
  outcome: StageOutcome;
  /** One plain sentence about what happened to this stage. */
  outcomeText: string | null;
  phases: Phase[];
}

export interface Link {
  label: string;
  url: string;
}

export interface Flight {
  /** Stable id: LL2 launch id, or `curated-<n>` for curated-only entries. */
  id: string;
  /** Integrated flight test number (1, 2, ...). */
  number: number;
  /** "Flight 14" */
  name: string;
  /** Extra mission name when there is one, e.g. "Starlink Group 31-1". */
  missionName: string | null;
  net: IsoDate;
  netPrecision: DatePrecision;
  windowStart: IsoDate | null;
  windowEnd: IsoDate | null;
  status: LaunchStatus;
  /** Human status from LL2, e.g. "Go for Launch", "To Be Determined". */
  statusLabel: string;
  upcoming: boolean;
  version: VehicleVersion | null;
  pad: string | null;
  site: string | null;
  booster: Stage;
  ship: Stage;
  /** One or two sentences, curated when available, otherwise from LL2. */
  summary: string | null;
  /** Firsts and notable results, curated. */
  highlights: string[];
  /** Full LL2 mission description. */
  description: string | null;
  webcastLive: boolean;
  webcasts: Link[];
  links: Link[];
  /** Original LL2 image URL. The UI shows `photo`, which the pipeline builds from it. */
  image: string | null;
  /** The flight's photo, resized and served from this site; null when LL2 has no image or it failed. */
  photo: Photo | null;
  probability: number | null;
}

/** A photo resized by the pipeline and served from this site. Paths are relative to the site root. */
export interface Photo {
  /** 2400 px wide WebP, for large screens. */
  large: string;
  /** 1200 px wide WebP, for phones and cards. */
  small: string;
  /** 1600 px wide JPEG, for browsers without WebP. */
  jpeg: string;
  /** Size of `large` in pixels (the aspect ratio holds for all three). */
  width: number;
  height: number;
  /** Tiny blurred JPEG as a data URI, shown while the photo loads. */
  placeholder: string;
  /** Photographer or owner from LL2, e.g. "SpaceX". */
  credit: string | null;
  /** Licence name from LL2, e.g. "CC BY-NC 2.0". */
  license: string | null;
}

/** Any other Starship launch on the LL2 manifest (prototype hops, future commercial or NASA missions). */
export interface ManifestLaunch {
  id: string;
  name: string;
  missionName: string | null;
  missionType: string | null;
  net: IsoDate;
  netPrecision: DatePrecision;
  status: LaunchStatus;
  statusLabel: string;
  upcoming: boolean;
  vehicle: string | null;
  pad: string | null;
  description: string | null;
}

export interface StarbaseEvent {
  id: number;
  name: string;
  type: string;
  date: IsoDate;
  datePrecision: DatePrecision;
  description: string | null;
  location: string | null;
  webcastLive: boolean;
  url: string | null;
}

export interface RoadClosure {
  id: number;
  title: string;
  status: string;
  start: IsoDate;
  end: IsoDate;
}

export interface Notice {
  id: number;
  name: string;
  type: string | null;
  date: IsoDate | null;
  url: string | null;
}

export interface LiveStream {
  title: string;
  url: string;
  image: string | null;
}

export type VehicleKind = 'booster' | 'ship';

export interface FleetVehicle {
  /** "B21", "S41", "SN15", "Starhopper" */
  serial: string;
  kind: VehicleKind;
  /** LL2 status lowercased: active, destroyed, lost, retired, scrapped, expended, converted, unknown ... */
  status: string;
  flights: number;
  version: VehicleVersion | 'prototype' | null;
  details: string | null;
  firstFlight: IsoDate | null;
  lastFlight: IsoDate | null;
}

export interface Article {
  id: number;
  title: string;
  url: string;
  source: string;
  summary: string;
  publishedAt: IsoDate;
}

export interface Stats {
  flightsFlown: number;
  successfulFlights: number;
  boosterCatches: number;
  boosterSplashdowns: number;
  shipSplashdowns: number;
  shipCatches: number;
  reflights: number;
  lastFlightAt: IsoDate | null;
}

export interface SourceStatus {
  id: 'll2' | 'snapi';
  name: string;
  url: string;
  ok: boolean;
  /** When this source's data was actually fetched (older than generatedAt when we fell back). */
  fetchedAt: IsoDate | null;
  note: string | null;
}

export interface SiteData {
  schemaVersion: 1;
  generatedAt: IsoDate;
  sources: SourceStatus[];
  /** Integrated flight tests, oldest first, including upcoming ones. */
  flights: Flight[];
  /** The next upcoming flight (earliest future NET), or null. */
  nextFlightId: string | null;
  /** Other Starship launches: prototype hops (past) and missions on the manifest (future). */
  manifest: ManifestLaunch[];
  events: { upcoming: StarbaseEvent[]; recent: StarbaseEvent[] };
  roadClosures: RoadClosure[];
  notices: Notice[];
  liveStreams: LiveStream[];
  fleet: FleetVehicle[];
  news: Article[];
  stats: Stats;
  /**
   * Photos of the prototype tests before the integrated flights, keyed by vehicle:
   * "starhopper", "sn5", "sn6", "sn8", "sn9", "sn10", "sn11", "sn15". Missing keys mean no photo.
   */
  prototypePhotos: Record<string, Photo>;
}
