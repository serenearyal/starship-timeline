// Fetches Starship data and writes public/data/starship.json.
//
//   node --experimental-strip-types scripts/fetch-data.ts            live run (2 LL2 calls + 1 SNAPI call)
//   node --experimental-strip-types scripts/fetch-data.ts --offline  reads tests/fixtures instead, no network
//
// Then downloads and resizes the flight photos into public/media/photos/ (cache in .image-cache/).
//
// Env: PREVIOUS_DATA_URL - the deployed .../data/starship.json, used as fallback when a source fails.
// Launch Library 2 allows 15 requests per hour without a key: never add LL2 calls here.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBytes, fetchJson } from './lib/http.ts';
import { attachPhotos, photoSummary } from './lib/images.ts';
import {
  LL2_DASHBOARD_URL,
  LL2_LAUNCHES_URL,
  SNAPI_URL,
  buildSiteData,
} from './lib/pipeline.ts';
import type { PipelineInput } from './lib/pipeline.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'public/data/starship.json');
const CURATED = join(ROOT, 'data/curated/flights.json');
const FIXTURES = join(ROOT, 'tests/fixtures');
const IMAGE_CACHE = join(ROOT, '.image-cache');
const PHOTOS = join(ROOT, 'public/media/photos');

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Curated overrides. A missing or empty file means no overrides; invalid JSON fails the run. */
async function readCurated(): Promise<unknown> {
  if (!existsSync(CURATED)) return [];
  const text = (await readFile(CURATED, 'utf8')).trim();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${CURATED} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The last published data: PREVIOUS_DATA_URL when it is a full URL, else the local output file. */
async function loadPrevious(): Promise<unknown> {
  const url = (process.env.PREVIOUS_DATA_URL ?? '').trim();
  if (/^https?:\/\//i.test(url)) {
    try {
      const data = await fetchJson(url, 2);
      console.log(`previous data: loaded from ${url}`);
      return data;
    } catch (error) {
      console.warn(`previous data: ${url} failed (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  if (existsSync(OUTPUT)) {
    console.log(`previous data: loaded from ${OUTPUT}`);
    return readJson(OUTPUT);
  }
  return null;
}

async function main(): Promise<void> {
  const offline = process.argv.includes('--offline');
  const input: PipelineInput = offline
    ? {
        fetchDashboard: () => readJson(join(FIXTURES, 'll2-dashboard.json')),
        fetchLaunches: () => readJson(join(FIXTURES, 'll2-launches-detailed.json')),
        fetchNews: () => readJson(join(FIXTURES, 'snapi-articles.json')),
        loadPrevious,
        curated: await readCurated(),
        now: new Date(),
      }
    : {
        fetchDashboard: () => fetchJson(LL2_DASHBOARD_URL),
        fetchLaunches: () => fetchJson(LL2_LAUNCHES_URL),
        fetchNews: () => fetchJson(SNAPI_URL),
        loadPrevious,
        curated: await readCurated(),
        now: new Date(),
      };

  const built = await buildSiteData(input);
  for (const line of built.log) console.log(line);

  // After the fallback merge, so carried-over flights get photos too.
  let data = built.data;
  try {
    const photos = await attachPhotos(data, built.photoSources, {
      cacheDir: IMAGE_CACHE,
      outDir: PHOTOS,
      download: offline ? null : (url) => fetchBytes(url),
    });
    data = photos.data;
    console.log(photoSummary(photos.stats));
  } catch (error) {
    // Photos are decoration: publish the data without them rather than not at all.
    console.warn(`photos: FAILED (${error instanceof Error ? error.message : String(error)}); publishing without photos`);
    data = { ...data, flights: data.flights.map((f) => ({ ...f, photo: null })), prototypePhotos: {} };
  }

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(data, null, 2)}\n`);
  const next = data.flights.find((f) => f.id === data.nextFlightId);
  console.log(
    `wrote ${OUTPUT}${offline ? ' (offline fixtures)' : ''}: ${data.flights.length} flights, ` +
      `next ${next ? `${next.name} (${next.id})` : 'none'}`,
  );
}

main().catch((error: unknown) => {
  console.error(`fetch-data failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
