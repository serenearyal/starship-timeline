// Curated flight overrides (data/curated/flights.json): validator and merge.
//
// File format: an array of entries.
//   {
//     "number": 5,                          // integrated flight number, required, unique
//     "missionName"?: string | null,
//     "summary"?: string,
//     "highlights"?: string[],
//     "links"?: [{ "label": string, "url": "https://..." }],
//     "booster"?: { "serial"?, "outcome"?, "outcomeText"?, "phases"?: { [phaseKey]: PhaseState } },
//     "ship"?:    { same, with ship phase keys },
//     "onlyWhileUpcoming"?: true            // plans: dropped once the flight has flown
//   }
// Keys that start with "_" are comments and are ignored.
// Curated fields win field by field. Phases merge per key on top of the LL2 defaults.
// Curated links come first, then the LL2 links that are not already listed.

import { BOOSTER_PHASES, SHIP_PHASES } from '../../src/data/phases.ts';
import type { Flight, Link, PhaseState, Stage, StageOutcome } from '../../src/data/types.ts';
import { dedupeLinks, phasesFrom } from './transform.ts';

export interface CuratedStage {
  serial?: string | null;
  outcome?: StageOutcome;
  outcomeText?: string | null;
  phases?: Record<string, PhaseState>;
}

export interface CuratedFlight {
  number: number;
  missionName?: string | null;
  summary?: string;
  highlights?: string[];
  links?: Link[];
  booster?: CuratedStage;
  ship?: CuratedStage;
  onlyWhileUpcoming?: boolean;
}

const PHASE_STATES: readonly PhaseState[] = ['done', 'lost', 'skipped', 'pending', 'unknown'];
const STAGE_OUTCOMES: readonly StageOutcome[] = [
  'caught',
  'splashdown',
  'lost',
  'expended',
  'recovered',
  'pending',
  'unknown',
];
const FLIGHT_KEYS = ['number', 'missionName', 'summary', 'highlights', 'links', 'booster', 'ship', 'onlyWhileUpcoming'];
const STAGE_KEYS = ['serial', 'outcome', 'outcomeText', 'phases'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkKeys(obj: Record<string, unknown>, allowed: string[], where: string, errors: string[]): void {
  for (const key of Object.keys(obj)) {
    if (!key.startsWith('_') && !allowed.includes(key)) {
      errors.push(`${where}: unknown key "${key}" (allowed: ${allowed.join(', ')})`);
    }
  }
}

function checkStage(
  value: unknown,
  phaseKeys: readonly string[],
  where: string,
  errors: string[],
): void {
  if (!isObject(value)) {
    errors.push(`${where}: must be an object`);
    return;
  }
  checkKeys(value, STAGE_KEYS, where, errors);
  if ('serial' in value && value.serial !== null && typeof value.serial !== 'string') {
    errors.push(`${where}.serial: must be a string or null`);
  }
  if ('outcome' in value && !STAGE_OUTCOMES.includes(value.outcome as StageOutcome)) {
    errors.push(`${where}.outcome: "${String(value.outcome)}" is not one of ${STAGE_OUTCOMES.join(', ')}`);
  }
  if ('outcomeText' in value && value.outcomeText !== null && typeof value.outcomeText !== 'string') {
    errors.push(`${where}.outcomeText: must be a string or null`);
  }
  if ('phases' in value) {
    if (!isObject(value.phases)) {
      errors.push(`${where}.phases: must be an object of phaseKey -> state`);
      return;
    }
    for (const [key, state] of Object.entries(value.phases)) {
      if (!phaseKeys.includes(key)) {
        errors.push(`${where}.phases: unknown phase key "${key}" (allowed: ${phaseKeys.join(', ')})`);
      }
      if (!PHASE_STATES.includes(state as PhaseState)) {
        errors.push(`${where}.phases.${key}: "${String(state)}" is not one of ${PHASE_STATES.join(', ')}`);
      }
    }
  }
}

/** Validates the parsed curated file. Throws one error that lists every problem. */
export function validateCurated(raw: unknown): CuratedFlight[] {
  const errors: string[] = [];
  if (!Array.isArray(raw)) throw new Error('curated flights: the file must contain a JSON array');
  const seen = new Set<number>();
  raw.forEach((entry, index) => {
    const where = `curated[${index}]`;
    if (!isObject(entry)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    checkKeys(entry, FLIGHT_KEYS, where, errors);
    const n = entry.number;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
      errors.push(`${where}.number: must be a positive integer`);
    } else if (seen.has(n)) {
      errors.push(`${where}.number: flight ${n} is listed twice`);
    } else {
      seen.add(n);
    }
    if ('missionName' in entry && entry.missionName !== null && typeof entry.missionName !== 'string') {
      errors.push(`${where}.missionName: must be a string or null`);
    }
    if ('onlyWhileUpcoming' in entry && typeof entry.onlyWhileUpcoming !== 'boolean') {
      errors.push(`${where}.onlyWhileUpcoming: must be true or false`);
    }
    if ('summary' in entry && typeof entry.summary !== 'string') {
      errors.push(`${where}.summary: must be a string`);
    }
    if ('highlights' in entry) {
      if (!Array.isArray(entry.highlights) || entry.highlights.some((h) => typeof h !== 'string')) {
        errors.push(`${where}.highlights: must be an array of strings`);
      }
    }
    if ('links' in entry) {
      if (!Array.isArray(entry.links)) {
        errors.push(`${where}.links: must be an array`);
      } else {
        entry.links.forEach((link, i) => {
          if (
            !isObject(link) ||
            typeof link.label !== 'string' ||
            typeof link.url !== 'string' ||
            !/^https?:\/\//.test(link.url)
          ) {
            errors.push(`${where}.links[${i}]: must be { "label": string, "url": "http(s)://..." }`);
          }
        });
      }
    }
    if ('booster' in entry) checkStage(entry.booster, BOOSTER_PHASES.map((p) => p.key), `${where}.booster`, errors);
    if ('ship' in entry) checkStage(entry.ship, SHIP_PHASES.map((p) => p.key), `${where}.ship`, errors);
  });
  if (errors.length > 0) {
    throw new Error(`curated flights are invalid:\n  - ${errors.join('\n  - ')}`);
  }
  return raw as CuratedFlight[];
}

function mergeStage(
  stage: Stage,
  curated: CuratedStage | undefined,
  list: ReadonlyArray<{ key: string; label: string }>,
): Stage {
  // Always emit every phase key in contract order, even when the input (old data) misses some.
  const current: Record<string, PhaseState> = {};
  for (const phase of stage.phases) current[phase.key] = phase.state;
  if (!curated) return { ...stage, phases: phasesFrom(list, current, 'unknown') };
  return {
    ...stage,
    serial: curated.serial !== undefined ? curated.serial : stage.serial,
    outcome: curated.outcome ?? stage.outcome,
    outcomeText: curated.outcomeText !== undefined ? curated.outcomeText : stage.outcomeText,
    phases: phasesFrom(list, { ...current, ...curated.phases }, 'unknown'),
  };
}

/** Merge one curated entry into a flight. */
export function mergeCurated(flight: Flight, curated: CuratedFlight | undefined): Flight {
  return {
    ...flight,
    missionName: curated?.missionName !== undefined ? curated.missionName : flight.missionName,
    summary: curated?.summary ?? flight.summary,
    highlights: curated?.highlights ?? flight.highlights,
    links: curated?.links ? dedupeLinks([...curated.links, ...flight.links]) : flight.links,
    booster: mergeStage(flight.booster, curated?.booster, BOOSTER_PHASES),
    ship: mergeStage(flight.ship, curated?.ship, SHIP_PHASES),
  };
}

/**
 * Apply curated entries to flights by number.
 * Returns the merged flights and the curated numbers that matched no LL2 flight (for a warning).
 */
export function applyCurated(
  flights: Flight[],
  curated: CuratedFlight[],
): { flights: Flight[]; unmatched: number[] } {
  const byNumber = new Map(curated.map((c) => [c.number, c]));
  const merged = flights.map((flight) => {
    const entry = byNumber.get(flight.number);
    // A plan for a future flight must not outlive the flight itself.
    return mergeCurated(flight, entry?.onlyWhileUpcoming && !flight.upcoming ? undefined : entry);
  });
  const known = new Set(flights.map((f) => f.number));
  const unmatched = curated.map((c) => c.number).filter((n) => !known.has(n));
  return { flights: merged, unmatched };
}
