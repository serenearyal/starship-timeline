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

(filled in at the end)
