import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiteData } from '../src/data/types.ts';
import { attachPhotos, mapPool, photoKey, photoSummary } from '../scripts/lib/images.ts';
import type { PhotoOptions } from '../scripts/lib/images.ts';
import { buildSiteData } from '../scripts/lib/pipeline.ts';
import type { PhotoSources } from '../scripts/lib/pipeline.ts';
import type { LL2Launch } from '../scripts/lib/sources.ts';
import { buildImageCredits, buildPrototypeSources, imageSource, prototypeKey } from '../scripts/lib/transform.ts';
import { fixture, launchesFixture } from './helpers.ts';

const NOW = new Date('2026-10-27T12:00:00Z');

/** A small test image made in memory: no network, no fixture file. */
function makeImage(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } } })
    .png()
    .toBuffer();
}

async function fixtureSite(): Promise<{ data: SiteData; photoSources: PhotoSources }> {
  const { data, photoSources } = await buildSiteData({
    fetchDashboard: async () => fixture('ll2-dashboard.json'),
    fetchLaunches: async () => fixture('ll2-launches-detailed.json'),
    fetchNews: async () => fixture('snapi-articles.json'),
    loadPrevious: async () => null,
    curated: [],
    now: NOW,
  });
  return { data, photoSources };
}

function launch(name: string, net: string, url: string, license: string | null): LL2Launch {
  return { id: `${name}-${net}`, name, net, image: { image_url: url, credit: 'SpaceX', license: { name: license } } };
}

describe('photo keys and sources', () => {
  it('derives a stable 16 hex char key per URL', () => {
    const key = photoKey('https://example.com/a.jpg');
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(photoKey('https://example.com/a.jpg')).toBe(key);
    expect(photoKey('https://example.com/b.jpg')).not.toBe(key);
  });

  it('maps prototype launch names to keys', () => {
    expect(prototypeKey('Starship Hopper | 150m Hop')).toBe('starhopper');
    expect(prototypeKey('Starhopper | 20m Hop')).toBe('starhopper');
    expect(prototypeKey('Starship SN8 | 12.5 km Flight')).toBe('sn8');
    expect(prototypeKey('Starship SN15 | 10 km Flight')).toBe('sn15');
    expect(prototypeKey('Starship | Flight 7')).toBeNull();
    expect(prototypeKey('Starship | SpaceX HLS LEO Demo')).toBeNull();
  });

  it('collects every prototype in the fixture, Starhopper from the licensed 150 m hop', () => {
    const sources = buildPrototypeSources(launchesFixture());
    expect(Object.keys(sources)).toEqual(['sn10', 'sn11', 'sn15', 'sn5', 'sn6', 'sn8', 'sn9', 'starhopper']);
    expect(sources.starhopper?.url).toMatch(/20200820191836\.jpg$/);
    expect(sources.starhopper?.license).toBe('CC BY-NC 2.0');
    expect(sources.sn9?.license).toBeNull();
  });

  it('prefers a known licence over a later launch, then the latest launch', () => {
    const older = launch('Starship Hopper | 20m Hop', '2019-07-26T00:00:00Z', 'https://example.com/old.jpg', 'CC BY 4.0');
    const newer = launch('Starship Hopper | 150m Hop', '2019-08-27T00:00:00Z', 'https://example.com/new.jpg', 'Unknown');
    expect(buildPrototypeSources([newer, older]).starhopper?.url).toBe('https://example.com/old.jpg');
    const newerLicensed = { ...newer, image: { ...newer.image, license: { name: 'CC BY 4.0' } } };
    expect(buildPrototypeSources([older, newerLicensed]).starhopper?.url).toBe('https://example.com/new.jpg');
  });

  it('keeps credit and licence, and treats "Unknown" as no licence', () => {
    const [first] = launchesFixture().filter((l) => l.name === 'Starship | Integrated Flight Test');
    expect(imageSource(first!)).toMatchObject({ credit: 'SpaceX', license: 'CC BY-NC 2.0' });
    const credits = buildImageCredits(launchesFixture());
    const flight7 = launchesFixture().find((l) => l.name === 'Starship | Flight 7')!;
    expect(credits.get(flight7.image!.image_url!)).toMatchObject({ credit: 'SpaceX', license: null });
  });

  it('runs a pool with bounded concurrency and keeps order', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBe(3);
  });
});

describe('attachPhotos', () => {
  let dir: string;
  let options: (download: PhotoOptions['download']) => PhotoOptions;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'starship-photos-'));
    options = (download) => ({ cacheDir: join(dir, 'cache'), outDir: join(dir, 'public/media/photos'), download });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('downloads each URL once, resizes, publishes and then reuses the cache', async () => {
    const { data, photoSources } = await fixtureSite();
    const image = await makeImage(3000, 1500);
    const download = vi.fn(async () => new Uint8Array(image));

    const first = await attachPhotos(data, photoSources, options(download));
    const urls = new Set([...data.flights.map((f) => f.image), ...Object.values(photoSources.prototypes).map((s) => s.url)]);
    urls.delete(null);
    expect(download).toHaveBeenCalledTimes(urls.size);
    expect(first.stats).toMatchObject({ flights: 15, prototypes: 8, images: urls.size, downloaded: urls.size, failed: 0 });

    // Shared LL2 URL: one set of files, reused by every flight.
    const byNumber = (n: number) => first.data.flights.find((f) => f.number === n)!.photo!;
    expect(byNumber(8).large).toBe(byNumber(7).large);
    expect(byNumber(7).large).toBe(`media/photos/${photoKey(data.flights.find((f) => f.number === 7)!.image!)}-2400.webp`);

    const photo = byNumber(1);
    expect(photo).toMatchObject({ width: 2400, height: 1200, credit: 'SpaceX', license: 'CC BY-NC 2.0' });
    expect(byNumber(7)).toMatchObject({ credit: 'SpaceX', license: null });
    expect(photo.placeholder).toMatch(/^data:image\/jpeg;base64,/);
    expect(photo.placeholder.length).toBeLessThan(1100);
    const publicDir = join(dir, 'public');
    expect((await sharp(join(publicDir, photo.small)).metadata()).width).toBe(1200);
    const jpeg = await sharp(join(publicDir, photo.jpeg)).metadata();
    expect([jpeg.format, jpeg.width, jpeg.height]).toEqual(['jpeg', 1600, 800]);
    expect(first.data.prototypePhotos.starhopper?.license).toBe('CC BY-NC 2.0');

    const index = JSON.parse(await readFile(join(dir, 'cache/index.json'), 'utf8')) as string[];
    expect(index).toEqual([...urls].sort());

    // Warm cache: no network and no resizing.
    const cachedFile = join(dir, 'cache', photo.large.split('/').pop()!);
    const before = (await stat(cachedFile)).mtimeMs;
    const again = vi.fn(async () => new Uint8Array(image));
    const second = await attachPhotos(data, photoSources, options(again));
    expect(again).not.toHaveBeenCalled();
    expect(second.stats).toMatchObject({ downloaded: 0, cached: urls.size, failed: 0 });
    expect((await stat(cachedFile)).mtimeMs).toBe(before);
    expect(second.data).toEqual(first.data);
    expect(photoSummary(second.stats)).toBe(
      `photos: 15 flights, 8 prototypes; ${urls.size} images: 0 downloaded, ${urls.size} from cache, 0 failed`,
    );
  });

  it('never upscales a small source', async () => {
    const { data } = await fixtureSite();
    const one = { ...data, flights: data.flights.slice(0, 1) };
    const image = await makeImage(800, 600);
    const { data: out } = await attachPhotos(one, { credits: new Map(), prototypes: {} }, options(async () => image));
    expect(out.flights[0]?.photo).toMatchObject({ width: 800, height: 600 });
  });

  it('sets the photo to null when a download or decode fails, without throwing', async () => {
    const { data, photoSources } = await fixtureSite();
    const image = await makeImage(1000, 500);
    const flight1 = data.flights.find((f) => f.number === 1)!.image!;
    const flight2 = data.flights.find((f) => f.number === 2)!.image!;
    const download = async (url: string) => {
      if (url === flight1) throw new Error('HTTP 404 from example.com');
      if (url === flight2) return new TextEncoder().encode('<html>not an image</html>');
      return new Uint8Array(image);
    };
    const { data: out, stats } = await attachPhotos(data, photoSources, options(download));
    expect(stats.failed).toBe(2);
    expect(out.flights.find((f) => f.number === 1)?.photo).toBeNull();
    expect(out.flights.find((f) => f.number === 2)?.photo).toBeNull();
    expect(out.flights.find((f) => f.number === 3)?.photo).not.toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(2);
    // The bad download is not kept, so the next run tries again; failed URLs stay out of the cache key.
    expect(existsSync(join(dir, 'cache', photoKey(flight2)))).toBe(false);
    const index = JSON.parse(await readFile(join(dir, 'cache/index.json'), 'utf8')) as string[];
    expect(index).not.toContain(flight1);
    expect(index).not.toContain(flight2);
  });

  it('keeps the previous credit for carried-over flights and saved prototype sources', async () => {
    const { data, photoSources } = await fixtureSite();
    const image = await makeImage(1000, 500);
    await attachPhotos(data, photoSources, options(async () => image));

    // Next run: LL2 launches failed, flights come from the previous data with their photos.
    const previous = (await attachPhotos(data, photoSources, options(async () => image))).data;
    const download = vi.fn(async () => image);
    const { data: out } = await attachPhotos(previous, { credits: new Map(), prototypes: {} }, options(download));
    expect(download).not.toHaveBeenCalled();
    expect(out.flights.find((f) => f.number === 1)?.photo).toMatchObject({ credit: 'SpaceX', license: 'CC BY-NC 2.0' });
    expect(Object.keys(out.prototypePhotos)).toHaveLength(8);
  });

  it('offline: uses the cache when present, otherwise no photo and no network', async () => {
    const { data, photoSources } = await fixtureSite();
    const image = await makeImage(1000, 500);
    const offline = await attachPhotos(data, photoSources, options(null));
    expect(offline.stats).toMatchObject({ flights: 0, prototypes: 0, downloaded: 0, skipped: offline.stats.images });
    expect(photoSummary(offline.stats)).toContain('not cached (offline)');

    // A cached original alone is enough: it is resized without the network.
    const url = data.flights[0]!.image!;
    await writeFile(join(dir, 'cache', photoKey(url)), image);
    const partial = await attachPhotos(data, photoSources, options(null));
    expect(partial.data.flights[0]?.photo?.width).toBe(1000);
    expect(partial.stats.cached).toBe(1);
  });
});
