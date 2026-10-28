// Program milestones. Past items are fixed history; planned items are SpaceX and NASA statements
// as reported up to PLAN_AS_OF. Future Starship launches on the Launch Library manifest are added
// automatically at runtime, so this list only holds what the manifest cannot know.

export const PLAN_AS_OF = '2026-10-27';

export interface Milestone {
  /** ISO date for past items; a sortable date for planned ones. */
  date: string;
  /** Display text for planned items ("Early 2027"). */
  when?: string;
  title: string;
  detail: string;
  planned?: boolean;
}

export const MILESTONES: Milestone[] = [
  { date: '2019-07-26', title: 'Starhopper flies', detail: 'A single Raptor lifts the squat test vehicle 20 m off the ground.' },
  { date: '2020-08-04', title: 'SN5 hops 150 m', detail: 'The first full-diameter steel prototype flies and lands.' },
  { date: '2020-12-09', title: 'SN8 belly flop', detail: 'A 12.5 km flight proves the skydiver descent and flip.' },
  { date: '2021-05-05', title: 'SN15 lands', detail: 'The first prototype to land intact after a high-altitude flight.' },
  { date: '2023-04-20', title: 'First full stack flies', detail: 'Starship and Super Heavy lift off together for the first time.' },
  { date: '2023-11-18', title: 'Hot staging and space', detail: 'Flight 2 separates the stages under power and the ship reaches space.' },
  { date: '2024-06-06', title: 'Both stages splash down', detail: 'Flight 4: the ship survives reentry for the first time.' },
  { date: '2024-10-13', title: 'Booster caught', detail: 'Flight 5: the tower catches Super Heavy with its chopsticks.' },
  { date: '2025-05-27', title: 'First reflight', detail: 'Flight 9: Booster 14 flies a second time.' },
  { date: '2025-08-26', title: 'First payload deploy', detail: 'Flight 10 releases eight Starlink simulators.' },
  { date: '2026-05-22', title: 'Starship V3', detail: 'Flight 12: Raptor 3 and the new Pad 2 debut.' },
  { date: '2026-07-24', title: 'A ship comes home', detail: 'Flight 13: Ship 40 survives splashdown and returns to Starbase.' },
  { date: '2026-09-28', title: 'Orbit', detail: 'Flight 14 reaches orbit and deploys 26 Starlink V3 satellites.' },
  {
    date: '2026-11-15',
    when: 'Late 2026',
    title: 'Catch both stages',
    detail: 'Flight 15 is to try the first ship catch and the first V3 booster catch at Pad 2.',
    planned: true,
  },
  {
    date: '2026-12-20',
    when: 'Late 2026 or early 2027',
    title: 'Florida debut',
    detail: 'The first Starship launch from Kennedy Space Center pad 39A.',
    planned: true,
  },
  {
    date: '2027-02-15',
    when: 'Early 2027',
    title: 'Ship reflight and refueling',
    detail: 'SpaceX targets the first reflown ship and the first ship-to-ship propellant transfer.',
    planned: true,
  },
  {
    date: '2027-04-01',
    when: '2027',
    title: 'Weekly launches',
    detail: 'SpaceX aims for weekly flights in the first half of 2027 and more after that.',
    planned: true,
  },
  {
    date: '2027-11-01',
    when: 'Late 2027',
    title: 'Uncrewed Moon landing',
    detail: 'The Starship lunar lander demonstration NASA requires before crews fly on it.',
    planned: true,
  },
  {
    date: '2028-03-01',
    when: '2028',
    title: 'Crew to the Moon',
    detail: 'Artemis IV and V plan the first crewed landings of the era; NASA has not yet assigned the landers.',
    planned: true,
  },
  {
    date: '2028-12-01',
    when: '2028 and later',
    title: 'Cargo to Mars',
    detail: 'SpaceX skipped the 2026 Mars window to focus on the Moon and now lists Mars cargo flights from 2028.',
    planned: true,
  },
];
