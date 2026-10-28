// Curated vehicle specifications. Sources: SpaceX (spacex.com/vehicles/starship, spacex.com/updates),
// Elon Musk's August 2025 vehicle summary slide, SpaceX's August 2024 Raptor chart. Checked 2026-10-27.

export interface StackVersion {
  id: 'V1' | 'V2' | 'V3' | 'V4';
  name: string;
  flown: string;
  shipHeight: number;
  boosterHeight: number;
  shipPropellant: number;
  boosterPropellant: number;
  liftoffThrust: number; // tonnes-force
  shipEngines: string;
  boosterEngines: string;
  payload: string; // to LEO, reusable
  changes: string[];
  /** Drawing hints for the scale silhouette. */
  draw: { gridFins: 2 | 3; forwardFlap: 'large' | 'small'; integratedHotStage: boolean };
}

export const STACKS: StackVersion[] = [
  {
    id: 'V1',
    name: 'Starship V1',
    flown: 'Flights 1 to 6',
    shipHeight: 50.3,
    boosterHeight: 71,
    shipPropellant: 1200,
    boosterPropellant: 3250,
    liftoffThrust: 7100,
    shipEngines: '3 sea-level + 3 vacuum Raptor 2',
    boosterEngines: '33 Raptor 2',
    payload: 'About 15 t',
    changes: [
      'Hot staging: the ship lights its engines before separation, from Flight 2',
      'Electric thrust vector control on Super Heavy in place of hydraulics',
      'First booster catch (Flight 5) and first in-space relight (Flight 6)',
    ],
    draw: { gridFins: 2, forwardFlap: 'large', integratedHotStage: false },
  },
  {
    id: 'V2',
    name: 'Starship V2',
    flown: 'Flights 7 to 11',
    shipHeight: 52.1,
    boosterHeight: 71,
    shipPropellant: 1500,
    boosterPropellant: 3250,
    liftoffThrust: 7100,
    shipEngines: '3 sea-level + 3 vacuum Raptor 2',
    boosterEngines: '33 Raptor 2',
    payload: 'About 35 t',
    changes: [
      'Smaller forward flaps, moved towards the nose and the leeward side',
      'About 25% more propellant in the ship',
      'New avionics: faster flight computer, 2.7 MW of smart batteries, Starlink and GPS antennas',
      'New tiles with a backup layer under the heat shield',
    ],
    draw: { gridFins: 2, forwardFlap: 'small', integratedHotStage: false },
  },
  {
    id: 'V3',
    name: 'Starship V3',
    flown: 'Flight 12 onwards',
    shipHeight: 52.1,
    boosterHeight: 72.3,
    shipPropellant: 1600,
    boosterPropellant: 3650,
    liftoffThrust: 8240,
    shipEngines: '3 sea-level + 3 vacuum Raptor 3',
    boosterEngines: '33 Raptor 3',
    payload: '100 t or more',
    changes: [
      'Raptor 3 on both stages, with no engine shrouds or aft fire suppression',
      'Hot-stage ring built into the booster instead of a throwaway interstage',
      'Three grid fins, 50% larger, that double as catch points',
      'Docking drogues and ship-to-ship propellant transfer connections',
      'New fuel transfer tube lets all 33 booster engines start together',
    ],
    draw: { gridFins: 3, forwardFlap: 'small', integratedHotStage: true },
  },
  {
    id: 'V4',
    name: 'Starship V4',
    flown: 'Planned for 2027',
    shipHeight: 61,
    boosterHeight: 81,
    shipPropellant: 2300,
    boosterPropellant: 4050,
    liftoffThrust: 10000,
    shipEngines: '3 sea-level + 6 vacuum Raptor',
    boosterEngines: '33 Raptor',
    payload: '200 t or more',
    changes: [
      'Three more vacuum Raptors on the ship, nine engines in total',
      'Longer ship and booster with about 30% more propellant in the ship',
      'Figures are targets from August 2025 and may change',
    ],
    draw: { gridFins: 3, forwardFlap: 'small', integratedHotStage: true },
  },
];

export interface EngineVersion {
  id: string;
  thrust: number; // tf, sea level
  mass: number; // kg, engine only
  isp: number; // s
  change: string;
}

export const ENGINES: EngineVersion[] = [
  { id: 'Raptor 1', thrust: 185, mass: 2080, isp: 350, change: 'First full-flow staged-combustion engine to fly' },
  { id: 'Raptor 2', thrust: 230, mass: 1630, isp: 347, change: 'Redesigned and simplified; many flanges became welds' },
  {
    id: 'Raptor 3',
    thrust: 280,
    mass: 1525,
    isp: 350,
    change: 'Plumbing and sensors moved inside the engine, so it needs no heat shield or shroud',
  },
];

export const ENGINE_SOURCE = 'SpaceX figures, August 2024. Thrust at sea level.';
