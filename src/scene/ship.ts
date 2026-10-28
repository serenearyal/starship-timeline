// Starship V3 upper stage, modelled in metres from public dimensions.
// Object space: +Y runs from the aft skirt to the nose, +Z is the windward (tiled) side.

import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
  Vector2,
  type Material,
} from 'three';
import { createHullMaterial } from './hull-material.ts';

export const SHIP_LENGTH = 52.1;
export const SHIP_RADIUS = 4.5;
const NOSE_LENGTH = 15.6;
const NOSE_BASE = SHIP_LENGTH - NOSE_LENGTH;

/** Hull radius at height y (blunt ogive nose on a 9 m barrel). */
export function hullRadius(y: number): number {
  if (y <= NOSE_BASE) return SHIP_RADIUS;
  const x = Math.min((y - NOSE_BASE) / NOSE_LENGTH, 1);
  return SHIP_RADIUS * Math.pow(Math.max(1 - Math.pow(x, 1.85), 0), 1 / 1.75);
}

function hullGeometry(): LatheGeometry {
  const pts: Vector2[] = [new Vector2(SHIP_RADIUS - 0.06, 0), new Vector2(SHIP_RADIUS, 0.05)];
  for (let y = 0.6; y < NOSE_BASE; y += 1.83 / 2) pts.push(new Vector2(SHIP_RADIUS, y));
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    // Denser sampling towards the tip, where curvature is highest.
    const t = 1 - Math.pow(1 - i / steps, 1.6);
    const y = NOSE_BASE + t * NOSE_LENGTH;
    pts.push(new Vector2(Math.max(hullRadius(y), i === steps ? 0 : 0.001), y));
  }
  return new LatheGeometry(pts, 256);
}

function roundedPolygon(points: [number, number][], radius: number): Shape {
  const shape = new Shape();
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = points[(i - 1 + n) % n]!;
    const [cx, cy] = points[i]!;
    const [nx, ny] = points[(i + 1) % n]!;
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const ax = cx + ((px - cx) / inLen) * r;
    const ay = cy + ((py - cy) / inLen) * r;
    const bx = cx + ((nx - cx) / outLen) * r;
    const by = cy + ((ny - cy) / outLen) * r;
    if (i === 0) shape.moveTo(ax, ay);
    else shape.lineTo(ax, ay);
    shape.quadraticCurveTo(cx, cy, bx, by);
  }
  shape.closePath();
  return shape;
}

function flapGeometry(points: [number, number][], thickness: number, corner: number): ExtrudeGeometry {
  const geo = new ExtrudeGeometry(roundedPolygon(points, corner), {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 3,
    curveSegments: 10,
  });
  geo.translate(0, 0, -thickness / 2);
  return geo;
}

function bellGeometry(throat: number, exit: number, length: number): LatheGeometry {
  const pts: Vector2[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = throat + (exit - throat) * (1 - Math.pow(1 - t, 2.1));
    pts.push(new Vector2(r, length * (1 - t)));
  }
  return new LatheGeometry(pts, 64);
}

export interface ShipModel {
  group: Group;
  materials: Material[];
}

export function createShip(): ShipModel {
  const group = new Group();
  group.name = 'starship';

  const hullMat = createHullMaterial({ mode: 'hull', radius: SHIP_RADIUS });
  const flapMat = createHullMaterial({ mode: 'flap' });
  const steelMat = createHullMaterial({ mode: 'steel' });
  const engineMat = new MeshStandardMaterial({ color: 0x5a524b, metalness: 0.92, roughness: 0.42, side: DoubleSide });
  const bayMat = new MeshStandardMaterial({ color: 0x1b1b1d, metalness: 0.4, roughness: 0.8 });

  const hull = new Mesh(hullGeometry(), hullMat);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // Aft flaps: root along the barrel, broad faces windward/leeward.
  const aftGeo = flapGeometry(
    [
      [0, 0],
      [3.9, 0.7],
      [4.05, 8.1],
      [0, 10.6],
    ],
    0.44,
    0.9,
  );
  for (const side of [1, -1]) {
    const flap = new Mesh(aftGeo, flapMat);
    flap.position.set(side * (SHIP_RADIUS - 0.08), 1.6, 0.35);
    flap.scale.x = side;
    flap.castShadow = true;
    flap.receiveShadow = true;
    group.add(flap);

    const cover = new Mesh(new CapsuleGeometry(0.5, 9.0, 6, 20), steelMat);
    cover.scale.set(1, 1, 0.75);
    cover.position.set(side * (SHIP_RADIUS - 0.05), 1.6 + 5.3, -0.45);
    cover.castShadow = true;
    group.add(cover);
  }

  // Forward flaps: smaller, on the nose, shifted towards the leeward side (V2/V3 layout).
  const fwdBottom = NOSE_BASE + 2.2;
  const fwdLength = 7.2;
  const r0 = hullRadius(fwdBottom);
  const r1 = hullRadius(fwdBottom + fwdLength);
  const lean = Math.atan2(r0 - r1, fwdLength);
  const fwdGeo = flapGeometry(
    [
      [0, 0],
      [2.55, 1.1],
      [2.7, 5.0],
      [0, fwdLength + 0.4],
    ],
    0.36,
    0.75,
  );
  for (const side of [1, -1]) {
    const pivot = new Group();
    pivot.rotation.y = side * 0.38;
    const flap = new Mesh(fwdGeo, flapMat);
    flap.position.set(side * (r0 - 0.12), fwdBottom, 0);
    flap.rotation.z = side * lean;
    flap.scale.x = side;
    flap.castShadow = true;
    flap.receiveShadow = true;
    pivot.add(flap);

    const cover = new Mesh(new CapsuleGeometry(0.38, fwdLength - 1.4, 6, 16), steelMat);
    cover.scale.set(1, 1, 0.7);
    cover.position.set(side * ((r0 + r1) / 2 - 0.1), fwdBottom + fwdLength / 2, -0.35);
    cover.rotation.z = side * lean;
    cover.castShadow = true;
    pivot.add(cover);
    group.add(pivot);
  }

  // Raceway along the leeward side.
  const raceway = new Mesh(new BoxGeometry(0.44, NOSE_BASE - 2.4, 0.28), steelMat);
  raceway.position.set(0, 1.4 + (NOSE_BASE - 2.4) / 2, -SHIP_RADIUS - 0.1);
  raceway.castShadow = true;
  group.add(raceway);

  // Engine bay: 3 sea-level Raptors in the centre, 3 vacuum Raptors around them.
  const bay = new Mesh(new CircleGeometry(SHIP_RADIUS - 0.06, 64), bayMat);
  bay.rotation.x = Math.PI / 2;
  bay.position.y = 3.6;
  group.add(bay);
  const rvac = bellGeometry(0.42, 1.15, 3.3);
  const sl = bellGeometry(0.3, 0.66, 1.75);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
    const vac = new Mesh(rvac, engineMat);
    vac.position.set(Math.sin(a) * 2.95, 0.2, Math.cos(a) * 2.95);
    group.add(vac);
    const b = (i / 3) * Math.PI * 2;
    const sea = new Mesh(sl, engineMat);
    sea.position.set(Math.sin(b) * 1.15, 1.2, Math.cos(b) * 1.15);
    group.add(sea);
  }

  return { group, materials: [hullMat, flapMat, steelMat, engineMat, bayMat] };
}
