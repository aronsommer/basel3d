// A Traxxas XRT race truck in green, life-size (six times the 1/6 scale model): a low green body
// with blue and dark grey slashes and a thin light blue line, a grille and headlights in front,
// smoked windows, XRT on the sides, a black wing over the open back with TRAXXAS on top and a 1 on
// its side plates, a black cage from the roof to it; a black chassis, front bumper with its ring,
// arms and nerf bars, green coil springs, a wheelie bar on two small wheels; tyres with chunky
// blocks on gunmetal beadlock wheels with round holes and green nuts. Driven as in src/drive.js,
// the front wheels steering, the body rolling out of turns and squatting on its springs as it
// speeds up, the front rising then, at most until the wheelie bar is down; Space or the Flip button
// makes a backflip.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part, profile } from "./parts.js";
import { createDriving } from "./drive.js";

// Built in units of 100 mm of the model (Traxxas: 798 × 595 × 258 mm, wheelbase 480 mm, ground
// clearance 49 mm, tyres 188 × 102 mm), drawn SIZE metres a unit.
const SIZE = 0.6;
const WHEEL = 0.94; // radius
const TREAD = 1.02; // the tyres' width
const TRACK = 2.465; // from the middle to a wheel's middle
const AXLE = 2.4; // from the middle to either axle
const RIM = 0.55; // the wheels' radius
const LUGS = 18; // tread blocks around a tyre in each of its two rows
// Radians a wheel is shown turning per frame at most: turning faster, its tread blocks (10° apart,
// the rows staggered) would seem to stand or turn back, as wheels in films.
const SPIN = 0.06;
const ROLL = 0.03; // radians the body rolls out of a turn at most, steering fully at speed
const FIRM = 8; // metres per second below which it rolls less, the slower the less
// Radians the front rises about the back wheels while speeding up: from WHEELIE at a standstill,
// where with the body's squat the wheelie bar's wheels come down to the ground, down to LIFT at
// WHEELIE_UNTIL m/s and beyond.
const WHEELIE = 0.19;
const LIFT = 0.03;
const WHEELIE_UNTIL = 18;
// The body on its springs, about its middle at the axles' height: squatting SQUAT radians nose up while speeding up
// fully, diving while braking, springing back (STIFF per s², damped by DAMP per s).
const SQUAT = 0.07;
const STIFF = 120;
const DAMP = 10;
// A backflip: FLIP seconds, HOP metres up at most, turning about the point PIVOT units up.
const FLIP = 0.75;
const HOP = 2.5;
const PIVOT = 1.2;
// Riding, the camera at EYE, looking at AHEAD (metres in the truck's frame), turned by its heading
// eased at FOLLOW a second, so quick steering does not swing it.
const EYE = [0, 3.6, -10.5];
const AHEAD = [0, 1.2, 8.5];
const FOLLOW = 5;
const SPEC = {
  max: 36,
  back: 8,
  accelerate: 24,
  brake: 60,
  roll: 6,
  steer: 0.8,
  grip: 250,
  spin: 0,
  react: 12,
  axles: 2 * AXLE * SIZE,
  half: 4 * SIZE,
  width: (2 * TRACK + TREAD) * SIZE,
};
// The body's paint, drawn on a canvas 1024 px wide, K px a unit, from the back end Z0 to Z1
// (units from the middle): the side at +x and the side at -x, each up to HIGH units, the view
// from above, SPAN units to either side, then the front, as wide and as high.
const K = 128;
const Z0 = -4.4;
const Z1 = 3.6;
const HIGH = 2.625;
const SPAN = 1.71875;
const ROWS = HIGH * K;
const HEIGHT = 3 * ROWS + 2 * SPAN * K;
// The canvas pixel of the point z units from the middle and a units up (the sides, bands 0 and 1,
// each with the front to the left as one sees it) or across (from above, band 2); of the point x
// units across and a units up (the front, band 3).
const pixel = (band, z, a) =>
  band === 3
    ? [(z + SPAN) * K, 2 * ROWS + 2 * SPAN * K + (HIGH - a) * K]
    : band === 2
      ? [(Z1 - z) * K, 2 * ROWS + (SPAN - a) * K]
      : [(band ? z - Z0 : Z1 - z) * K, band * ROWS + (HIGH - a) * K];

// One XRT per place ({ x, y, z, heading }), each { group, material, update, look (sets the
// camera riding it), half, width }; they
// share their geometries and all materials but their own (so one is highlighted alone).
// boost(position): how much larger to draw one far away; world: as for createDriving
// (src/drive.js).
export function createXrts(places, boost, world) {
  const GREEN = "#46cf2b";
  const BLUE = "#1f4fe0";
  const SLASH = "#26292e";
  const SMOKED = "#121820";
  const PLATE = "#141518";
  const BLACK = 0x1a1b1e;
  const DARK = 0x2c2e33;
  const SPRING = 0x3fcf2a;
  const METAL = 0x9ea4ac;
  const TYRE = 0x18191b;
  const box = ([w, h, d], color, p, angle = 0) =>
    part(new THREE.BoxGeometry(w, h, d).rotateX(angle), color, p);
  // A round bar r thick from a to b ([x, y, z]).
  const rod = (a, b, r, color) => {
    const way = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    return part(
      new THREE.CylinderGeometry(r, r, way.length(), 6).applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), way.normalize()),
      ),
      color,
      a.map((v, k) => (v + b[k]) / 2),
    );
  };
  // A shock from its foot a to its top b: a metal body in a green coil spring.
  const shock = (a, b) => {
    const from = new THREE.Vector3(...a);
    const way = new THREE.Vector3(...b).sub(from);
    const turn = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      way.clone().normalize(),
    );
    return [
      rod(a, b, 0.06, METAL),
      ...Array.from({ length: 7 }, (_, k) =>
        part(
          new THREE.TorusGeometry(0.13, 0.03, 4, 8).applyQuaternion(turn),
          SPRING,
          from
            .clone()
            .addScaledVector(way, 0.08 + 0.09 * k)
            .toArray(),
        ),
      ),
    ];
  };
  const sides = [-1, 1];

  // The body, its cab and the wing, painted (paint below).
  const shell = mergeGeometries([
    part(
      profile(
        [
          [3.35, 0.8],
          [3.45, 1.3],
          [3.25, 1.45],
          [1.9, 1.55],
          [-1.4, 1.55],
          [-2.3, 1.42],
          [-2.35, 0.8],
        ],
        2.9,
      ),
      0xffffff,
      [0, 0, 0],
    ),
    part(
      profile(
        [
          [2.0, 1.5],
          [0.62, 2.25],
          [-0.5, 2.3],
          [-1.15, 1.95],
          [-1.6, 1.5],
        ],
        2.1,
      ),
      0xffffff,
      [0, 0, 0],
    ),
    box([3.3, 0.06, 1.1], 0xffffff, [0, 2.45, -3.35], 0.15), // rear up
    ...sides.map((x) => box([0.05, 0.9, 1.25], 0xffffff, [x * 1.66, 2.15, -3.35])),
  ]);
  // Each triangle's corners where the paint shows it: from the side or the front it faces, else
  // from above; facing down or in (the wing's side plates' inner faces), all black.
  const position = shell.attributes.position;
  const uv = new Float32Array(position.count * 2);
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const black = pixel(2, Z0, 0);
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1).sub(a);
    c.fromBufferAttribute(position, i + 2).sub(a);
    const middle = a.x + (b.x + c.x) / 3;
    const n = b.cross(c).normalize();
    const band =
      n.y < -0.5 || n.x * middle < -0.1
        ? -1
        : Math.abs(n.x) > 0.5
          ? n.x > 0
            ? 0
            : 1
          : n.z > Math.abs(n.y)
            ? 3
            : 2;
    for (let j = i; j < i + 3; j++) {
      a.fromBufferAttribute(position, j);
      const [px, py] =
        band < 0
          ? black
          : band === 3
            ? pixel(3, a.x, a.y)
            : pixel(band, a.z, band === 2 ? a.x : a.y);
      uv.set([px / 1024, 1 - py / HEIGHT], 2 * j);
    }
  }
  shell.setAttribute("uv", new THREE.BufferAttribute(uv, 2));

  // The paint, drawn here, so nothing is loaded.
  const canvas = Object.assign(document.createElement("canvas"), { width: 1024, height: HEIGHT });
  const brush = canvas.getContext("2d");
  brush.textAlign = "center";
  brush.textBaseline = "middle";
  brush.lineJoin = "round";
  let band; // the one drawn on
  const fill = (color, points) => {
    brush.fillStyle = color;
    brush.beginPath();
    for (const [z, a] of points) brush.lineTo(...pixel(band, z, a));
    brush.fill();
  };
  const rect = (color, z0, z1, a0, a1) =>
    fill(color, [
      [z0, a0],
      [z1, a0],
      [z1, a1],
      [z0, a1],
    ]);
  const line = (color, width, points) => {
    brush.strokeStyle = color;
    brush.lineWidth = width * K;
    brush.beginPath();
    for (const [z, a] of points) brush.lineTo(...pixel(band, z, a));
    brush.stroke();
  };
  // Text size units high, squeezed into length units, its middle at z, a, its right and its down
  // going along axes ([x, y, x, y]) on the canvas.
  const text = (words, color, z, a, size, length, edge, axes = [1, 0, 0, 1]) => {
    brush.save();
    brush.translate(...pixel(band, z, a));
    brush.transform(...axes, 0, 0);
    brush.font = `italic 900 ${size * K}px sans-serif`;
    if (edge) {
      brush.strokeStyle = edge;
      brush.lineWidth = 0.05 * K;
      brush.strokeText(words, 0, 0, length * K);
    }
    brush.fillStyle = color;
    brush.fillText(words, 0, 0, length * K);
    brush.restore();
  };
  for (band of [0, 1]) {
    rect(GREEN, Z0, Z1, 0, HIGH);
    // Dark grey low along the side, a blue sweep over it, slashes leaning back, a light blue line.
    fill(SLASH, [
      [Z1, 0.75],
      [Z1, 1.05],
      [2.2, 1.08],
      [0.4, 1.22],
      [-1.2, 1.3],
      [-2.4, 1.25],
      [-2.4, 0.75],
    ]);
    fill(BLUE, [
      [3.5, 1.12],
      [3.0, 1.3],
      [1.5, 1.52],
      [0, 1.7],
      [-1.5, 1.62],
      [-2.4, 1.5],
      [-2.4, 1.36],
      [-1.3, 1.42],
      [0.2, 1.44],
      [1.6, 1.3],
      [3.2, 1.12],
    ]);
    for (let k = 0; k < 4; k++) {
      const z = 1.2 - 0.55 * k;
      fill(SLASH, [
        [z, 1.2],
        [z + 0.16, 1.2],
        [z - 0.32, 1.85],
        [z - 0.48, 1.85],
      ]);
      fill(BLUE, [
        [z + 0.22, 1.2],
        [z + 0.28, 1.2],
        [z - 0.2, 1.85],
        [z - 0.26, 1.85],
      ]);
    }
    line("#9fd8ff", 0.03, [
      [3.4, 1.18],
      [1.5, 1.4],
      [-0.2, 1.56],
      [-2.4, 1.46],
    ]);
    // The side window, edged dark; the roof's black skid along the top.
    fill(SMOKED, [
      [1.45, 1.68],
      [0.62, 2.14],
      [-0.45, 2.2],
      [-0.95, 1.93],
      [-0.75, 1.68],
    ]);
    line(SLASH, 0.06, [
      [1.45, 1.68],
      [0.62, 2.14],
      [-0.45, 2.2],
      [-0.95, 1.93],
      [-0.75, 1.68],
      [1.45, 1.68],
    ]);
    rect(SLASH, -0.6, 0.7, 2.22, 2.4);
    text("XRT", "#fff", -0.8, 1.1, 0.3, 0.75, "#c4161c");
    fill(BLUE, [
      [-1.45, 1.66],
      [-2.35, 1.58],
      [-2.35, 1.42],
      [-1.45, 1.5],
    ]);
    text("TRAXXAS", "#fff", -1.9, 1.54, 0.11, 0.7);
    // The wing's side plate, its number 1 in a white frame.
    rect(PLATE, -4, -2.7, 1.6, 2.65);
    line("#fff", 0.04, [
      [-3.75, 1.95],
      [-2.95, 1.95],
      [-2.95, 2.5],
      [-3.75, 2.5],
      [-3.75, 1.95],
    ]);
    text("1", "#fff", -3.35, 2.22, 0.45, 0.5);
  }
  band = 2;
  rect(GREEN, Z0, Z1, -SPAN, SPAN);
  for (const x of sides) {
    // On the bonnet blue and dark grey stripes, on the back deck dark grey and blue ones.
    fill(BLUE, [
      [3.5, x * 0.35],
      [3.5, x * 0.6],
      [1.9, x * 1.25],
      [1.9, x * 1.0],
    ]);
    fill(SLASH, [
      [3.5, x * 1.0],
      [3.5, x * 1.5],
      [1.9, x * 1.5],
      [1.9, x * 1.32],
    ]);
    fill(SLASH, [
      [-1.15, x * 0.2],
      [-1.15, x * 0.6],
      [-2.4, x * 1.4],
      [-2.4, x * 1.0],
    ]);
    fill(BLUE, [
      [-1.15, x * 0.65],
      [-1.15, x * 0.8],
      [-2.4, x * 1.6],
      [-2.4, x * 1.45],
    ]);
    rect(SLASH, -0.6, 0.65, x * 0.85, x * 1.1); // the roof's skids
  }
  rect(SLASH, 2.1, 2.9, -0.32, 0.32); // the bonnet's air duct
  fill(SMOKED, [
    [1.95, -1.0],
    [1.95, 1.0],
    [0.65, 0.95],
    [0.65, -0.95],
  ]); // the windscreen
  rect(BLUE, 0.62, -0.5, -0.18, 0.18);
  rect(SMOKED, -1.15, -0.5, -0.9, 0.9); // the back window
  rect(SLASH, -2.45, -2.25, -SPAN, SPAN); // the tail
  rect(PLATE, Z0, -2.7, -SPAN, SPAN); // the wing
  // TRAXXAS on it, read from the cab: its right to +x, its foot to the front.
  text("TRAXXAS", "#fff", -3.35, 0, 0.5, 2.7, null, [0, -1, -1, 0]);
  // The front: two dark grilles, ribbed, the green bar between them, dark corners with the
  // headlights over them; the wing above.
  band = 3;
  rect(GREEN, -SPAN, SPAN, 0, HIGH);
  rect(SLASH, -0.58, 0.58, 1.12, 1.28);
  rect(SLASH, -0.95, 0.95, 0.82, 1.0);
  for (let y = 0.85; y < 1.27; y += 0.04)
    if (y < 1 || y > 1.12)
      line("#3a3e45", 0.012, [
        [-0.93, y],
        [0.93, y],
      ]);
  for (const x of sides) {
    fill(SLASH, [
      [x * 1.0, 0.8],
      [x * 1.45, 0.8],
      [x * 1.45, 1.3],
      [x * 1.15, 1.3],
    ]);
    fill("#e9eef2", [
      [x * 0.62, 1.17],
      [x * 1.12, 1.2],
      [x * 1.2, 1.28],
      [x * 0.66, 1.26],
    ]);
  }
  rect(PLATE, -SPAN, SPAN, 1.6, HIGH);
  const paint = new THREE.CanvasTexture(canvas);
  paint.colorSpace = THREE.SRGBColorSpace;
  paint.anisotropy = 8; // sharp when seen at a slant
  const shellMaterial = new THREE.MeshLambertMaterial({ map: paint, flatShading: true });

  // The chassis and all on it.
  const chassis = mergeGeometries([
    box([1.3, 0.12, 6.2], BLACK, [0, 0.55, 0.2]),
    box([2.7, 0.22, 4.9], BLACK, [0, 0.71, 0.85]), // under the body
    ...[-1, 1].map((end) => box([0.7, 0.45, 0.55], DARK, [0, 0.9, end * AXLE])), // differentials
    // The front bumper, its ring, uprights and skid plate.
    box([2.8, 0.24, 0.3], BLACK, [0, 0.62, 3.62]),
    part(new THREE.TorusGeometry(0.3, 0.05, 4, 12).scale(1.8, 1, 1), BLACK, [0, 0.95, 3.5]),
    box([1.6, 0.06, 1.0], DARK, [0, 0.5, 3.2], -0.25),
    box([1.7, 0.12, 0.14], BLACK, [0, 1.75, -2.15]), // the back shock tower
    rod([-0.68, 2.37, -2.3], [0.68, 2.37, -2.3], 0.05, BLACK), // the cage's crossbar
    rod([-0.6, 0.8, -4.2], [0.6, 0.8, -4.2], 0.04, METAL), // the wheelie bar's axle
    ...sides.flatMap((x) => [
      rod([x * 0.5, 0.7, 3.55], [x * 0.35, 1.15, 3.0], 0.05, BLACK), // bumper upright
      // A nerf bar.
      rod([x * 1.6, 0.62, 1.6], [x * 1.6, 0.62, -1.6], 0.07, BLACK),
      rod([x * 1.6, 0.62, 1.6], [x * 0.6, 0.58, 1.9], 0.05, BLACK),
      rod([x * 1.6, 0.62, -1.6], [x * 0.6, 0.58, -1.9], 0.05, BLACK),
      // The wing's mount and brace, the cage from the roof to it, a skid on the roof.
      rod([x * 0.45, 0.7, -2.7], [x * 0.55, 2.42, -3.15], 0.07, BLACK),
      rod([x * 0.45, 1.75, -2.15], [x * 0.55, 2.2, -3.0], 0.05, BLACK),
      rod([x * 0.9, 2.3, -0.45], [x * 0.62, 2.4, -2.95], 0.06, BLACK),
      rod([x * 1.35, 1.5, -1.7], [x * 0.75, 2.36, -2.1], 0.05, BLACK),
      box([0.12, 0.08, 1.2], BLACK, [x * 0.98, 2.31, 0.05]),
      // The wheelie bar and its wheel, a green nut on it.
      rod([x * 0.35, 0.6, -2.7], [x * 0.45, 0.8, -4.2], 0.06, BLACK),
      part(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 12).rotateZ(Math.PI / 2), TYRE, [
        x * 0.6,
        0.8,
        -4.2,
      ]),
      part(new THREE.CylinderGeometry(0.09, 0.09, 0.18, 6).rotateZ(Math.PI / 2), SPRING, [
        x * 0.6,
        0.8,
        -4.2,
      ]),
    ]),
  ]);
  // At each wheel, in the wheels' order (createOne), the A-arm, camber link, axle carrier, drive
  // shaft and shock, about the axle carrier's middle, HUB units out (they swing about it as the
  // body squats; their inner ends are REACH units nearer the middle).
  const HUB = 1.86;
  const REACH = 1.31;
  const corners = [1, -1].flatMap((end) =>
    sides.map((x) => {
      const z = end * AXLE;
      return mergeGeometries([
        rod([x * 0.55, 0.62, z - 0.35], [x * 1.85, 0.8, z], 0.06, BLACK),
        rod([x * 0.55, 0.62, z + 0.35], [x * 1.85, 0.8, z], 0.06, BLACK),
        rod([x * 0.6, 1.2, z], [x * 1.85, 1.15, z], 0.04, BLACK),
        box([0.2, 0.6, 0.32], BLACK, [x * HUB, WHEEL, z]),
        rod([x * 0.3, WHEEL, z], [x * HUB, WHEEL, z], 0.045, METAL),
        ...shock([x * 1.5, 0.75, z], [x * 0.75, end > 0 ? 1.45 : 1.75, z + end * 0.25]),
      ]).translate(-x * HUB, -WHEEL, -z);
    }),
  );

  // A tyre, its axis along x: two rows of dark grey blocks round it, staggered, to show it turn;
  // on its outer side (out: -1 or 1) the gunmetal wheel: a lighter beadlock ring with bolts, a ring
  // of round holes, the hub with its bolts, the green nut; on its inner side the wheel's dark back
  // in the beadlock ring with its bolts.
  const flank = (g, color, x) =>
    part(g.rotateY((x * Math.PI) / 2), color, [(x * (TREAD + 0.04)) / 2, 0, 0]);
  // n dots r wide in a ring that far from the axle, out from the wheel's face.
  const around = (n, far, r, out, color, x) =>
    Array.from({ length: n }, (_, k) =>
      flank(
        new THREE.CircleGeometry(r, 8).translate(
          far * Math.cos((k * 2 * Math.PI) / n),
          far * Math.sin((k * 2 * Math.PI) / n),
          out,
        ),
        color,
        x,
      ),
    );
  const tyres = sides.map((out) =>
    mergeGeometries([
      part(
        new THREE.CylinderGeometry(WHEEL - 0.09, WHEEL - 0.09, TREAD, 24).rotateZ(Math.PI / 2),
        TYRE,
        [0, 0, 0],
      ),
      ...sides.flatMap((row) =>
        Array.from({ length: LUGS }, (_, k) =>
          part(
            new THREE.BoxGeometry(TREAD * 0.44, 0.1, 0.24)
              .translate(0, WHEEL - 0.05, 0)
              .rotateX(((k + (row > 0 ? 0.5 : 0)) * 2 * Math.PI) / LUGS),
            0x4a4e54,
            [row * TREAD * 0.25, 0, 0],
          ),
        ),
      ),
      flank(new THREE.CircleGeometry(RIM, 24), 0x484b50, out),
      flank(new THREE.RingGeometry(RIM - 0.08, RIM, 24).translate(0, 0, 0.015), 0x5b5f65, out),
      flank(new THREE.CircleGeometry(0.22, 12).translate(0, 0, 0.04), 0x3c3f44, out), // the hub
      ...around(16, RIM - 0.04, 0.022, 0.025, 0xa8aeb6, out), // the beadlock ring's bolts
      ...around(12, 0.36, 0.085, 0.015, 0x0b0c0d, out), // holes
      ...around(6, 0.16, 0.025, 0.045, 0xa8aeb6, out), // the hub's bolts
      part(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 6).rotateZ(Math.PI / 2), SPRING, [
        out * (TREAD / 2 - 0.02),
        0,
        0,
      ]),
      flank(new THREE.CircleGeometry(RIM, 24), 0x1d1e21, -out),
      flank(new THREE.RingGeometry(RIM - 0.08, RIM, 24).translate(0, 0, 0.015), 0x5b5f65, -out),
      ...around(16, RIM - 0.04, 0.022, 0.025, 0xa8aeb6, -out),
    ]),
  );
  return places.map(createOne);

  function createOne(place) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // group follows the ground (and the camera it), model rolls and rises in it.
    const group = new THREE.Group();
    group.rotation.order = "YXZ"; // heading first, then pitch
    const model = new THREE.Group();
    model.scale.setScalar(SIZE);
    const body = new THREE.Group(); // on the wheels' springs
    body.add(new THREE.Mesh(chassis, material), new THREE.Mesh(shell, shellMaterial));
    model.add(body);
    group.add(model);
    // Front left, front right, back left, back right; each with its corner (corners).
    const wheels = [1, -1].flatMap((end) =>
      sides.map((x) => {
        const wheel = new THREE.Mesh(tyres[x > 0 ? 1 : 0], material);
        wheel.position.set(x * TRACK, WHEEL, end * AXLE);
        wheel.rotation.order = "YXZ"; // steered, then turning
        model.add(wheel);
        return wheel;
      }),
    );
    const suspension = corners.map((geometry, k) => {
      const corner = new THREE.Mesh(geometry, material);
      corner.position.set((k % 2 ? 1 : -1) * HUB, WHEEL, (k < 2 ? 1 : -1) * AXLE);
      model.add(corner);
      return corner;
    });
    const driving = createDriving(place, SPEC, world);
    const s = driving.state;
    let lift = 0; // radians the front is up
    let squat = 0; // radians the body is nose up on its springs
    let swing = 0; // radians a second it turns so
    let speed = 0; // s.speed at the last frame
    let rolled = 0; // s.rolled at the last frame
    let flip = -1; // seconds into a backflip, or -1
    let fired = false; // input.fire at the last frame
    let seen = s.heading; // the camera's heading
    const ahead = new THREE.Vector3();

    // Driven by input (createDriving), else in its place, level; each press of input.fire (Space or
    // the Flip button) starts a backflip.
    function update(seconds, dt, input) {
      driving.step(dt, input);
      // Rolling out of the turn as far as it steers; positive to the right.
      model.rotation.z = s.turn * ROLL * Math.min(1, Math.max(0, s.speed) / FIRM);
      // Speeding up, the front rises about where the back wheels stand, most from a standstill;
      // pressing the gas again while slow, it rises again.
      const rising = input?.climb > 0 && s.speed >= 0 && s.speed < SPEC.max;
      const rise = THREE.MathUtils.lerp(WHEELIE, LIFT, Math.min(1, s.speed / WHEELIE_UNTIL));
      const target = rising ? rise : 0;
      lift = input ? lift + (target - lift) * Math.min(1, dt * (target > lift ? 14 : 6)) : 0;
      model.rotation.x = -lift;
      model.position.set(0, Math.sin(lift) * AXLE * SIZE, (Math.cos(lift) - 1) * AXLE * SIZE);
      // The body squats as hard as it speeds up, dives as it brakes (at most 0.6 SQUAT).
      const push = dt && input ? (s.speed - speed) / dt / SPEC.accelerate : 0;
      speed = s.speed;
      swing += (STIFF * (SQUAT * THREE.MathUtils.clamp(push, -0.6, 1) - squat) - DAMP * swing) * dt;
      squat += swing * dt;
      if (input?.fire && !fired && flip < 0) flip = 0;
      fired = !!input?.fire;
      flip = input && flip >= 0 && flip + dt < FLIP ? flip + dt : -1;
      if (flip >= 0) {
        // Up and round, nose first, about the pivot.
        const t = flip / FLIP;
        const turn = 2 * Math.PI * t * t * (3 - 2 * t);
        const c = PIVOT * SIZE;
        lift = squat = swing = 0;
        model.rotation.x = -turn;
        model.position.set(0, c - c * Math.cos(turn) + 4 * HOP * t * (1 - t), c * Math.sin(turn));
      }
      // Turned nose up about its middle at the axles' height; each corner swings about its axle
      // carrier so its inner end follows the body there.
      body.rotation.x = -squat;
      body.position.set(0, WHEEL * (1 - Math.cos(squat)), WHEEL * Math.sin(squat));
      suspension.forEach((corner, k) => {
        const up = (k < 2 ? AXLE : -AXLE) * Math.sin(squat);
        corner.rotation.z = (k % 2 ? -1 : 1) * Math.asin(up / REACH);
      });
      const d = s.heading - seen;
      seen = input
        ? seen + Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * FOLLOW)
        : s.heading;
      group.position.set(s.x, s.y, s.z);
      group.rotation.set(s.pitch, s.heading, 0);
      group.scale.setScalar(boost(group.position));
      wheels.forEach((wheel, k) => {
        wheel.rotation.x += THREE.MathUtils.clamp(
          (s.rolled - rolled) / (WHEEL * SIZE),
          -SPIN,
          SPIN,
        );
        if (k < 2) wheel.rotation.y = s.steer;
      });
      rolled = s.rolled;
    }
    update(0, 0, null); // in place before the first frame

    // The camera behind and above, turned by seen.
    function look(view) {
      const [sin, cos, k] = [Math.sin(seen), Math.cos(seen), group.scale.x];
      const at = ([x, y, z], out) =>
        out
          .set(x * cos + z * sin, y, z * cos - x * sin)
          .multiplyScalar(k)
          .add(group.position);
      at(EYE, view.position);
      view.lookAt(at(AHEAD, ahead));
    }

    return { group, material, update, look, half: SPEC.half, width: SPEC.width };
  }
}
