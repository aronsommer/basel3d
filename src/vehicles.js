// The models of the vehicles of createMovers (src/main.js): tram and train cars and road vehicles.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part, profile } from "./parts.js";

// A part (src/parts.js) of a vehicle of createMovers with only: 1 for the first car of a vehicle
// only, 2 for the last one only, 3 and 4 the same for lamps (untinted and lit), 0 for every car.
function piece(geometry, color, at, only = 0) {
  const g = part(geometry, color, at);
  const flags = new Float32Array(g.attributes.position.count).fill(only);
  g.setAttribute("only", new THREE.BufferAttribute(flags, 1));
  return g;
}
// A box from (x0, y0, z0) to (x1, y1, z1) as a piece, turned by tilt (radians) about the x axis
// through its centre.
const block = (x0, y0, z0, x1, y1, z1, color, only, tilt = 0) =>
  piece(
    new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).rotateX(tilt),
    color,
    [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    only,
  );
// A block from (ya, za) to (yb, zb), x0 to x1 wide and 0.012 thick.
function bar(x0, x1, ya, za, yb, zb, color, only) {
  const [y, z, l] = [(ya + yb) / 2, (za + zb) / 2, Math.hypot(yb - ya, zb - za) / 2];
  return block(
    x0,
    y - 0.006,
    z - l,
    x1,
    y + 0.006,
    z + l,
    color,
    only,
    Math.atan2(ya - yb, zb - za),
  );
}
// A side profile ([z, y] points) as a piece, width wide.
const outline = (points, width, color) => piece(profile(points, width), color, [0, 0, 0]);

const DARK = 0x2a2d30; // skirts, bogies, tyres, pantographs
const GLASS = 0x1f2a30;
const LIGHT = 0xdadcd6; // roofs, tinted as the body
const HEAD = 0xfff4d6; // headlights
const TAIL = 0xe01818;

// A tram car of length and height 1 along +z, from 0.1 to 1.1 above the path (scaled per car),
// 2.3 m wide, after the Flexity of BVB and BLT: a dark skirt, the body with two windows and a door
// per side (each one block a little wider than the body, so it shows on both sides), dark ends (the
// windscreen; between cars they look like bellows), a light roof with a box on it. The first car
// has a pantograph, headlights and a destination display, the last one tail lights.
export function tramCar() {
  const w = 1.15;
  return mergeGeometries([
    block(0.1 - w, 0.1, -0.48, w - 0.1, 0.2, 0.48, DARK),
    block(-w, 0.17, -0.5, w, 1.05, 0.5, 0xffffff),
    block(0.12 - w, 1.05, -0.5, w - 0.12, 1.1, 0.5, LIGHT),
    block(-0.6, 1.1, -0.3, 0.6, 1.16, 0.2, LIGHT),
    block(-w - 0.02, 0.55, -0.44, w + 0.02, 0.9, -0.1, GLASS),
    block(-w - 0.02, 0.24, -0.06, w + 0.02, 0.9, 0.1, GLASS),
    block(-w - 0.02, 0.55, 0.14, w + 0.02, 0.9, 0.44, GLASS),
    block(0.15 - w, 0.5, -0.505, w - 0.15, 0.95, 0.505, GLASS),
    bar(-0.3, 0.3, 1.16, -0.2, 1.3, -0.02, DARK, 1),
    bar(-0.3, 0.3, 1.3, -0.02, 1.42, -0.18, DARK, 1),
    block(-0.85, 1.42, -0.19, 0.85, 1.44, -0.17, DARK, 1),
    block(-0.6, 0.96, 0.5, 0.6, 1.02, 0.508, 0xffb000, 3),
    ...[-1, 1].flatMap((s) => [
      block(s * (w - 0.2) - 0.12, 0.28, 0.5, s * (w - 0.2) + 0.12, 0.35, 0.508, HEAD, 3),
      block(s * (w - 0.2) - 0.12, 0.28, -0.508, s * (w - 0.2) + 0.12, 0.35, -0.5, TAIL, 4),
    ]),
  ]);
}

// Train cars as tramCar, 3 m wide, on bogies, with dark ends (gangways) and a light roof. The first
// car has a pantograph and the three headlights of Swiss trains, the last one tail lights.
// Coaches after the SBB: a window band, a red stripe below it, a door at each end per side; goods
// wagons: closed, with a sliding door per side.
export function trainCar(goods) {
  const w = 1.5;
  return mergeGeometries([
    ...[-1, 1].map((s) =>
      block(0.25 - w, 0.1, s * 0.36 - 0.06, w - 0.25, 0.2, s * 0.36 + 0.06, DARK),
    ),
    block(-w, 0.17, -0.5, w, 1.03, 0.5, 0xffffff),
    block(0.15 - w, 1.03, -0.5, w - 0.15, 1.1, 0.5, LIGHT),
    block(0.4 - w, 0.3, -0.505, w - 0.4, 0.95, 0.505, GLASS),
    ...(goods
      ? [block(-w - 0.02, 0.25, -0.12, w + 0.02, 0.95, 0.12, LIGHT)]
      : [
          block(-w - 0.02, 0.55, -0.41, w + 0.02, 0.82, 0.41, GLASS),
          block(-w - 0.02, 0.45, -0.5, w + 0.02, 0.5, 0.5, 0xc8102e),
          ...[-1, 1].map((s) =>
            block(-w - 0.02, 0.24, s * 0.45 - 0.025, w + 0.02, 0.82, s * 0.45 + 0.025, GLASS),
          ),
        ]),
    block(-0.5, 1.1, 0.25, 0.5, 1.14, 0.38, DARK, 1),
    bar(-0.35, 0.35, 1.14, 0.27, 1.26, 0.33, DARK, 1),
    bar(-0.35, 0.35, 1.26, 0.33, 1.36, 0.28, DARK, 1),
    block(-0.9, 1.36, 0.275, 0.9, 1.375, 0.285, DARK, 1),
    block(-0.12, 0.96, 0.5, 0.12, 1.0, 0.506, HEAD, 3),
    ...[-1, 1].flatMap((s) => [
      block(s * (w - 0.35) - 0.12, 0.28, 0.5, s * (w - 0.35) + 0.12, 0.33, 0.506, HEAD, 3),
      block(s * (w - 0.35) - 0.12, 0.28, -0.506, s * (w - 0.35) + 0.12, 0.33, -0.5, TAIL, 4),
    ]),
  ]);
}

// Road vehicles in metres along +z, length long and centred on z = 0, on the path: wheels on the
// given axles (z), head and tail lights across the front and back at the given heights.
function road(length, width, wheel, axles, [head, tail], parts) {
  const [l, w] = [length / 2, width / 2];
  const tyre = new THREE.CylinderGeometry(wheel, wheel, width + 0.04, 6).rotateZ(Math.PI / 2);
  return mergeGeometries([
    ...parts,
    ...axles.map((z) => piece(tyre, DARK, [0, wheel, z])),
    block(0.15 - w, head, l, w - 0.15, head + 0.1, l + 0.02, HEAD, 3),
    block(0.15 - w, tail, -l - 0.02, w - 0.15, tail + 0.1, -l, TAIL, 4),
  ]).scale(1, 1, 1 / length); // as long as the vehicle (createMovers)
}
// Each: its share of all road vehicles, its length (metres), its colours and its shape.
export const ROAD = [
  // A car with a glass cabin under a roof.
  {
    share: 0.44,
    length: 4.4,
    colors: [0xe32b2b, 0x2f6db5, 0xf2c400, 0x3b9c4a, 0xf28c28, 0x18a5b5, 0xd6408f, 0xf2f2f0],
    shape: () =>
      road(
        4.4,
        1.8,
        0.32,
        [1.35, -1.35],
        [0.62, 0.7],
        [
          outline(
            [
              [-2.2, 0.3],
              [2.2, 0.3],
              [2.2, 0.75],
              [1.2, 0.92],
              [-1.9, 0.95],
              [-2.2, 0.85],
            ],
            1.8,
            0xffffff,
          ),
          outline(
            [
              [-1.75, 0.93],
              [1.15, 0.91],
              [0.4, 1.42],
              [-1.2, 1.42],
            ],
            1.6,
            GLASS,
          ),
          block(-0.78, 1.42, -1.2, 0.78, 1.47, 0.4, 0xffffff),
        ],
      ),
  },
  // An SUV, higher and square.
  {
    share: 0.2,
    length: 4.7,
    colors: [0x1c1f24, 0xb8bcc2, 0xf2f2f0, 0x2f6db5, 0x7a1e24, 0x3b5a3a],
    shape: () =>
      road(
        4.7,
        1.9,
        0.38,
        [1.45, -1.45],
        [0.8, 0.85],
        [
          outline(
            [
              [-2.35, 0.4],
              [2.35, 0.4],
              [2.35, 0.95],
              [1.5, 1.1],
              [-2.35, 1.12],
            ],
            1.9,
            0xffffff,
          ),
          outline(
            [
              [-2.25, 1.1],
              [1.45, 1.1],
              [0.8, 1.7],
              [-2.2, 1.72],
            ],
            1.74,
            GLASS,
          ),
          block(-0.88, 1.7, -2.22, 0.88, 1.78, 0.78, 0xffffff),
        ],
      ),
  },
  // A sports car, low and wedged, with a lip on the tail.
  {
    share: 0.08,
    length: 4.4,
    colors: [0xe32b2b, 0xf2c400, 0xf28c28, 0x18a5b5],
    shape: () =>
      road(
        4.4,
        1.9,
        0.33,
        [1.35, -1.35],
        [0.45, 0.6],
        [
          outline(
            [
              [-2.2, 0.25],
              [2.2, 0.25],
              [2.2, 0.55],
              [0.9, 0.78],
              [-1.9, 0.85],
              [-2.2, 0.8],
            ],
            1.9,
            0xffffff,
          ),
          outline(
            [
              [-1.4, 0.82],
              [0.85, 0.78],
              [0, 1.18],
              [-0.9, 1.18],
            ],
            1.5,
            GLASS,
          ),
          block(-0.72, 1.18, -0.9, 0.72, 1.22, 0, 0xffffff),
          block(-0.85, 0.84, -2.2, 0.85, 0.95, -1.95, DARK),
        ],
      ),
  },
  // A van: one box, windows all round.
  {
    share: 0.12,
    length: 5.2,
    colors: [0xf2f2f0, 0xb8bcc2, 0x2f6db5, 0xe32b2b],
    shape: () =>
      road(
        5.2,
        2,
        0.34,
        [1.75, -1.75],
        [0.8, 0.9],
        [
          outline(
            [
              [-2.6, 0.35],
              [2.6, 0.35],
              [2.6, 0.95],
              [2, 1.2],
              [-2.6, 1.2],
            ],
            2,
            0xffffff,
          ),
          outline(
            [
              [-2.55, 1.2],
              [2, 1.2],
              [1.74, 1.65],
              [-2.55, 1.65],
            ],
            1.96,
            GLASS,
          ),
          outline(
            [
              [-2.6, 1.65],
              [1.74, 1.65],
              [1.4, 2.25],
              [-2.6, 2.25],
            ],
            2,
            0xffffff,
          ),
        ],
      ),
  },
  // A lorry: a cab before a box.
  {
    share: 0.08,
    length: 8.5,
    colors: [0xf2f2f0, 0x2f6db5, 0xc8102e, 0xe0b52b],
    shape: () =>
      road(
        8.5,
        2.5,
        0.5,
        [3.2, -2.8],
        [1, 0.8],
        [
          block(-1, 0.45, -4.25, 1, 0.75, 4.15, DARK),
          outline(
            [
              [2.4, 0.6],
              [4.15, 0.6],
              [4.15, 2.8],
              [4, 3],
              [2.4, 3],
            ],
            2.4,
            0xffffff,
          ),
          block(-1.1, 1.75, 4.14, 1.1, 2.6, 4.17, GLASS),
          block(-1.22, 1.8, 3, 1.22, 2.6, 4, GLASS),
          block(-1.2, 0.55, 4.15, 1.2, 0.85, 4.25, DARK),
          block(-1.25, 0.75, -4.25, 1.25, 3.5, 2.3, 0xffffff),
        ],
      ),
  },
  // A tipper on a building site: a cab before an open bed of gravel.
  {
    share: 0.04,
    length: 8,
    colors: [0xf28c28, 0xf2c400],
    shape: () =>
      road(
        8,
        2.5,
        0.5,
        [2.9, -2.4],
        [1, 0.8],
        [
          block(-1, 0.45, -4, 1, 0.75, 3.9, DARK),
          outline(
            [
              [2.2, 0.6],
              [3.9, 0.6],
              [3.9, 2.7],
              [3.75, 2.9],
              [2.2, 2.9],
            ],
            2.4,
            0xffffff,
          ),
          block(-1.1, 1.7, 3.89, 1.1, 2.5, 3.92, GLASS),
          block(-1.22, 1.75, 2.8, 1.22, 2.5, 3.75, GLASS),
          block(-1.2, 0.55, 3.9, 1.2, 0.85, 4, DARK),
          block(-1.25, 0.75, -4, 1.25, 1, 2, 0xffffff),
          ...[-1, 1].map((s) => block(s * 1.25 - 0.08, 1, -4, s * 1.25 + 0.08, 2.1, 2, 0xffffff)),
          ...[-4, 1.85].map((z) => block(-1.25, 1, z, 1.25, 2.1, z + 0.15, 0xffffff)),
          block(-1.17, 1, -3.85, 1.17, 1.8, 1.85, 0x8a7a66),
        ],
      ),
  },
  // A bus: a window band, a door on the right, a destination display and a box on the roof.
  {
    share: 0.04,
    length: 12,
    colors: [0x2e8b3a],
    shape: () =>
      road(
        12,
        2.55,
        0.5,
        [3.6, -2.9],
        [0.6, 0.75],
        [
          block(-1.27, 0.35, -6, 1.27, 2.95, 6, 0xffffff),
          block(-1.29, 1.3, -5.6, 1.29, 2.5, 5.4, GLASS),
          block(-1.15, 1, 5.99, 1.15, 2.6, 6.02, GLASS),
          ...[4.6, -0.2].map((z) => block(1.2, 0.4, z, 1.29, 2.5, z + 0.8, GLASS)),
          block(-0.8, 2.95, -4, 0.8, 3.15, -1, LIGHT),
          block(-0.9, 2.65, 6, 0.9, 2.85, 6.03, 0xffb000, 3),
        ],
      ),
  },
];
