# Starship Flight Log

An unofficial, self-updating site that follows SpaceX Starship: every flight test, the next launch, milestones, vehicle versions, the fleet, conditions at Starbase and the latest news.

Live site: https://serenearyal.github.io/starship-timeline/

The hero is a real-time render: a Starship V3 over the Earth at orbital sunrise.
The sky shader ray-traces the planet with NASA Blue Marble and Black Marble imagery, ray-marches a single-scattering atmosphere, and draws ocean glint, cloud shadows, city lights and the green night airglow.
The ship hull is procedural steel with hex heat-shield tiles, lit by the same atmosphere through an environment probe.

## How it updates itself

A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs every 30 minutes, on every push to `main`, and on demand.
Each run tests the pipeline, fetches fresh data, builds the site and deploys it to GitHub Pages.
No computer needs to be on, and nothing needs to be pulled by hand.

- Launch data comes from [Launch Library 2](https://thespacedevs.com/llapi) by The Space Devs: two calls per run, well under the free limit of 15 per hour.
- News comes from the [Spaceflight News API](https://spaceflightnewsapi.net).
- Weather at the pad loads in the browser from [Open-Meteo](https://open-meteo.com) each time the page opens.
- When an API fails, the pipeline keeps that part of the last published data, so the site never goes blank.
- An open tab checks for new data every 5 minutes and updates without a reload.

GitHub turns off scheduled workflows after 60 days without repository activity.
A small `keepalive` job re-enables the workflow through the Actions API on each scheduled run, so the schedule keeps going without commits.

## Curated detail

The APIs give dates, vehicles and status.
The per-phase flight story (the dots on each flight row), summaries, highlights and outcomes come from `data/curated/flights.json`, checked against SpaceX flight recaps and the space press.
To add a flight, add an entry with its number; the pipeline merges it over the API data on the next run.
An entry with `"onlyWhileUpcoming": true` describes a plan and drops out by itself once the flight has flown.

Milestones and the roadmap live in `src/content/milestones.ts`, and vehicle versions and engines in `src/content/vehicle.ts`.
Upcoming missions from the Launch Library manifest appear on the milestone line automatically.

## Develop

```sh
npm install
npm run fetch-data            # live data into public/data/starship.json
npm run fetch-data -- --offline  # or use the saved fixtures in tests/fixtures
npm run dev
```

- `npm test` runs the pipeline and UI unit tests (Vitest).
- `npm run build` type-checks and builds to `dist/`.
- `?still` in the URL shows the final frame without motion, as with the reduced-motion setting.
- `?noscene` turns off the 3D scene.
- `python3 scripts/build-textures.py` rebuilds the Earth textures from NASA Visible Earth.

## Layout

- `scripts/` - the data pipeline (`fetch-data.ts`, `lib/`) and the texture builder.
- `src/scene/` - the WebGL hero: sky and atmosphere shaders, ship geometry and hull material, post-processing.
- `src/ui/` - one module per section.
- `src/content/` - hand-written milestones and vehicle data.
- `data/curated/` - hand-checked flight detail merged into the API data.

## Credits

Launch data by The Space Devs.
News by the Spaceflight News API.
Earth imagery by NASA Visible Earth (Blue Marble, Black Marble).
Not affiliated with SpaceX.
