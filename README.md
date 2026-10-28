# Starship Flight Log

An unofficial, self-updating site that follows SpaceX Starship: the story so far, the next launch, what comes after, every flight test, the vehicle versions, the fleet, conditions at Starbase and the latest news.

Live site: https://serenearyal.github.io/starship-timeline/

The past is photographed, the future is rendered.
The page opens on a full-screen photo of the latest flight under the next one.
The story follows in scroll-pinned chapters, one full-screen flight photo each, from Starhopper to orbit.
At orbit the photos give way to a real-time render: a Starship V3 over the Earth at orbital sunrise, which stays behind the roadmap of what SpaceX plans next.
The sky shader ray-traces the planet with NASA Blue Marble and Black Marble imagery, ray-marches a single-scattering atmosphere, and draws ocean glint, cloud shadows, city lights and the green night airglow.
The ship hull is procedural steel with hex heat-shield tiles, lit by the same atmosphere through an environment probe.
The render loads only near the end of the story and runs only while it is on screen.

## How it updates itself

A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs every 30 minutes, on every push to `main`, and on demand.
Each run tests the pipeline, fetches fresh data, builds the site and deploys it to GitHub Pages.
No computer needs to be on, and nothing needs to be pulled by hand.

- Launch data comes from [Launch Library 2](https://thespacedevs.com/llapi) by The Space Devs: two calls per run, well under the free limit of 15 per hour.
- News comes from the [Spaceflight News API](https://spaceflightnewsapi.net).
- Flight photos come with the Launch Library data. Each run downloads new ones, resizes them with sharp (WebP at 2400 and 1200 px, a JPEG fallback and a tiny blurred placeholder) and serves them from the site. `actions/cache` keeps the resized photos between runs, so a normal run downloads nothing.
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

The story chapters live in `src/content/story.ts`.
A flight flown after the last chapter gets its own chapter automatically, from its curated highlights and its photo.
The roadmap lives in `src/content/milestones.ts`, and vehicle versions and engines in `src/content/vehicle.ts`.
Upcoming missions from the Launch Library manifest join the roadmap automatically.
Launch Library sometimes reuses one photo for several flights; only the oldest of those flights shows it, and the others get a card without a photo.

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
- `?noscene` turns off the 3D scene; the orbit chapter then shows the Flight 14 photo.
- `#flight-14` (any flight number) opens that flight's sheet.
- `python3 scripts/build-textures.py` rebuilds the Earth textures from NASA Visible Earth.

## Layout

- `scripts/` - the data pipeline (`fetch-data.ts`, `lib/`, with the photo step in `lib/images.ts`) and the texture builder.
- `src/scene/` - the WebGL render: sky and atmosphere shaders, ship geometry and hull material, post-processing.
- `src/ui/` - one module per section, plus `photo.ts` for responsive photos.
- `src/content/` - hand-written story chapters, roadmap and vehicle data.
- `data/curated/` - hand-checked flight detail merged into the API data.

## Credits

Launch data by The Space Devs.
Flight photos by SpaceX unless a photo says otherwise, through Launch Library 2, mostly under CC BY-NC 2.0; each photo shows its credit on the page.
News by the Spaceflight News API.
Earth imagery by NASA Visible Earth (Blue Marble, Black Marble).
Not affiliated with SpaceX.
