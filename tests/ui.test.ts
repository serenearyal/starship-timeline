import { describe, expect, it } from 'vitest';
import { camName } from '../src/ui/starbase.ts';

describe('camName', () => {
  it('keeps the camera name and drops channel and site boilerplate', () => {
    expect(camName("Starbase Live: 24/7 Starship & Super Heavy Development From SpaceX's Boca Chica Facility")).toBe('Starbase Live');
    expect(camName('Starbase Live Rover 2.0 Cam SpaceX Starship Launch Complex')).toBe('Rover 2.0 Cam');
    expect(camName('Starbase Live Sentinel Cam -  SpaceX Starship Launch and Production Facility')).toBe('Sentinel Cam');
  });

  it('leaves other titles alone', () => {
    expect(camName('NASASpaceflight Starbase Live')).toBe('NASASpaceflight Starbase Live');
  });
});
