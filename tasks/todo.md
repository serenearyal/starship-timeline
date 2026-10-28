# Starship Flight Log - plan

Goal: a minimal, futuristic, self-updating Starship website on GitHub Pages.
It refreshes itself every 30 minutes from public APIs through GitHub Actions, with no laptop and no manual steps.

## Architecture

- Static site: Vite + TypeScript (no framework) + Three.js.
- Data: `scripts/fetch-data.ts` pulls Launch Library 2 (2 calls per run, limit 15/h) and the Spaceflight News API, merges curated flight detail from `data/curated/`, validates, and writes `public/data/starship.json`.
- Fallback: when an API fails, the script reuses the last deployed JSON, so the site never goes blank.
- CI: `.github/workflows/deploy.yml` runs on push, on a 30-minute cron and on demand: test, fetch, build, deploy to Pages.
- Keepalive: the workflow re-enables itself through the Actions API, so GitHub does not stop the cron after 60 quiet days.

## Design tokens

- Color: void `#000000`, steel `#D9DEE3`, steel-dim `#8A9099`, tile `#141517`, plasma `#FF7847` (heat, loss, anomaly), methane `#86B6FF` (future, live).
- Type: Archivo variable. Expanded light for display, normal width for text, tabular figures for telemetry. Sentence case labels.
- Layout: left-aligned content, the 3D scene stays visible on the right as a fixed backdrop behind glass panels.
- Signature: the hero render (Ship over Earth at orbital sunrise, ray-marched atmosphere, real NASA Earth, procedural steel and tiles). Everything else stays quiet.
- Vernacular: flight rows use the webcast event track (filled = done, hollow = not reached, plasma = lost here).

## Tasks

- [x] Check data sources (LL2 dashboard + detailed launches, SNAPI) and save fixtures
- [x] Earth textures from NASA public domain imagery (`scripts/build-textures.py`)
- [x] Research 2026 flights, V3 specs and roadmap (2 research agents)
- [x] Scaffold Vite + TS, data contract `src/data/types.ts`
- [x] Data pipeline + unit tests + workflow (builder agent)
- [x] Hero scene: Earth, atmosphere, ship geometry, steel and tile materials, post-processing
- [x] Sections: next flight, flights board, milestones, vehicle, fleet, Starbase, news
- [x] Curated content from research
- [x] Visual QA loop in Chrome (desktop + mobile, reduced motion, no console errors)
- [x] Performance pass (adaptive quality, pause when hidden)
- [ ] GitHub repo, Pages, first deploy, verify cron run
- [x] Social preview image (`public/og.jpg`)
- [x] README

## Review

Shipped to https://serenearyal.github.io/starship-timeline/ on 2026-10-27.
The push runs passed: tests, live fetch (LL2 and SNAPI both ok, 15 flights, 12 articles), build and Pages deploy.
The live page loads with no console messages and every request returns 200.

Visual QA found and fixed:

- Red dashes on the Earth limb at night: the star and sun-disc code took screen derivatives inside the Earth/sky branch. The pixel size now comes from uniform control flow.
- The hero ship read as a tube seen from behind. The camera now shows it side-on, nose to the upper left, over the limb.
- The ship sat behind every section title. On scroll the camera now turns east, so the ship leaves the frame and only the limb stays.
- Phones got their own camera framing, a deeper scrim and room above the hero copy.
- Booster labels ran into the first track dot; glass over the bright limb was hard to read; loud YouTube thumbnails replaced with quiet live-camera tiles; the stack drawing now matches the spec sheet height; the milestone rail changes colour exactly at the "today" mark.
- Night intro: added the green airglow layer and a slower sunrise, so the first seconds show the night side before the sun comes up.

CI found: the LL2 detailed launch list timed out twice at 20 s in the first run, with no log line. The timeout is now 60 s and each retry logs.

Open: confirm the first scheduled (cron) run.

# v2 - cinematic redesign

Feedback (2026-10-27): v1 shows facts but does not evoke emotion; the bar is the SpaceX Starship page.
SpaceX gets its emotion from full-screen real photography, huge bold type and very few words per screen.

Concept: the past is photographed, the future is rendered.
Launch Library 2 already gives a high-resolution SpaceX photo (CC BY-NC 2.0) for almost every flight, so new flights bring new images by themselves.

## Structure

1. Hero: full-screen photo of the latest flight, slow push-in, huge uppercase next-flight title, date or countdown, one line of mission, career stats.
2. The story: scroll-pinned chapters, one full-screen photo each with a big headline, one sentence and one number (Starhopper, SN8, SN15, Flight 1, Flight 4, Flight 5 catch, Flight 13 recovery, Flight 14 orbit).
3. What comes next: the 3D orbit render becomes the future chapter (Flight 15 catch, Florida, refueling, Moon, Mars). It renders only while on screen.
4. Every flight: full-height photo cards in a horizontal strip; each opens a full-screen flight sheet with the story, the phase strip and the webcast.
5. The vehicle: black stage, to-scale drawing, V1 to V4, four stats, Raptor.
6. Starbase now: full-screen night photo with weather, closures, tests and live cameras.
7. News and footer with photo credits.

## Tasks

- [x] Pipeline: download flight images in CI, resize to 2400/1200 px WebP + JPEG with sharp, cache by URL (actions/cache), keep credit and license in the JSON
- [x] Curated story chapters (`src/content/story.ts`) mapped to flight numbers
- [x] New type system: Archivo 800 at 112% width, uppercase headlines; sentence-case body
- [x] Hero, story, future (3D), flight strip + sheet, vehicle, Starbase, news
- [x] Motion: push-in, scroll-linked crossfades, count-up numbers; reduced motion respected
- [ ] Visual QA desktop + phone, performance, deploy, verify cron

## Review (v2)

- Desktop 1440x900 and phone 390x844 checked section by section; deep links, Escape, the sheet, `?still` and `?noscene` checked; no console errors.
- Fixed in QA: hero title crossed the rocket (now at most 5 em wide, number on its own line); the chapter rail was hard to read on bright skies; the future heading touched the ship and left a seam; the roadmap was hard to read over the Earth (now smoked glass); phone stat order, button row, credit position, a 9 px grid overflow and the footer wordmark overflow.
- Found in QA: this Chrome runs pages at 30 fps (energy saver). The adaptive quality took that for a slow GPU and lowered the resolution. It now measures the browser's frame interval first and lowers the resolution only when frames are slower than that.
- Launch Library reuses one image for Flights 7, 8, 9 and 11, and the next flight reuses the Flight 13 image. Only the oldest flight shows a shared photo.
- The Starhopper photo is only 1120 px wide, so it is soft at full screen.
- Cron (2026-10-28): no scheduled run started in the first 4 hours after the repository was created (8 slots missed), with the workflow active, on `main`, valid cron and GitHub Actions operational.
A manual run (`gh workflow run deploy.yml`) passed: LL2 and SNAPI ok, 17 photos from cache, deployed.
GitHub is known to start schedules on new repositories late; a 12-hour watch is open.
