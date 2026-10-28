import { describe, expect, it } from 'vitest';
import type { SiteData } from '../src/data/types.ts';
import { applyCurated, validateCurated } from '../scripts/lib/curated.ts';
import { buildSiteData, validateSiteData } from '../scripts/lib/pipeline.ts';
import type { PipelineInput } from '../scripts/lib/pipeline.ts';
import { buildFlights } from '../scripts/lib/transform.ts';
import { fixture, launchesFixture } from './helpers.ts';

const NOW = new Date('2026-10-27T12:00:00Z');

function input(overrides: Partial<PipelineInput> = {}): PipelineInput {
  return {
    fetchDashboard: async () => fixture('ll2-dashboard.json'),
    fetchLaunches: async () => fixture('ll2-launches-detailed.json'),
    fetchNews: async () => fixture('snapi-articles.json'),
    loadPrevious: async () => null,
    curated: [],
    now: NOW,
    ...overrides,
  };
}

const fail = async (): Promise<unknown> => {
  throw new Error('HTTP 429 from ll.thespacedevs.com');
};

describe('curated overrides', () => {
  it('accepts an empty or missing file', () => {
    expect(validateCurated([])).toEqual([]);
  });

  it('merges field by field and phases per key', () => {
    const curated = validateCurated([
      {
        number: 7,
        summary: 'Booster caught, ship lost over the Caribbean.',
        highlights: ['Second booster catch'],
        links: [{ label: 'SpaceX recap', url: 'https://www.spacex.com/launches/starship-flight-7' }],
        booster: { outcomeText: 'Caught by the tower arms.', phases: { staging: 'done', boostback: 'done' } },
        ship: { phases: { ascent: 'lost' }, outcome: 'lost' },
      },
    ]);
    const { flights, unmatched } = applyCurated(buildFlights(launchesFixture()), curated);
    expect(unmatched).toEqual([]);
    const f7 = flights.find((f) => f.number === 7);
    expect(f7?.summary).toBe('Booster caught, ship lost over the Caribbean.');
    expect(f7?.highlights).toEqual(['Second booster catch']);
    expect(f7?.links[0]?.label).toBe('SpaceX recap');
    expect(f7?.links.some((l) => l.label === 'Launch Library 2')).toBe(true);
    expect(f7?.missionName).toBeNull();
    expect(f7?.booster.outcome).toBe('caught');
    expect(f7?.booster.outcomeText).toBe('Caught by the tower arms.');
    expect(f7?.booster.phases.map((p) => p.state)).toEqual(['done', 'done', 'done', 'unknown', 'unknown']);
    expect(f7?.booster.phases.map((p) => p.label)).toEqual([
      'Liftoff',
      'Hot staging',
      'Boostback',
      'Landing burn',
      'Catch or splashdown',
    ]);
    expect(f7?.ship.phases[0]).toEqual({ key: 'ascent', label: 'Engine cutoff', state: 'lost' });
    const f8 = flights.find((f) => f.number === 8);
    expect(f8?.summary).toMatch(/^Eighth test flight/);
  });

  it('reports curated numbers with no LL2 flight', () => {
    const { unmatched } = applyCurated(buildFlights(launchesFixture()), validateCurated([{ number: 99 }]));
    expect(unmatched).toEqual([99]);
  });

  it('rejects unknown keys, phase keys and states loudly', () => {
    expect(() => validateCurated({})).toThrow(/JSON array/);
    expect(() => validateCurated([{ number: 5, booster: { phases: { catch: 'done' } } }])).toThrow(
      /unknown phase key "catch"/,
    );
    expect(() => validateCurated([{ number: 5, ship: { phases: { reentry: 'exploded' } } }])).toThrow(
      /"exploded" is not one of/,
    );
    expect(() => validateCurated([{ number: 5, booster: { outcome: 'boom' } }])).toThrow(/outcome/);
    expect(() => validateCurated([{ number: 5, summery: 'typo' }])).toThrow(/unknown key "summery"/);
    expect(() => validateCurated([{ number: 5 }, { number: 5 }])).toThrow(/listed twice/);
    expect(() => validateCurated([{ number: 0 }])).toThrow(/positive integer/);
    expect(() => validateCurated([{ number: 5, links: [{ label: 'x', url: 'ftp://x' }] }])).toThrow(/links\[0\]/);
    expect(validateCurated([{ number: 5, _note: 'comment keys are allowed' }])).toHaveLength(1);
  });

  it('fails the pipeline on an invalid curated file', async () => {
    await expect(buildSiteData(input({ curated: [{ number: 1, ship: { phases: { flip: 'done' } } }] }))).rejects.toThrow(
      /unknown phase key "flip"/,
    );
  });
});

describe('pipeline', () => {
  it('builds valid site data from the fixtures', async () => {
    const { data, log } = await buildSiteData(input());
    expect(data.schemaVersion).toBe(1);
    expect(data.generatedAt).toBe(NOW.toISOString());
    expect(data.flights).toHaveLength(15);
    expect(data.nextFlightId).toBe(data.flights.find((f) => f.number === 15)?.id);
    expect(data.sources.every((s) => s.ok && s.fetchedAt === NOW.toISOString())).toBe(true);
    expect(data.stats.flightsFlown).toBe(14);
    expect(data.stats.boosterCatches).toBe(3);
    expect(data.liveStreams).toHaveLength(3);
    expect(data.news).toHaveLength(10);
    expect(log.some((l) => l.startsWith('ll2: ok'))).toBe(true);
  });

  it('falls back to previous data when an LL2 fetch throws', async () => {
    const previous = (await buildSiteData(input())).data;
    previous.sources[0] = { ...previous.sources[0]!, fetchedAt: '2026-10-26T00:00:00Z' };
    let previousCalls = 0;
    const { data } = await buildSiteData(
      input({
        fetchLaunches: fail,
        fetchDashboard: fail,
        loadPrevious: async () => {
          previousCalls++;
          return previous;
        },
      }),
    );
    expect(previousCalls).toBe(1);
    const ll2 = data.sources.find((s) => s.id === 'll2');
    expect(ll2?.ok).toBe(false);
    expect(ll2?.fetchedAt).toBe('2026-10-26T00:00:00Z');
    expect(ll2?.note).toMatch(/429/);
    expect(data.flights).toEqual(previous.flights);
    expect(data.fleet).toEqual(previous.fleet);
    expect(data.sources.find((s) => s.id === 'snapi')?.ok).toBe(true);
  });

  it('reuses only the failed part when one LL2 call fails', async () => {
    const previous = (await buildSiteData(input())).data;
    const marker = { ...previous, liveStreams: [{ title: 'old', url: 'https://example.com/old', image: null }] };
    const { data } = await buildSiteData(input({ fetchDashboard: fail, loadPrevious: async () => marker }));
    expect(data.liveStreams[0]?.title).toBe('old');
    expect(data.flights).toHaveLength(15);
  });

  it('exits when LL2 fails and there is no previous data', async () => {
    await expect(buildSiteData(input({ fetchLaunches: fail }))).rejects.toThrow(/no previous data/);
    await expect(buildSiteData(input({ fetchLaunches: async () => ({ detail: 'throttled' }) }))).rejects.toThrow(
      /no results array/,
    );
  });

  it('reuses previous news when SNAPI fails, and still publishes without it', async () => {
    const previous = (await buildSiteData(input())).data;
    const withPrev = await buildSiteData(input({ fetchNews: fail, loadPrevious: async () => previous }));
    expect(withPrev.data.news).toEqual(previous.news);
    expect(withPrev.data.sources.find((s) => s.id === 'snapi')?.ok).toBe(false);
    const without = await buildSiteData(input({ fetchNews: fail }));
    expect(without.data.news).toEqual([]);
  });

  it('ignores previous data that is not SiteData', async () => {
    await expect(
      buildSiteData(input({ fetchLaunches: fail, loadPrevious: async () => ({ hello: 'world' }) })),
    ).rejects.toThrow(/no previous data/);
  });

  it('rejects site data with no flights', async () => {
    const { data } = await buildSiteData(input());
    const empty: SiteData = { ...data, flights: [], nextFlightId: null };
    expect(() => validateSiteData(empty)).toThrow(/flights is empty/);
  });
});

describe('launch list past the first page', () => {
  it('keeps older flights from the previous data', async () => {
    const launches = fixture('ll2-launches-detailed.json') as { count: number; results: Array<{ name: string }> };
    const full = await buildSiteData({
      fetchDashboard: async () => fixture('ll2-dashboard.json'),
      fetchLaunches: async () => launches,
      fetchNews: async () => fixture('snapi-articles.json'),
      loadPrevious: async () => null,
      curated: [],
      now: new Date('2026-10-27T00:00:00Z'),
    });
    // Second page scenario: only the newest 12 launches come back, but LL2 reports more.
    const page = { count: launches.results.length + 50, results: launches.results.slice(-12) };
    const result = await buildSiteData({
      fetchDashboard: async () => fixture('ll2-dashboard.json'),
      fetchLaunches: async () => page,
      fetchNews: async () => fixture('snapi-articles.json'),
      loadPrevious: async () => full.data,
      curated: [],
      now: new Date('2026-10-27T00:00:00Z'),
    });
    expect(result.data.flights.map((f) => f.number)).toEqual(full.data.flights.map((f) => f.number));
    expect(result.data.flights[0]!.number).toBe(1);
  });
});

describe('curated plans', () => {
  it('applies onlyWhileUpcoming entries to upcoming flights only', () => {
    const flights = buildFlights(launchesFixture());
    const curated = validateCurated([
      { number: 15, onlyWhileUpcoming: true, summary: 'Plan', booster: { serial: 'B22' } },
      { number: 14, onlyWhileUpcoming: true, summary: 'Stale plan' },
    ]);
    const merged = applyCurated(flights, curated).flights;
    expect(merged.find((f) => f.number === 15)!.summary).toBe('Plan');
    expect(merged.find((f) => f.number === 15)!.booster.serial).toBe('B22');
    expect(merged.find((f) => f.number === 14)!.summary).not.toBe('Stale plan');
  });
});
