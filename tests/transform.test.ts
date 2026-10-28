import { describe, expect, it } from 'vitest';
import { BOOSTER_PHASES, SHIP_PHASES } from '../src/data/phases.ts';
import {
  buildEvents,
  buildFleet,
  buildFlights,
  buildManifest,
  buildNews,
  buildStats,
  cleanSummary,
  findNextFlightId,
  isDeliveryRobotArticle,
  mapPrecision,
  mapStatus,
  parseFlightNumber,
  parseMissionName,
  shortSerial,
} from '../scripts/lib/transform.ts';
import { dashboardFixture, launchesFixture, newsFixture } from './helpers.ts';

const flights = buildFlights(launchesFixture());
const flight = (n: number) => {
  const f = flights.find((x) => x.number === n);
  if (!f) throw new Error(`no flight ${n}`);
  return f;
};

describe('flight numbering', () => {
  it('parses LL2 names', () => {
    expect(parseFlightNumber('Starship | Integrated Flight Test')).toBe(1);
    expect(parseFlightNumber('Starship | Integrated Flight Test 6')).toBe(6);
    expect(parseFlightNumber('Starship | Flight 7')).toBe(7);
    expect(parseFlightNumber('Starship | Starlink Group 31-1 (Starship Flight 14)')).toBe(14);
    expect(parseFlightNumber('Starship SN15 | 10 km Flight')).toBeNull();
    expect(parseFlightNumber('Starship | SpaceX HLS LEO Demo')).toBeNull();
  });

  it('lists flights 1..15 oldest first, 1-14 flown and 15 upcoming', () => {
    expect(flights.map((f) => f.number)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(flights.slice(0, 14).every((f) => !f.upcoming)).toBe(true);
    expect(flight(15).upcoming).toBe(true);
    expect(flight(15).status).toBe('tbd');
    expect(flight(1).name).toBe('Flight 1');
  });

  it('extracts the mission name only when there is one', () => {
    expect(flight(14).missionName).toBe('Starlink Group 31-1');
    expect(flight(1).missionName).toBeNull();
    expect(flight(7).missionName).toBeNull();
    expect(parseMissionName('Starship | Integrated Flight Test 2')).toBeNull();
  });

  it('points nextFlightId at Flight 15', () => {
    expect(findNextFlightId(flights)).toBe(flight(15).id);
  });
});

describe('serials and reflights', () => {
  it('shortens booster serials and keeps the rest', () => {
    expect(shortSerial('Booster 21')).toBe('B21');
    expect(shortSerial('Booster 7')).toBe('B7');
    expect(shortSerial('S41')).toBe('S41');
    expect(shortSerial('SN15')).toBe('SN15');
    expect(shortSerial('Starhopper')).toBe('Starhopper');
    expect(shortSerial('')).toBeNull();
    expect(flight(14).booster.serial).toBe('B21');
    expect(flight(14).ship.serial).toBe('S41');
  });

  it('counts flightOfVehicle per serial', () => {
    expect(flight(7).booster.flightOfVehicle).toBe(1);
    expect(flight(9).booster.serial).toBe('B14');
    expect(flight(9).booster.flightOfVehicle).toBe(2);
    expect(flight(11).booster.serial).toBe('B15');
    expect(flight(11).booster.flightOfVehicle).toBe(2);
    expect(flight(15).booster.flightOfVehicle).toBeNull();
    expect(buildStats(flights).reflights).toBe(2);
  });
});

describe('status, precision, version', () => {
  it('maps LL2 status abbrevs', () => {
    expect(mapStatus({ abbrev: 'Go' })).toBe('go');
    expect(mapStatus({ abbrev: 'In Flight' })).toBe('inflight');
    expect(mapStatus({ abbrev: 'Partial Failure' })).toBe('partial');
    expect(mapStatus({ abbrev: 'Failure' })).toBe('failure');
    expect(mapStatus(null)).toBe('tbd');
    expect(flight(2).status).toBe('partial');
    expect(flight(14).statusLabel).toBe('Launch Successful');
  });

  it('maps net_precision', () => {
    expect(flight(15).netPrecision).toBe('quarter');
    expect(flight(14).netPrecision).toBe('second');
    expect(flight(5).netPrecision).toBe('minute');
    expect(mapPrecision({ abbrev: 'M', name: 'Month' })).toBe('month');
    expect(mapPrecision({ abbrev: 'H2', name: 'Half 2' })).toBe('half');
    expect(mapPrecision({ abbrev: 'FY', name: 'Fiscal Year' })).toBe('year');
    expect(mapPrecision({ name: 'Quarter 1' })).toBe('quarter');
    expect(mapPrecision({ abbrev: 'NEW' })).toBe('unknown');
    expect(mapPrecision(null)).toBe('unknown');
  });

  it('reads the vehicle version', () => {
    expect(flight(1).version).toBe('V1');
    expect(flight(7).version).toBe('V2');
    expect(flight(14).version).toBe('V3');
  });

  it('fills pad, site, links, webcasts and image', () => {
    const f = flight(14);
    expect(f.pad).toBe('Orbital Launch Pad 2');
    expect(f.site).toBe('SpaceX Starbase, TX, USA');
    expect(f.webcasts.length).toBeGreaterThan(0);
    expect(f.links.some((l) => l.url.startsWith('https://ll.thespacedevs.com/2.3.0/launches/'))).toBe(true);
    expect(f.image).toMatch(/^https:\/\//);
    expect(f.summary?.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(2);
  });
});

describe('default phases', () => {
  const keys = (phases: { key: string }[]) => phases.map((p) => p.key);

  it('always emits every phase key in contract order', () => {
    for (const f of flights) {
      expect(keys(f.booster.phases)).toEqual(BOOSTER_PHASES.map((p) => p.key));
      expect(keys(f.ship.phases)).toEqual(SHIP_PHASES.map((p) => p.key));
    }
  });

  it('marks a tower catch as caught and every booster phase done', () => {
    expect(flight(5).booster.outcome).toBe('caught');
    expect(flight(5).booster.phases.every((p) => p.state === 'done')).toBe(true);
    expect(flight(4).booster.outcome).toBe('splashdown');
    expect(flight(5).ship.outcome).toBe('splashdown');
  });

  it('marks a failed booster landing as lost', () => {
    const b = flight(3).booster;
    expect(b.outcome).toBe('lost');
    expect(b.phases.find((p) => p.key === 'landing')?.state).toBe('lost');
    expect(b.phases.find((p) => p.key === 'boostback')?.state).toBe('unknown');
  });

  it('keeps only liftoff for a failed launch', () => {
    const f = flight(1);
    expect(f.booster.phases.map((p) => p.state)).toEqual(['done', 'unknown', 'unknown', 'unknown', 'unknown']);
    expect(f.ship.phases.every((p) => p.state === 'unknown')).toBe(true);
  });

  it('marks every phase pending on an upcoming flight', () => {
    const f = flight(15);
    expect([...f.booster.phases, ...f.ship.phases].every((p) => p.state === 'pending')).toBe(true);
    expect(f.booster.outcome).toBe('pending');
  });
});

describe('manifest, events, fleet', () => {
  it('puts prototype hops and unnumbered missions in the manifest', () => {
    const manifest = buildManifest(launchesFixture());
    expect(manifest).toHaveLength(12);
    expect(manifest.filter((m) => m.upcoming).map((m) => m.missionName)).toEqual([
      'SpaceX HLS LEO Demo',
      'Superbird-9',
      'Starlab',
    ]);
    expect(manifest[0]?.vehicle).toBe('Starhopper');
  });

  it('sorts recent events newest first and caps them at 12', () => {
    const events = buildEvents(dashboardFixture());
    expect(events.recent).toHaveLength(12);
    const dates = events.recent.map((e) => Date.parse(e.date));
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
    expect(events.recent[0]?.location).toBe('Starbase Texas');
  });

  it('builds the fleet with short serials, no placeholders, sorted by number', () => {
    const fleet = buildFleet(dashboardFixture(), flights);
    const serials = fleet.map((v) => v.serial);
    expect(serials).not.toContain('Unknown SH');
    expect(serials).toContain('B7');
    expect(serials).toContain('Starhopper');
    const boosters = fleet.filter((v) => v.kind === 'booster' && v.version !== 'prototype').map((v) => v.serial);
    expect(boosters.slice(0, 4)).toEqual(['B4', 'B7', 'B9', 'B10']);
    const s41 = fleet.find((v) => v.serial === 'S41');
    expect(s41?.firstFlight).toBe(flight(14).net);
    expect(fleet.find((v) => v.serial === 'SN15')?.version).toBe('prototype');
  });
});

describe('news', () => {
  it('drops delivery-robot articles', () => {
    expect(isDeliveryRobotArticle({ title: 'Starship Technologies raises funds', summary: '' })).toBe(true);
    expect(isDeliveryRobotArticle({ title: 'Robots on campus', summary: 'A delivery robot fleet grows.' })).toBe(true);
    expect(isDeliveryRobotArticle({ title: 'Starship Flight 15', summary: 'Booster 22 rolls out.' })).toBe(false);
    const robot = { id: 1, title: 'Starship Technologies expands', url: 'https://example.com/r', summary: 'x', published_at: '2026-10-27T00:00:00Z' };
    const news = buildNews([robot, ...newsFixture()]);
    expect(news.map((a) => a.id)).not.toContain(1);
    expect(news).toHaveLength(10);
  });

  it('keeps the newest 12, newest first', () => {
    const base = newsFixture()[0];
    if (!base) throw new Error('empty fixture');
    const many = Array.from({ length: 20 }, (_, i) => ({
      ...base,
      id: i,
      published_at: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
    }));
    const news = buildNews(many);
    expect(news).toHaveLength(12);
    expect(news[0]?.id).toBe(19);
  });

  it('cleans summaries', () => {
    expect(cleanSummary('<p>Hello&nbsp;<b>world</b></p>\n\n  again')).toBe('Hello world again');
    expect(cleanSummary('Text…\nThe post Foo appeared first on NASASpaceflight.com.')).toBe('Text…');
    const long = cleanSummary('word '.repeat(100));
    expect(long.length).toBeLessThanOrEqual(280);
    expect(long.endsWith('…')).toBe(true);
  });
});
