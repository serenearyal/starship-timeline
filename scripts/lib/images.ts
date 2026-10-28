// Downloads the LL2 photos, resizes them with sharp and serves them from this site.
//
// Cache layout (.image-cache/, kept between CI runs by actions/cache), per source URL with key K:
//   K                original download
//   K-2400.webp      K-1200.webp      K-1600.jpg      resized outputs
//   K.json           size and placeholder; written last, so it marks a complete set
// A run with a warm cache does no network and no resizing. A failed image never fails the run:
// its photo becomes null with a warning.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Photo, SiteData } from '../../src/data/types.ts';
import type { PhotoSources } from './pipeline.ts';
import type { PhotoSource } from './transform.ts';

export const LARGE_WIDTH = 2400;
export const SMALL_WIDTH = 1200;
export const JPEG_WIDTH = 1600;
export const PLACEHOLDER_WIDTH = 24;
export const CONCURRENCY = 3;
/** Site-relative (no leading slash): the site is served from a sub-path. */
export const PUBLIC_PREFIX = 'media/photos';
/** Sorted source URLs in the cache; CI hashes it into the cache key. */
export const INDEX_FILE = 'index.json';
/** Last known prototype sources, for runs where they are not on the launch list (LL2 failed, or paged off). */
export const PROTOTYPES_FILE = 'prototypes.json';

/** Photo without credit: depends only on the source URL. */
export type RenderedPhoto = Omit<Photo, 'credit' | 'license'>;

interface RenderedMeta {
  width: number;
  height: number;
  placeholder: string;
}

export interface PhotoOptions {
  cacheDir: string;
  /** Usually public/media/photos. Cleared on every run, so it holds only photos in use. */
  outDir: string;
  /** Downloads one image. Null in offline mode: only cached images are used, no network. */
  download: ((url: string) => Promise<Uint8Array>) | null;
}

export interface PhotoStats {
  /** Flights and prototypes that have a photo. */
  flights: number;
  prototypes: number;
  /** Unique source URLs, and what happened to each. */
  images: number;
  downloaded: number;
  cached: number;
  failed: number;
  /** Offline mode only: not in the cache. */
  skipped: number;
}

type Outcome = 'downloaded' | 'cached' | 'failed' | 'skipped';

/** Cache and file name for a source URL: first 16 hex chars of its sha256. */
export function photoKey(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

const outputNames = (key: string) => ({
  large: `${key}-${LARGE_WIDTH}.webp`,
  small: `${key}-${SMALL_WIDTH}.webp`,
  jpeg: `${key}-${JPEG_WIDTH}.jpg`,
});

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Write via a temp file and rename, so a killed run never leaves a half file in the cache. */
async function writeAtomic(path: string, data: Uint8Array | string): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

/** Run `task` over `items` with at most `limit` in flight. Results keep the input order. */
export async function mapPool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Resize one image into the cache dir: two WebP sizes, a JPEG fallback and a tiny blurred placeholder.
 * Never upscales. Throws when the input does not decode.
 */
export async function renderPhoto(input: Uint8Array, dir: string, key: string): Promise<RenderedMeta> {
  const names = outputNames(key);
  // failOn 'error': tolerate the minor warnings that many camera JPEGs have.
  const base = () => sharp(input, { failOn: 'error' }).autoOrient();
  const resize = (width: number) => base().resize({ width, withoutEnlargement: true });

  const large = await resize(LARGE_WIDTH).webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
  const small = await resize(SMALL_WIDTH).webp({ quality: 78 }).toBuffer();
  // JPEG has no alpha: PNG sources with transparency go on black, like the site background.
  const jpeg = await resize(JPEG_WIDTH).flatten({ background: '#000' }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  const tiny = await base()
    .flatten({ background: '#000' })
    .resize({ width: PLACEHOLDER_WIDTH })
    .blur(0.6)
    .jpeg({ quality: 40, mozjpeg: true })
    .toBuffer();

  await writeAtomic(join(dir, names.large), large.data);
  await writeAtomic(join(dir, names.small), small);
  await writeAtomic(join(dir, names.jpeg), jpeg);
  const meta: RenderedMeta = {
    width: large.info.width,
    height: large.info.height,
    placeholder: `data:image/jpeg;base64,${tiny.toString('base64')}`,
  };
  await writeAtomic(join(dir, `${key}.json`), JSON.stringify(meta));
  return meta;
}

/** The cached render for `key`, or null when any output is missing or unreadable. */
async function readRendered(dir: string, key: string): Promise<RenderedMeta | null> {
  const metaPath = join(dir, `${key}.json`);
  if (!existsSync(metaPath) || !Object.values(outputNames(key)).every((name) => existsSync(join(dir, name)))) {
    return null;
  }
  try {
    const meta = JSON.parse(await readFile(metaPath, 'utf8')) as Partial<RenderedMeta>;
    if (typeof meta.width !== 'number' || typeof meta.height !== 'number' || typeof meta.placeholder !== 'string') {
      return null;
    }
    return { width: meta.width, height: meta.height, placeholder: meta.placeholder };
  } catch {
    return null;
  }
}

/** Download (or reuse), resize (or reuse) and publish one source URL. Never throws. */
async function processImage(
  url: string,
  options: PhotoOptions,
): Promise<{ outcome: Outcome; photo: RenderedPhoto | null }> {
  const { cacheDir, outDir, download } = options;
  const key = photoKey(url);
  const originalPath = join(cacheDir, key);
  let outcome: Outcome = 'cached';
  try {
    let meta = await readRendered(cacheDir, key);
    if (!meta) {
      let original: Uint8Array;
      if (existsSync(originalPath)) {
        original = await readFile(originalPath);
      } else if (!download) {
        return { outcome: 'skipped', photo: null };
      } else {
        try {
          original = await download(url);
        } catch (error) {
          console.warn(`photo: download failed for ${url} (${errorText(error)}); no photo`);
          return { outcome: 'failed', photo: null };
        }
        await writeAtomic(originalPath, original);
        outcome = 'downloaded';
      }
      try {
        meta = await renderPhoto(original, cacheDir, key);
      } catch (error) {
        // Drop the bad download (an HTML error page, a truncated file) so the next run fetches it again.
        await rm(originalPath, { force: true });
        console.warn(`photo: cannot decode ${url} (${errorText(error)}); no photo`);
        return { outcome: 'failed', photo: null };
      }
    }
    const names = outputNames(key);
    for (const name of Object.values(names)) await copyFile(join(cacheDir, name), join(outDir, name));
    return {
      outcome,
      photo: {
        large: `${PUBLIC_PREFIX}/${names.large}`,
        small: `${PUBLIC_PREFIX}/${names.small}`,
        jpeg: `${PUBLIC_PREFIX}/${names.jpeg}`,
        ...meta,
      },
    };
  } catch (error) {
    console.warn(`photo: ${url} failed (${errorText(error)}); no photo`);
    return { outcome: 'failed', photo: null };
  }
}

async function readSavedPrototypes(cacheDir: string): Promise<Record<string, PhotoSource>> {
  try {
    const saved = JSON.parse(await readFile(join(cacheDir, PROTOTYPES_FILE), 'utf8')) as Record<string, PhotoSource>;
    return typeof saved === 'object' && saved !== null ? saved : {};
  } catch {
    return {};
  }
}

/** Delete cached files whose key is not in use, so the CI cache does not grow forever. */
async function pruneCache(cacheDir: string, keys: Set<string>): Promise<void> {
  for (const name of await readdir(cacheDir)) {
    const key = /^([0-9a-f]{16})(?:[-.]|$)/.exec(name)?.[1];
    if (key && !keys.has(key)) await rm(join(cacheDir, name), { force: true });
  }
}

/**
 * Sets `photo` on every flight and fills `prototypePhotos`.
 * Flight credit comes from this run's LL2 data, else from the flight's previous photo (carried-over flights).
 * Prototype sources from this run win over the saved ones.
 */
export async function attachPhotos(
  data: SiteData,
  sources: PhotoSources,
  options: PhotoOptions,
): Promise<{ data: SiteData; stats: PhotoStats }> {
  const { cacheDir, outDir } = options;
  const online = options.download !== null;
  await mkdir(cacheDir, { recursive: true });
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const prototypes: Record<string, PhotoSource> = { ...(await readSavedPrototypes(cacheDir)), ...sources.prototypes };
  const flightSources = data.flights.map((flight): PhotoSource | null => {
    if (!flight.image || !/^https?:\/\//i.test(flight.image)) return null;
    return (
      sources.credits.get(flight.image) ?? {
        url: flight.image,
        credit: flight.photo?.credit ?? null,
        license: flight.photo?.license ?? null,
      }
    );
  });

  const urls = [
    ...new Set([...flightSources, ...Object.values(prototypes)].flatMap((s) => (s ? [s.url] : []))),
  ].sort();
  const results = await mapPool(urls, CONCURRENCY, (url) => processImage(url, options));
  const rendered = new Map(urls.map((url, i) => [url, results[i]?.photo ?? null]));
  const withCredit = (source: PhotoSource | null): Photo | null => {
    const photo = source ? rendered.get(source.url) : null;
    return photo ? { ...photo, credit: source?.credit ?? null, license: source?.license ?? null } : null;
  };

  const flights = data.flights.map((flight, i) => ({ ...flight, photo: withCredit(flightSources[i] ?? null) }));
  const prototypePhotos: Record<string, Photo> = {};
  for (const key of Object.keys(prototypes).sort()) {
    const photo = withCredit(prototypes[key] ?? null);
    if (photo) prototypePhotos[key] = photo;
  }

  // Offline runs read fixtures: leave the cache bookkeeping of live runs alone.
  if (online) {
    const cached = urls.filter((url) => rendered.get(url));
    await writeAtomic(join(cacheDir, INDEX_FILE), `${JSON.stringify(cached, null, 2)}\n`);
    await writeAtomic(join(cacheDir, PROTOTYPES_FILE), `${JSON.stringify(prototypes, null, 2)}\n`);
    await pruneCache(cacheDir, new Set(urls.map(photoKey)));
  }

  const count = (outcome: Outcome) => results.filter((r) => r.outcome === outcome).length;
  return {
    data: { ...data, flights, prototypePhotos },
    stats: {
      flights: flights.filter((f) => f.photo).length,
      prototypes: Object.keys(prototypePhotos).length,
      images: urls.length,
      downloaded: count('downloaded'),
      cached: count('cached'),
      failed: count('failed'),
      skipped: count('skipped'),
    },
  };
}

/** One log line, e.g. "photos: 15 flights, 8 prototypes; 11 images: 3 downloaded, 8 from cache, 0 failed". */
export function photoSummary(stats: PhotoStats): string {
  const skipped = stats.skipped > 0 ? `, ${stats.skipped} not cached (offline)` : '';
  return (
    `photos: ${stats.flights} flights, ${stats.prototypes} prototypes; ${stats.images} images: ` +
    `${stats.downloaded} downloaded, ${stats.cached} from cache, ${stats.failed} failed${skipped}`
  );
}
