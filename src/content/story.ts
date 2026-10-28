// The story chapters: the moments that made Starship, one full screen each.
// Photos come from the flight data (Launch Library 2), so this file only holds the words.
// Flights after the last chapter here get a chapter automatically from their curated highlights.

/** A flight or prototype photo. `render: true` shows the live 3D render instead, with the photo as the fallback. */
export type ChapterPhoto = { flight: number; render?: true } | { prototype: string };

export interface Chapter {
  /** ISO date of the event. */
  date: string;
  /** Short label above the title, e.g. "Starhopper" or "Flight 5". */
  label: string;
  title: string;
  text: string;
  stat?: { value: string; label: string };
  photo: ChapterPhoto;
}

export const CHAPTERS: Chapter[] = [
  {
    date: '2019-08-27',
    label: 'Starhopper',
    title: 'It started as a water tower',
    text: 'A squat steel tank on three legs, with one Raptor engine, rose 150 metres above the Texas scrub and set down beside the pad.',
    stat: { value: '150 m', label: 'Its highest hop' },
    photo: { prototype: 'starhopper' },
  },
  {
    date: '2020-12-09',
    label: 'SN8',
    title: 'The belly flop',
    text: 'SN8 climbed to 12.5 km, shut down its engines and fell back flat on its belly like a skydiver. It flipped upright at the last moment and came in too fast.',
    stat: { value: '12.5 km', label: 'Altitude' },
    photo: { prototype: 'sn8' },
  },
  {
    date: '2021-05-05',
    label: 'SN15',
    title: 'It stuck the landing',
    text: 'Four high-altitude prototypes were lost in a row. SN15 flipped, lit its engines and stood still on the pad.',
    stat: { value: '5th', label: 'Attempt' },
    photo: { prototype: 'sn15' },
  },
  {
    date: '2023-04-20',
    label: 'Flight 1',
    title: 'The most powerful rocket ever flown',
    text: 'Thirty-three engines lit at once and the full stack cleared the tower. It tumbled four minutes later and was destroyed, but it flew.',
    stat: { value: '33', label: 'Raptor engines at liftoff' },
    photo: { flight: 1 },
  },
  {
    date: '2024-06-06',
    label: 'Flight 4',
    title: 'Through the fire',
    text: 'The ship came back from space wrapped in plasma that burned through a flap. It kept steering and splashed down on target in the Indian Ocean.',
    stat: { value: '1,400 °C', label: 'Plasma on the heat shield' },
    photo: { flight: 4 },
  },
  {
    date: '2024-10-13',
    label: 'Flight 5',
    title: 'Caught by the tower',
    text: 'A 71-metre booster flew back to the pad it had left seven minutes earlier, and two steel arms closed around it.',
    stat: { value: '7 min', label: 'From liftoff to catch' },
    photo: { flight: 5 },
  },
  {
    date: '2025-08-26',
    label: 'Flight 10',
    title: 'Back on target',
    text: 'Three ships were lost early in the year. Flight 10 released its first payload, relit a Raptor in space and splashed down exactly where it aimed.',
    stat: { value: '8', label: 'Starlink simulators deployed' },
    photo: { flight: 10 },
  },
  {
    date: '2026-07-24',
    label: 'Flight 13',
    title: 'A ship comes home',
    text: 'Ship 40 deployed 20 Starlink satellites, survived reentry and floated after splashdown. It was towed ashore and shipped back to Starbase.',
    stat: { value: '20', label: 'Starlink V3 satellites deployed' },
    photo: { flight: 13 },
  },
  {
    date: '2026-09-28',
    label: 'Flight 14',
    title: 'Orbit',
    text: 'For the first time, Starship went all the way around the planet, with 26 Starlink V3 satellites on board.',
    stat: { value: '26', label: 'Satellites to orbit' },
    photo: { flight: 14, render: true },
  },
];

/** The words over the 3D render after the story: what SpaceX plans next. Roadmap items come from milestones.ts. */
export const FUTURE = {
  title: 'The Moon, then Mars',
  text: 'Orbit was the beginning. Next the tower catches a ship, ships refill each other in orbit, and a Starship lands on the Moon.',
};
