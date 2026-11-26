// A DCB M41 Widebody racing catamaran in Traxxas' green, a quarter larger than life (fifteen times
// the model's 1030 × 267 × 151 mm): two sponsons with V bottoms (14.5°) and pointed bows under one
// deck, the tunnel between them open at the bow; green below, above sharp shards of lime, green,
// blue, cyan, white and black, M41 WIDEBODY on the foredeck, TRAXXAS large on each side's edge,
// cut away at 45° by the stern, a white rear deck with two vents, a grab handle and the DCB badge;
// a smoked wraparound windscreen over the cockpit's low dash and black wheel, low dark grey seats
// with blue and white backs on its grey floor, a woman in a bikini at the wheel (shown as
// src/main.js says), three more on the rear deck, one raising champagne in each hand, two dancing;
// at the stern a blue strut, a blue rudder turning as one steers, steel trim tabs and turn fins.
// Driven as in src/drive.js on the water only, very fast: it rises and lifts its bow as it planes,
// banks into turns; moving, it throws a rooster tail of spray up behind it and sheets of it out of
// its sides, and draws a wake (src/boats.js).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part } from "./parts.js";
import { createDriving } from "./drive.js";
import { createWake } from "./boats.js";
import {
  CHEER,
  HAND_Y,
  PIVOTS,
  STEER,
  SWAY,
  TWIST,
  UP_ARM,
  createCrowd,
  peopleTime,
  turnArm,
} from "./people.js";
import { lettering } from "./xrt.js";

// Built in metres of the real boat (twelve times the model), drawn SIZE times that: the transom
// and the bow tips (z), the outer side (x), the tunnel's roof (y, the waterline at 0); the
// sponsons' half width, keel and deck along z.
const SIZE = 1.25;
const STERN = -6.2;
const BOW = 6.2;
const BEAM = 1.6;
const ROOF = 0.35;
const DEADRISE = Math.tan((14.5 * Math.PI) / 180);
const half = (z) => (z <= 2 ? 0.5 : Math.max(0.05, 0.5 * Math.sqrt(1 - ((z - 2) / 4.25) ** 2)));
const keel = (z) => (z <= 2 ? -0.35 : -0.35 + 0.65 * ((z - 2) / 4.2) ** 2);
const deck = (z) => (z <= 2.5 ? 0.95 : 0.95 - 0.2 * ((z - 2.5) / 3.7) ** 2);
// The sides' upper edge cut away at 45°, CUT metres down and in, from the stern to CUT_TO, there
// narrowing to nothing at CUT_END.
const CUT = 0.4;
const CUT_TO = -3;
const CUT_END = -2.4;
const cut = (z) => CUT * THREE.MathUtils.clamp((CUT_END - z) / (CUT_END - CUT_TO), 0, 1);
const STATIONS = [-6.2, CUT_TO, CUT_END, -2, 1, 2, 2.8, 3.6, 4.3, 4.9, 5.4, 5.8, 6.05, 6.2];
// The deck between the sponsons up to NOSE, crowned CROWN metres in the middle ahead of the
// windscreen.
const NOSE = 4.6;
const CROWN = 0.14;
// The windscreen: half a cone round SCREEN (z), RIM across at its top, FOOT at its foot, DEEP
// times that along; the white deck round its foot RIM_WHITE wider.
const SCREEN = -0.5;
const RIM = 1.0;
const FOOT = 1.18;
const DEEP = 0.8;
const RIM_WHITE = 0.06;
const SPEC = {
  max: 90,
  back: 6,
  accelerate: 30,
  brake: 45,
  roll: 4,
  steer: 0.6,
  grip: 2000,
  spin: 0.1,
  react: 4,
  axles: 8 * SIZE,
  half: BOW * SIZE,
  width: 2 * BEAM * SIZE,
};
// Planing: from PLANE m/s on, RISE metres higher and its bow BOW_UP radians up; banking BANK
// radians into a turn at most, from FIRM m/s on; at rest rocking.
const PLANE = 25;
const RISE = 0.3;
const BOW_UP = 0.05;
const BANK = 0.12;
const FIRM = 20;
// The driver's place on the starboard seat (x, z), her hips HIPS over the deck, her legs down in
// the cockpit; the wheel where her hands' ends are as src/people.js steers (the arms STEER[0]
// ahead, then opened STEER[1] about shoulders 0.2 m out; a bikini figure's arms 0.205 m out): its
// middle (x, y over the deck, z) and radius.
const DRIVER = [-0.5, -0.85];
const HIPS = 0.1;
const [WHEEL, WHEEL_RADIUS] = (() => {
  const [y, z] = turnArm(-STEER[0], HAND_Y);
  const [off, open] = [0.005, STEER[1]];
  const out = 0.2 + off * Math.cos(open) + z * Math.sin(open);
  const ahead = z * Math.cos(open) - off * Math.sin(open);
  return [[DRIVER[0], HIPS + (y - PIVOTS[0]) / SIZE, DRIVER[1] + ahead / SIZE], out / SIZE];
})();
// On the rear deck, facing aft (x, z): one raising a bottle of champagne in each hand over her
// head, where the hatch's seams cross, the others dancing, each turned out by TWIST, so she twists
// from facing aft out to her side and back.
const DANCERS = [
  [0, -5.6],
  [-0.9, -4.5],
  [0.9, -4.5],
];
// Her arms raised as src/people.js cheers (UP_ARM ahead, then opened CHEER[0] about shoulders
// 0.2 m out; a bikini figure's arms 0.205 m out): their ends HAND metres up, ahead and out of her
// feet; each bottle upright, from GRIP metres over an arm's end (clear of the arm, so no face of
// it lies on one of the arm's).
const HAND = (() => {
  const [y, ahead] = turnArm(-UP_ARM, HAND_Y);
  const [up, off, open] = [y - PIVOTS[1], 0.005, CHEER[0]];
  return [
    PIVOTS[1] + up * Math.cos(open) - off * Math.sin(open),
    ahead,
    0.2 + up * Math.sin(open) + off * Math.cos(open),
  ].map((m) => m / SIZE);
})();
const GRIP = 0.035;
// The rudder turns about its front edge (HINGE: x, z) RUDDER radians at most, as one steers.
const HINGE = [-1.45, -6.375];
const RUDDER = 0.5;
// The spray: at most DROPS in the air, RATE a second at full strength (from STRONG m/s on, none
// below SLOW), a share TAIL of them the rooster tail thrown up behind the strut, at most
// TAIL_UP[0] + TAIL_UP[1] metres a second at full strength (about 4 m high, under the camera
// riding it), fanning out at most TAIL_OUT metres a second to either side, from up to TAIL_WIDE
// metres beside the middle; the rest sheets out of the sides; slowed by DRAG a second in the air.
const DROPS = 1500;
const RATE = 900;
const STRONG = 40;
const SLOW = 4;
const TAIL = 0.7;
const TAIL_UP = [3, 6];
const TAIL_OUT = 4;
const TAIL_WIDE = 0.6;
const DRAG = 0.8;
const GRAVITY = 9.81;

// The paint, drawn on a canvas K px a metre, from the stern Z0 to the bow Z1: the side at +x and
// the side at -x, each from LOW to HIGH (y), the view from above, SPAN to either side, then the
// stern, as wide and as high; right of it, green (below and in the tunnel).
const K = 100;
const Z0 = -6.4;
const Z1 = 6.4;
const LOW = -0.6;
const HIGH = 1.0;
const SPAN = 1.65;
const ROWS = Math.round((HIGH - LOW) * K);
const WIDTH = Math.round((Z1 - Z0) * K);
const HEIGHT = 2 * ROWS + Math.round(2 * SPAN * K) + ROWS;
// The canvas pixel of the point at z (or x, the stern) and a, its y (or x, from above): each side
// seen from that side, the bow to the left; from above, the bow to the left, -x up; the stern
// from behind.
const pixel = (band, u, a) =>
  band === 3
    ? [(SPAN - u) * K, 2 * ROWS + 2 * SPAN * K + (HIGH - a) * K]
    : band === 2
      ? [(Z1 - u) * K, 2 * ROWS + (a + SPAN) * K]
      : [(band ? u - Z0 : Z1 - u) * K, band * ROWS + (HIGH - a) * K];
const GREEN_PIXEL = [WIDTH - 40, HEIGHT - 40];

// A closed body through sections ({ z, ring: [x, y] points counter-clockwise seen from the bow }),
// z rising, its ends capped.
function loft(sections) {
  const out = [];
  const at = (s, i) => [...s.ring[i % s.ring.length], s.z];
  sections.slice(1).forEach((b, k) => {
    const a = sections[k];
    for (let i = 0; i < a.ring.length; i++)
      out.push(at(a, i), at(a, i + 1), at(b, i + 1), at(a, i), at(b, i + 1), at(b, i));
  });
  for (const [s, flip] of [
    [sections[0], true],
    [sections.at(-1), false],
  ])
    for (let i = 1; i < s.ring.length - 1; i++)
      out.push(at(s, 0), ...(flip ? [at(s, i + 1), at(s, i)] : [at(s, i), at(s, i + 1)]));
  return new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(out.flat(), 3),
  );
}

// One M41 per place ({ x, y, z, heading, driver and deck: a look and one per DANCERS as
// src/people.js dresses them }), each { group, spray (in the scene, apart), material, update, half,
// width, driver (her mesh, hidden; src/main.js shows it) }; they share their geometries and all
// materials but their own (so one is highlighted alone). boost(position): how much larger to draw
// one far away; world: as for createDriving (src/drive.js).
export function createM41s(places, boost, world) {
  const GREEN = "#2fd33a";
  const PALETTE = [
    ["#b4f22a", 5],
    ["#3cc83c", 4],
    ["#0f7a35", 2],
    ["#2238c8", 3],
    ["#2a8fe6", 3],
    ["#33c6f0", 2],
    ["#f4f7f5", 3],
    ["#1b1e22", 3],
  ];
  const INK = "#1b1e22";
  const WHITE = "#f4f7f5";
  const RED = "#c4161c"; // as the XRT's edging
  const sides = [-1, 1];

  // The hull: each sponson round the outer side, the keel and the inner side, its top the deck
  // (the cut between the side and the deck, where there is none, a seam of no width);
  // the deck between them over the tunnel, rising to its nose.
  const sponson = (side) =>
    loft(
      STATIONS.map((z) => {
        const [w, k, d, c] = [half(z), keel(z), deck(z), cut(z)];
        const inner = BEAM - 2 * w;
        const chine = k + w * DEADRISE;
        const ring = [
          [BEAM - w, k],
          [BEAM, chine],
          [BEAM, d - c],
          [BEAM - c, d],
          [inner, d],
          [inner, chine],
        ].map(([x, y]) => [side * x, y]);
        return { z, ring: side > 0 ? ring : ring.reverse() };
      }),
    );
  const crown = (z) => CROWN * THREE.MathUtils.clamp(z - 0.5, 0, 1);
  const middle = loft(
    [
      [STERN, ROOF, 0],
      [0.5, ROOF, 0],
      [2.5, ROOF, 0],
      [4, ROOF, 0],
      [4.4, ROOF + 0.1, -0.08],
      [NOSE, ROOF + 0.25, -0.2],
    ].map(([z, roof, lower]) => {
      const w = BEAM - 2 * half(z) + 0.02; // into the sponsons
      const top = deck(z) + lower;
      return {
        z,
        ring: [
          [-w, roof],
          [w, roof],
          [w, top],
          [0, top + crown(z) * (lower ? 0.5 : 1)],
          [-w, top],
        ],
      };
    }),
  );
  const shell = mergeGeometries([sponson(-1), sponson(1), middle]);

  // Each triangle's corners where the paint shows it: from the side or the stern it faces, else
  // from above; facing down or into the tunnel, green.
  const position = shell.attributes.position;
  const uv = new Float32Array(position.count * 2);
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1).sub(a);
    c.fromBufferAttribute(position, i + 2).sub(a);
    const mid = a.x + (b.x + c.x) / 3;
    const n = b.cross(c).normalize();
    const band =
      n.y < -0.5 || (Math.abs(n.x) > 0.5 && n.x * mid < 0)
        ? -1
        : Math.abs(n.x) > 0.5
          ? n.x > 0
            ? 0
            : 1
          : n.z < -0.5
            ? 3
            : 2;
    for (let j = i; j < i + 3; j++) {
      a.fromBufferAttribute(position, j);
      const [px, py] =
        band < 0
          ? GREEN_PIXEL
          : band === 3
            ? pixel(3, a.x, a.y)
            : pixel(band, a.z, band === 2 ? a.x : a.y);
      uv.set([px / WIDTH, 1 - py / HEIGHT], 2 * j);
    }
  }
  shell.setAttribute("uv", new THREE.BufferAttribute(uv, 2));

  // The paint, drawn here, so nothing is loaded; its shards the same on every load.
  const canvas = Object.assign(document.createElement("canvas"), { width: WIDTH, height: HEIGHT });
  const brush = canvas.getContext("2d");
  brush.textAlign = "center";
  brush.textBaseline = "middle";
  brush.lineJoin = "round";
  let seed = 41;
  const random = (from = 0, to = 1) =>
    from + (to - from) * ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let band; // the one drawn on
  const trace = (points) => {
    brush.beginPath();
    for (const [u, v] of points) brush.lineTo(...pixel(band, u, v));
  };
  const fill = (color, points) => {
    brush.fillStyle = color;
    trace(points);
    brush.fill();
  };
  const rect = (color, u0, u1, a0, a1) =>
    fill(color, [
      [u0, a0],
      [u1, a0],
      [u1, a1],
      [u0, a1],
    ]);
  const line = (color, width, points) => {
    brush.strokeStyle = color;
    brush.lineWidth = width * K;
    trace(points);
    brush.stroke();
  };
  // Words size metres high, squeezed into length, their middle at u, a, turned by axes.
  const text = (words, color, u, a, size, length, edge, axes = [1, 0, 0, 1]) => {
    brush.save();
    brush.translate(...pixel(band, u, a));
    brush.transform(...axes, 0, 0);
    lettering(brush, words, color, size * K, length * K, edge);
    brush.restore();
  };
  const weights = PALETTE.reduce((sum, [, w]) => sum + w, 0);
  const pick = () => {
    let r = random(0, weights);
    return PALETTE.find(([, w]) => (r -= w) < 0)[0];
  };
  // count shards in u0 to u1, a0 to a1: long, leaning back as a grows (lean: -1 or 1 by a's
  // sign, from above, so they point ahead as arrows), fading along, some edged in black.
  const shards = (count, u0, u1, a0, a1, lean = () => 1) => {
    for (let k = 0; k < count; k++) {
      const [u, v] = [random(u0 - 1, u1), random(a0 - 0.2, a1)];
      const [length, high, slant] = [random(0.6, 2.8), random(0.1, 0.45), random(0.25, 0.8)];
      const back = slant * lean(v);
      const points = [
        [u, v],
        [u + length, v],
        [u + length - back, v + high],
        [u - back, v + high],
      ];
      const color = pick();
      const [x0, y0] = pixel(band, u, v);
      const [x1, y1] = pixel(band, u + length, v);
      const gradient = brush.createLinearGradient(x0, y0, x1, y1 + 1);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, `${color}88`);
      fill(gradient, points);
      if (random() < 0.4) line(INK, 0.025, [...points, points[0]]);
    }
  };
  const clipped = (points, draw) => {
    brush.save();
    trace(points);
    brush.clip();
    draw();
    brush.restore();
  };

  // The sides: green, above a line shards on green, at the bow a blue tip, a black and a white
  // slash behind it; TRAXXAS on the cut, squeezed as the side's view sees it at 45°; the deck's
  // edge black.
  for (band of [0, 1]) {
    rect(GREEN, Z0, Z1, LOW, HIGH);
    clipped(
      [
        [Z0, 0.3],
        [3.5, 0.35],
        [Z1, -0.1],
        [Z1, HIGH],
        [Z0, HIGH],
      ],
      () => {
        rect("#3cc83c", Z0, Z1, LOW, HIGH);
        shards(70, Z0, Z1, 0.2, HIGH);
        for (let k = 0; k < 6; k++) {
          const v = random(0.4, 0.9);
          line(random() < 0.5 ? INK : WHITE, 0.03, [
            [random(Z0, 0), v],
            [random(1, Z1), v + 0.06],
          ]);
        }
        fill(WHITE, [
          [4.5, LOW],
          [4.85, LOW],
          [4.35, HIGH],
          [4.0, HIGH],
        ]);
        fill(INK, [
          [4.85, LOW],
          [5.3, LOW],
          [4.8, HIGH],
          [4.35, HIGH],
        ]);
        fill("#2238c8", [
          [5.3, LOW],
          [Z1, LOW],
          [Z1, HIGH],
          [4.8, HIGH],
        ]);
      },
    );
    text("TRAXXAS", WHITE, -4.6, deck(-4.6) - CUT / 2, 0.5, 2.9, RED, [1, 0, 0, Math.SQRT1_2]);
    line(
      INK,
      0.05,
      STATIONS.map((z) => [z, deck(z) - 0.02]),
    );
  }

  // From above: shards pointing ahead; M41 WIDEBODY on the foredeck, a grid of dots before it; the
  // cockpit's grey floor in the white deck rounded at the windscreen's foot; the white rear deck
  // with its hatch's seams and the DCB badge, read from behind.
  band = 2;
  rect("#3cc83c", Z0, Z1, -SPAN, SPAN);
  shards(130, Z0, Z1, -SPAN, SPAN, (v) => (v < 0 ? -1 : 1));
  for (let z = 3.6; z < 4.6; z += 0.09)
    for (let x = -0.6; x <= 0.6; x += 0.09) {
      brush.fillStyle = INK;
      brush.beginPath();
      brush.arc(...pixel(band, z, x), (z - 3.5) * 0.04 * K, 0, 2 * Math.PI);
      brush.fill();
    }
  text("M41", INK, 2.2, -0.05, 0.8, 1.9, WHITE);
  text("WIDEBODY", WHITE, 2.45, 0.42, 0.16, 1.1);
  const round = FOOT + RIM_WHITE;
  fill(WHITE, [
    [-6.25, -round],
    ...Array.from({ length: 25 }, (_, k) => {
      const t = Math.PI * (k / 24 - 0.5);
      return [SCREEN + Math.cos(t) * (DEEP * FOOT + RIM_WHITE), Math.sin(t) * round];
    }),
    [-6.25, round],
  ]);
  rect("#5c626a", -2.35, -0.45, -1.02, 1.02); // the cockpit's floor
  for (const z of [-2.9, -5.6])
    line("#b8bec4", 0.015, [
      [z, -1.05],
      [z, 1.05],
    ]);
  line("#b8bec4", 0.015, [
    [-2.9, 0],
    [-5.6, 0],
  ]);
  brush.fillStyle = "#14284f";
  brush.beginPath();
  brush.arc(...pixel(band, -4.6, 0), 0.34 * K, 0, 2 * Math.PI);
  brush.fill();
  fill(WHITE, [
    [-4.6, -0.3],
    [-4.53, -0.07],
    [-4.3, 0],
    [-4.53, 0.07],
    [-4.6, 0.3],
    [-4.67, 0.07],
    [-4.9, 0],
    [-4.67, -0.07],
  ]);
  text("DCB", "#2a8fe6", -4.6, 0, 0.2, 0.5, WHITE, [0, -1, 1, 0]);

  // The stern: green, its top shards, M41 in white over the tunnel.
  band = 3;
  rect(GREEN, -SPAN, SPAN, LOW, HIGH);
  clipped(
    [
      [-SPAN, 0.45],
      [SPAN, 0.45],
      [SPAN, HIGH],
      [-SPAN, HIGH],
    ],
    () => shards(14, -SPAN, SPAN, 0.4, HIGH),
  );
  text("M41", WHITE, 0, 0.7, 0.3, 0.8, INK);
  brush.fillStyle = GREEN;
  brush.fillRect(2 * SPAN * K, 2 * ROWS + 2 * SPAN * K, WIDTH, ROWS);
  const paint = new THREE.CanvasTexture(canvas);
  paint.colorSpace = THREE.SRGBColorSpace;
  paint.anisotropy = 8; // sharp when seen at a slant
  const shellMaterial = new THREE.MeshLambertMaterial({ map: paint, flatShading: true });

  // All else, in colours of its own.
  const GLASS = 0x161b22;
  const BLACK = 0x1b1e22;
  const GREY = 0x40454c;
  const SEAT = 0x2747d8;
  const STEEL = 0xc9ced4;
  const ANODIZED = 0x1f5fd6;
  const box = ([w, h, d], color, p) => part(new THREE.BoxGeometry(w, h, d), color, p);
  const top = deck(0);
  // The windscreen: half a cone round the cockpit's front, seen from both sides, rimmed black.
  const screen = (mirror) =>
    new THREE.CylinderGeometry(RIM, FOOT, 0.5, 20, 1, true, -Math.PI / 2, Math.PI).scale(
      mirror,
      1,
      DEEP,
    );
  const seat = (x, z) => [
    box([0.5, 0.5, 0.14], GREY, [x, top - 0.05, z]),
    box([0.36, 0.16, 0.02], SEAT, [x, top + 0.1, z + 0.08]),
    ...[0.05, 0.15].map((y) => box([0.36, 0.04, 0.025], 0xf4f7f5, [x, top + y, z + 0.08])),
    box([0.5, 0.05, 0.4], GREY, [x, top + 0.02, z + 0.27]),
  ];
  const fittings = mergeGeometries([
    ...sides.map((mirror) => part(screen(mirror), GLASS, [0, top + 0.25, SCREEN])),
    part(
      new THREE.TorusGeometry(RIM, 0.035, 4, 20, Math.PI).rotateX(Math.PI / 2).scale(1, 1, DEEP),
      BLACK,
      [0, top + 0.5, SCREEN],
    ),
    box([1.9, 0.1, 0.3], 0xf4f7f5, [0, top - 0.01, -0.3]), // the dash, under the wheel
    part(new THREE.TorusGeometry(WHEEL_RADIUS, 0.025, 4, 16).rotateX(-0.4), BLACK, [
      WHEEL[0],
      top + WHEEL[1],
      WHEEL[2],
    ]),
    ...[-0.5, 0.5].flatMap((x) => seat(x, -1.0)),
    ...[-0.8, -0.27, 0.27, 0.8].flatMap((x) => seat(x, -1.95)),
    // The vents on the rear deck, the grab handle at the stern.
    ...[-0.55, 0.55].flatMap((x) => [
      box([0.28, 0.06, 0.75], STEEL, [x, top + 0.03, -3.6]),
      box([0.18, 0.02, 0.6], BLACK, [x, top + 0.065, -3.6]),
    ]),
    part(new THREE.TorusGeometry(0.2, 0.025, 4, 10, Math.PI), BLACK, [0.7, top, -5.75]),
    // The strut, the rudder's bracket, trim tabs and turn fins.
    box([0.08, 0.55, 0.45], ANODIZED, [0, 0.08, -6.4]),
    box([0.16, 0.16, 0.55], ANODIZED, [0, -0.18, -6.55]),
    box([0.25, 0.3, 0.25], ANODIZED, [-1.45, 0.7, -6.33]),
    ...sides.flatMap((x) => [
      box([0.4, 0.02, 0.3], STEEL, [x * 1.1, -0.3, -6.33]),
      box([0.02, 0.3, 0.35], STEEL, [x * (BEAM + 0.01), -0.25, -5.6]),
    ]),
  ]);
  // The rudder, from its hinge.
  const blade = box([0.03, 1.3, 0.35], ANODIZED, [0, -0.05, -0.175]);
  // The champagne in her hands, swaying with them: per hand, about its shoulder (shoulder(s): x,
  // y over the deck, z; she faces aft, so her side s is at -s x), a dark green bottle, a white
  // label, the neck in gold foil; each part metres up from the bottle's foot to its middle.
  const shoulder = (s) => [DANCERS[0][0] - (s * 0.2) / SIZE, PIVOTS[1] / SIZE, DANCERS[0][1]];
  const bottles = sides.map((s) => {
    const [x, y, z] = shoulder(s);
    return mergeGeometries(
      [
        [0.04, 0.26, 0.13, 0x0f3d1e],
        [0.048, 0.1, 0.13, 0xf4f7f5],
        [0.016, 0.12, 0.32, 0xd4af37],
      ].map(([r, high, up, color]) =>
        part(new THREE.CylinderGeometry(r, r, high, 8), color, [
          DANCERS[0][0] - s * HAND[2] - x,
          HAND[0] + GRIP + up - y,
          DANCERS[0][1] - HAND[1] - z,
        ]),
      ),
    );
  });
  return places.map(createOne);

  function createOne(place) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // group follows the water, with the wake; model rises, pitches and banks in it.
    const group = new THREE.Group();
    const model = new THREE.Group();
    model.scale.setScalar(SIZE);
    model.rotation.order = "YXZ";
    const rudder = new THREE.Mesh(blade, material);
    rudder.position.set(HINGE[0], 0, HINGE[1]);
    model.add(new THREE.Mesh(shell, shellMaterial), new THREE.Mesh(fittings, material), rudder);
    // The driver and the women on the rear deck, as tall as the people in the city (not SIZE
    // times).
    const crowd = createCrowd(place.driver.body, 1, false);
    crowd.dress(0, place.driver, "steer");
    crowd.place(0, DRIVER[0], top + HIPS - PIVOTS[0] / SIZE, DRIVER[1], 0, 0, 1 / SIZE);
    const driver = crowd.mesh;
    driver.visible = false;
    const party = createCrowd(place.deck[0].body, DANCERS.length, false);
    DANCERS.forEach(([x, z], i) => {
      party.dress(i, place.deck[i], i ? "dance" : "cheer");
      party.place(i, x, top, z, Math.PI - Math.sign(x) * TWIST, 1.3 * i, 1 / SIZE);
    });
    const held = bottles.map((geometry, k) => {
      const mesh = new THREE.Mesh(geometry, material);
      const [x, y, z] = shoulder(sides[k]);
      mesh.position.set(x, top + y, z);
      return mesh;
    });
    model.add(driver, party.mesh, ...held);
    const wake = createWake(SPEC.width);
    wake.mesh.position.z = STERN * SIZE;
    group.add(model, wake.mesh);
    // The spray: drops at x, y, z, in the air while above the water (each its own).
    const drops = new Float32Array(3 * DROPS).fill(-1e4);
    const below = new Float32Array(DROPS); // the water's y under each
    const velocities = new Float32Array(3 * DROPS);
    const spray = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(drops, 3)),
      new THREE.PointsMaterial({
        color: 0xeef7ff,
        size: 0.35, // metres
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    spray.frustumCulled = false;
    spray.visible = false;
    let [next, due, flying] = [0, 0, false];
    const driving = createDriving(place, SPEC, world);
    const s = driving.state;

    // A drop thrown from lx, ly, lz in the boat (metres, as drawn), with speed share carry along
    // its heading, out metres a second to its side (lx's) and up.
    function throwDrop(lx, ly, lz, carry, out, up) {
      const [sin, cos, k] = [Math.sin(s.heading), Math.cos(s.heading), group.scale.x * SIZE];
      const [side, ahead] = [Math.sign(lx) * out, s.speed * carry];
      drops.set(
        [
          s.x + (lx * cos + lz * sin) * k,
          s.y + ly * k + model.position.y * group.scale.x,
          s.z + (lz * cos - lx * sin) * k,
        ],
        3 * next,
      );
      velocities.set([side * cos + ahead * sin, up, ahead * cos - side * sin], 3 * next);
      below[next] = s.y;
      next = (next + 1) % DROPS;
    }

    // Driven by input (createDriving), else in its place; at rest rocking, faster planing.
    function update(seconds, dt, input) {
      // Swaying as her arms do (her phase 0), turned the other way, as she faces aft.
      const sway = SWAY[0] * Math.sin(peopleTime.value * SWAY[1]);
      for (const bottle of held) bottle.rotation.z = -sway;
      driving.step(dt, input);
      group.position.set(s.x, s.y, s.z);
      group.rotation.y = s.heading;
      group.scale.setScalar(boost(group.position));
      const speed = Math.max(0, s.speed);
      const plane = Math.min(1, speed / PLANE);
      const rest = 1 - plane;
      model.position.y = RISE * plane + 0.05 * rest * Math.sin(seconds * 1.3);
      model.rotation.x =
        -BOW_UP * plane +
        0.01 * rest * Math.sin(seconds * 0.9) -
        0.004 * plane * Math.sin(seconds * 23);
      model.rotation.z =
        -s.turn * BANK * Math.min(1, speed / FIRM) + 0.02 * rest * Math.sin(seconds * 1.1);
      rudder.rotation.y = -s.turn * RUDDER; // its back edge to the side it turns to
      wake.update(seconds, s.speed);
      // New drops, as many as its speed asks.
      const strength = speed > SLOW ? Math.min(1, speed / STRONG) : 0;
      if (!dt || (!strength && !flying)) return;
      due += RATE * strength * dt;
      for (; due >= 1; due--)
        if (Math.random() < TAIL)
          throwDrop(
            (Math.random() * 2 - 1) * TAIL_WIDE,
            -0.1,
            -7.0,
            Math.random() * 0.4 + 0.1,
            Math.random() * TAIL_OUT,
            (TAIL_UP[0] + TAIL_UP[1] * strength) * (0.3 + 0.7 * Math.random()),
          );
        else
          throwDrop(
            (Math.random() < 0.5 ? -1 : 1) * BEAM,
            0,
            Math.random() * 3.5 - 1,
            Math.random() * 0.35 + 0.5,
            (2 + 4 * Math.random()) * strength,
            (1.5 + 2.5 * Math.random()) * strength,
          );
      flying = false;
      const slow = Math.max(0, 1 - DRAG * dt);
      for (let i = 0; i < DROPS; i++) {
        const j = 3 * i;
        if (drops[j + 1] < below[i]) continue;
        velocities[j] *= slow;
        velocities[j + 2] *= slow;
        velocities[j + 1] -= GRAVITY * dt;
        drops[j] += velocities[j] * dt;
        drops[j + 1] += velocities[j + 1] * dt;
        drops[j + 2] += velocities[j + 2] * dt;
        if (drops[j + 1] < below[i]) drops[j + 1] = -1e4;
        else flying = true;
      }
      spray.geometry.attributes.position.needsUpdate = true;
      spray.visible = flying;
    }
    update(0, 0, null); // in place before the first frame

    return { group, spray, material, update, half: SPEC.half, width: SPEC.width, driver };
  }
}
