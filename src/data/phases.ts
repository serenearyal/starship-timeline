// Flight phases shown on the webcast-style event track. Shared by the pipeline and the UI.

export const BOOSTER_PHASES = [
  { key: 'liftoff', label: 'Liftoff' },
  { key: 'staging', label: 'Hot staging' },
  { key: 'boostback', label: 'Boostback' },
  { key: 'landing', label: 'Landing burn' },
  { key: 'recovery', label: 'Catch or splashdown' },
] as const;

export const SHIP_PHASES = [
  { key: 'ascent', label: 'Engine cutoff' },
  { key: 'space', label: 'Coast in space' },
  { key: 'deploy', label: 'Payload deploy' },
  { key: 'relight', label: 'Raptor relight' },
  { key: 'reentry', label: 'Reentry' },
  { key: 'landing', label: 'Flip and landing burn' },
] as const;

export type BoosterPhaseKey = (typeof BOOSTER_PHASES)[number]['key'];
export type ShipPhaseKey = (typeof SHIP_PHASES)[number]['key'];
