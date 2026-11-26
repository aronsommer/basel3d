// Zoo animals, low-poly and BIG times their size so they are seen well, each kind in a group
// around its place: giraffes nodding, elephants swinging their trunks, zebras grazing, rhinos
// nodding, a parade of penguins waddling round in a ring; in the water hippos opening their mouths
// wide and seals swimming round in a ring, flamingos (some on one leg) bobbing their heads beside
// the hippos and amid the seals;
// a crocodile opening its jaws slowly; wild boars and their striped piglets rooting, foxes and a
// wildcat looking round; red deer (a stag with antlers) grazing, chamois looking round; swans with
// cygnets, mallards and geese swimming round in rings, goats grazing, small monkeys hopping about
// and a lynx looking round, donkeys grazing, wolves looking round or howling, wisents (a calf among them)
// grazing. Apart from them, swans at given
// places pecking now and then (createSwans). All flee from traffic as people do (src/people.js),
// the zoo's swinging their legs as they go.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part } from "./parts.js";
import { createFlight } from "./people.js";

const BIG = 2;
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// Parts marked with how they move (stride, drawn by createZoo): a leg [way, y, z, 0] swings about
// its hip at y, z, way ±1 (the diagonal pairs together), ±3 if tucked up into its hip while the
// animal is in the water at its place; a tail [2, y, z, axis] wags sideways about its base at y,
// z, axis the radians its turning axis is tilted from straight up towards ahead.
const mark = (stride, ...parts) => parts.map((p) => ((p.userData.stride = stride), p));
// Legs w thick and h long, from y at up to their hips, x either side and (four) z ahead and
// behind, or (two, z 0) under the middle; tucked up in the water if tucked. Each reaches w / 2
// above its hip into the body, so its top stays in it as it swings.
const legs = (w, h, x, z, color, { at = 0, tucked = false } = {}) =>
  (z ? [-1, 1] : [1]).flatMap((sz) =>
    [-1, 1].flatMap((sx) =>
      mark(
        [sx * sz * (tucked ? 3 : 1), at + h, sz * z, 0],
        part(box(w, h + w / 2, w), color, [sx * x, at + (h + w / 2) / 2, sz * z]),
      ),
    ),
  );
// A tail of these parts, from its base at y, z (where it meets the body) out to its end.
const tail = ([y, z], [ey, ez], ...parts) => mark([2, y, z, Math.atan2(ey - y, z - ez)], ...parts);
// A part with its stride as an attribute, none if it does not move.
const strode = (g) =>
  g.setAttribute(
    "stride",
    new THREE.Float32BufferAttribute(
      Array.from(
        { length: g.attributes.position.count },
        () => g.userData.stride ?? [0, 0, 0, 0],
      ).flat(),
      4,
    ),
  );
const BLACK = 0x161616;
const WHITE = 0xf2f2f0;
const ORANGE = 0xf08a1c;
const PINK = 0xf28fb0;
const GIRAFFE = 0xd9a441;
const PATCH = 0x8a5a2b;
const GREY = 0x8c8c8c;
const HIPPO = 0x7d6a72;
const SEAL = 0x6b6560;
const RHINO = 0x8a8178;
const CROCODILE = 0x4a5a32;
const BOAR = 0x4a3a2e;
const FOX = 0xd2691e;
const CAT = 0x8a7a62;
const TABBY = 0x4a4030;
const DEER = 0x8b5a2b;
const CHAMOIS = 0x4a3626;
const ANTLER = 0xd8c8a8;
const MONKEY = 0x6b4a32;
const GOAT = 0xe8e2d4;
const LYNX = 0xb08a5a;
const DONKEY = 0x8a8580;
const PALE = 0xd8d0c4;
const WOLF = 0x7a7670;
const WISENT = 0x4a3324;
const SHAG = 0x33231a;
// Two eyes, w wide and high and d deep, x to each side of the middle, at y, z.
const eyes = (w, d, x, y, z, color = BLACK) =>
  [-1, 1].map((s) => part(box(w, w, d), color, [s * x, y, z]));

// The kinds, facing +z: body, what stays still; swing, what turns about x (or axis) at pivot (rest + amount ·
// sin(speed · seconds) radians); ring: metres round their place they go on at pace metres a second,
// waddling on land or bobbing in water; hop: metres it hops up, twice a second; lift: metres
// raised, so more shows above the water (or
// lowered, to stand in it).
// A flamingo on two legs, or on one, the other tucked up till it flees.
const flamingo = (onTwo) => {
  const [left, right] = legs(0.04, 0.85, 0.06, 0, PINK);
  if (!onTwo) left.userData.stride[0] *= 3;
  return [part(box(0.35, 0.35, 0.6), PINK, [0, 1, 0]), left, right];
};
const flamingoNeck = {
  geometry: mergeGeometries([
    part(box(0.06, 0.6, 0.06).translate(0, 0.3, 0).rotateX(0.2), PINK, [0, 0, 0]), // neck
    part(box(0.08, 0.1, 0.18), PINK, [0, 0.6, 0.18]), // head
    part(box(0.04, 0.1, 0.1), BLACK, [0, 0.55, 0.3]), // beak
    ...eyes(0.025, 0.025, 0.045, 0.62, 0.17),
  ]),
  pivot: [0, 1.1, 0.25],
  amount: 0.25,
  speed: 0.9,
};
const hind = [
  part(box(0.55, 0.7, 1.5), DEER, [0, 1.25, 0]),
  part(box(0.5, 0.3, 0.05), 0xe8dcc0, [0, 1.3, -0.76]), // rump
  ...legs(0.1, 0.95, 0.18, 0.55, DEER),
];
const deerNeck = [
  part(box(0.25, 0.7, 0.3).translate(0, 0.35, 0).rotateX(0.35), DEER, [0, 0, 0]), // neck
  part(box(0.25, 0.25, 0.45), DEER, [0, 0.7, 0.35]), // head
  part(box(0.15, 0.12, 0.1), 0x3a2a1c, [0, 0.66, 0.6]), // muzzle
  ...eyes(0.05, 0.05, 0.13, 0.75, 0.45),
  ...[-1, 1].map((x) => part(box(0.15, 0.06, 0.12), DEER, [x * 0.17, 0.85, 0.2])), // ears
];
const deerSwing = { pivot: [0, 1.5, 0.6], rest: 0.7, amount: 0.7, speed: 0.4 }; // grazing
const wolf = [
  part(box(0.35, 0.4, 1), WOLF, [0, 0.68, 0]),
  part(box(0.3, 0.25, 0.1), 0xc8c0b0, [0, 0.62, 0.5]), // chest
  ...legs(0.09, 0.5, 0.11, 0.35, WOLF),
  ...tail(
    [0.74, -0.47],
    [0.42, -0.93],
    part(box(0.12, 0.12, 0.5).rotateX(-0.6), WOLF, [0, 0.6, -0.68]), // bushy tail
    part(box(0.13, 0.13, 0.1).rotateX(-0.6), 0x3a3836, [0, 0.46, -0.88]), // its tip
  ),
];
const wolfHead = mergeGeometries([
  part(box(0.22, 0.3, 0.25).translate(0, 0.12, 0).rotateX(0.3), WOLF, [0, 0, 0]), // neck
  part(box(0.24, 0.22, 0.28), WOLF, [0, 0.2, 0.12]), // head
  part(box(0.12, 0.1, 0.22), 0xc8c0b0, [0, 0.15, 0.34]), // snout
  part(box(0.05, 0.04, 0.03), BLACK, [0, 0.18, 0.46]), // nose
  ...[-1, 1].map((x) => part(new THREE.ConeGeometry(0.05, 0.13, 4), WOLF, [x * 0.08, 0.37, 0.05])), // ears
  ...eyes(0.03, 0.02, 0.07, 0.25, 0.26, 0xd8b030),
]);
// A swan's body and its neck with the head (both facing +z): white with an orange beak, or young,
// grey with a dark one. Its legs (SWAN_LEG: thick, long, either side, from y up to their hips)
// hang from under its body, tucked up in the water. The same swans everywhere: here, by the old
// man (createSwans) and on the Rhine (src/swimmers.js).
export const SWAN_LEG = [0.05, 0.3, 0.1, -0.375];
const swanColours = (young) => (young ? [0x8a8278, 0x4a4545] : [WHITE, ORANGE]);
const swanBody = (young) => {
  const [color] = swanColours(young);
  return [
    part(box(0.45, 0.35, 0.9), color, [0, 0.1, 0]),
    part(box(0.25, 0.15, 0.25).rotateX(0.5), color, [0, 0.3, -0.45]), // tail
    ...[-1, 1].map((x) => part(box(0.1, 0.15, 0.6), color, [x * 0.2, 0.32, -0.05])), // wings
  ];
};
const swanNeck = (young) => {
  const [color, beak] = swanColours(young);
  return [
    part(box(0.08, 0.5, 0.08).rotateX(-0.2), color, [0, 0.45, 0.35]), // neck
    part(box(0.1, 0.1, 0.2), color, [0, 0.72, 0.42]), // head
    part(box(0.06, 0.05, 0.12), beak, [0, 0.7, 0.56]), // beak
    part(box(0.04, 0.04, 0.04), BLACK, [0, 0.73, 0.53]), // its knob, on the beak's root
    ...eyes(0.025, 0.025, 0.055, 0.735, 0.47),
  ];
};
// A swan, whole, without its legs; a leg as swanLegs has it, hanging from its hip.
export const swan = (young) => [...swanBody(young), ...swanNeck(young)];
export const swanLeg = () => {
  const [w, h] = SWAN_LEG;
  return part(box(w, h + w / 2, w), BLACK, [0, (w / 2 - h) / 2, 0]);
};
const swanLegs = () => {
  const [w, h, x, at] = SWAN_LEG;
  return legs(w, h, x, 0, BLACK, { at, tucked: true });
};
export const KINDS = {
  wolf: {
    body: wolf,
    swing: { geometry: wolfHead, pivot: [0, 0.85, 0.45], axis: "y", amount: 0.6, speed: 0.4 },
  },
  howler: {
    body: wolf,
    swing: { geometry: wolfHead, pivot: [0, 0.85, 0.45], rest: -0.4, amount: 0.4, speed: 0.5 }, // snout up
  },
  hind: { body: hind, swing: { ...deerSwing, geometry: mergeGeometries(deerNeck) } },
  stag: {
    body: hind,
    swing: {
      ...deerSwing,
      geometry: mergeGeometries([
        ...deerNeck,
        ...[-1, 1].flatMap((x) => [
          part(box(0.05, 0.7, 0.05).rotateZ(-x * 0.45), ANTLER, [x * 0.25, 1.12, 0.2]), // beam
          ...[0.95, 1.2, 1.4].map((y) =>
            part(box(0.04, 0.25, 0.04).rotateX(0.6), ANTLER, [
              x * (0.12 + (y - 0.8) * 0.45),
              y,
              0.3,
            ]),
          ), // tines
        ]),
      ]),
    },
  },
  cygnet: { body: [...swan(true), ...swanLegs()], ring: 3, pace: 0.3, swims: true },
  swan: {
    body: [...swan(false), ...swanLegs()],
    ring: 3,
    pace: 0.3,
    swims: true,
  },
  goat: {
    body: [
      part(box(0.4, 0.45, 0.85), GOAT, [0, 0.7, 0]),
      ...legs(0.08, 0.48, 0.13, 0.32, GOAT),
      ...tail(
        [0.9, -0.4],
        [1, -0.46],
        part(box(0.06, 0.12, 0.04).rotateX(-0.5), GOAT, [0, 0.95, -0.43]),
      ),
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(0.16, 0.35, 0.2).translate(0, 0.17, 0).rotateX(0.4), GOAT, [0, 0, 0]), // neck
        part(box(0.18, 0.2, 0.32), GOAT, [0, 0.35, 0.2]), // head
        ...[-1, 1].map((x) =>
          part(box(0.03, 0.2, 0.03).rotateX(-0.6), 0x6b6255, [x * 0.05, 0.5, 0.1]),
        ), // horns
        ...[-1, 1].map((x) => part(box(0.12, 0.04, 0.06), GOAT, [x * 0.12, 0.4, 0.12])), // ears
        part(box(0.04, 0.1, 0.04), GOAT, [0, 0.2, 0.33]), // beard
        ...eyes(0.04, 0.04, 0.095, 0.4, 0.26),
      ]),
      pivot: [0, 0.85, 0.4],
      rest: 0.5,
      amount: 0.5, // grazing, then looking up
      speed: 0.6,
    },
  },
  monkey: {
    body: [
      part(box(0.2, 0.18, 0.4), MONKEY, [0, 0.3, 0]), // on all fours
      ...legs(0.06, 0.21, 0.07, 0.14, MONKEY),
      ...tail(
        [0.36, -0.19],
        [0.72, -0.52],
        part(box(0.04, 0.04, 0.4).rotateX(0.6), MONKEY, [0, 0.47, -0.355]), // tail, up
        part(box(0.04, 0.15, 0.04), MONKEY, [0, 0.65, -0.52]), // its curl
      ),
      part(box(0.18, 0.18, 0.16), MONKEY, [0, 0.42, 0.24]), // head
      part(box(0.12, 0.1, 0.02), 0xd8b890, [0, 0.41, 0.325]), // face
      ...eyes(0.03, 0.01, 0.03, 0.44, 0.335),
      ...[-1, 1].map((x) => part(box(0.04, 0.07, 0.04), 0xd8b890, [x * 0.1, 0.44, 0.24])), // ears
    ],
    hop: 0.25,
  },
  lynx: {
    body: [
      part(box(0.35, 0.45, 0.95), LYNX, [0, 0.62, 0]),
      ...[
        [0.3, 0.2],
        [0.2, -0.25],
        [0.1, 0.35],
      ].flatMap(([y, z]) =>
        [-1, 1].map((x) => part(box(0.02, 0.08, 0.1), 0x5a4028, [x * 0.18, 0.62 + y - 0.2, z])),
      ), // spots
      ...legs(0.1, 0.45, 0.12, 0.35, LYNX),
      ...tail(
        [0.75, -0.475],
        [0.75, -0.665],
        part(box(0.07, 0.07, 0.15), LYNX, [0, 0.75, -0.55]), // short tail
        part(box(0.075, 0.075, 0.05), BLACK, [0, 0.75, -0.64]), // its tip
      ),
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(0.3, 0.27, 0.27), LYNX, [0, 0.02, 0.08]), // head
        part(box(0.36, 0.15, 0.1), 0xe8dcc0, [0, -0.06, 0.14]), // ruff
        ...[-1, 1].flatMap((x) => [
          part(new THREE.ConeGeometry(0.06, 0.14, 4), LYNX, [x * 0.1, 0.21, 0.04]), // ear
          part(box(0.02, 0.08, 0.02), BLACK, [x * 0.1, 0.31, 0.04]), // its tuft
        ]),
        ...eyes(0.04, 0.03, 0.07, 0.06, 0.22, 0xc8b040),
        part(box(0.05, 0.03, 0.03), 0x3a2a1c, [0, 0, 0.23]), // nose
      ]),
      pivot: [0, 0.8, 0.45],
      axis: "y",
      amount: 0.6, // looking round
      speed: 0.3,
    },
  },
  donkey: {
    body: [
      part(box(0.5, 0.55, 1.1), DONKEY, [0, 0.85, 0]),
      part(box(0.08, 0.03, 1), 0x3a3430, [0, 1.13, 0]), // stripe on its back
      part(box(0.45, 0.08, 0.9), PALE, [0, 0.58, 0]), // belly
      ...legs(0.1, 0.6, 0.16, 0.4, DONKEY),
      ...tail(
        [1, -0.57],
        [0.42, -0.57],
        part(box(0.05, 0.5, 0.05), DONKEY, [0, 0.75, -0.57]), // tail
        part(box(0.08, 0.12, 0.08), 0x3a3430, [0, 0.48, -0.57]), // its tuft
      ),
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(0.22, 0.55, 0.28).translate(0, 0.27, 0).rotateX(0.5), DONKEY, [0, 0, 0]), // neck
        part(box(0.06, 0.5, 0.08).translate(0, 0.27, -0.13).rotateX(0.5), 0x3a3430, [0, 0, 0]), // mane
        part(box(0.22, 0.25, 0.5), DONKEY, [0, 0.55, 0.45]), // head
        part(box(0.23, 0.18, 0.15), PALE, [0, 0.5, 0.68]), // muzzle
        ...eyes(0.05, 0.05, 0.115, 0.62, 0.42),
        ...[-1, 1].map((x) =>
          part(box(0.06, 0.3, 0.05).rotateZ(-x * 0.25), DONKEY, [x * 0.1, 0.8, 0.32]),
        ), // long ears
      ]),
      pivot: [0, 1, 0.5],
      rest: 0.6,
      amount: 0.6, // grazing, then looking up
      speed: 0.45,
    },
  },
  chamois: {
    body: [part(box(0.4, 0.5, 1), CHAMOIS, [0, 0.85, 0]), ...legs(0.08, 0.6, 0.13, 0.38, CHAMOIS)],
    swing: {
      geometry: mergeGeometries([
        part(box(0.18, 0.4, 0.22).translate(0, 0.2, 0).rotateX(0.3), CHAMOIS, [0, 0, 0]), // neck
        part(box(0.18, 0.2, 0.32), 0xe6dccb, [0, 0.42, 0.22]), // face
        ...[-1, 1].map((x) => part(box(0.02, 0.08, 0.3), BLACK, [x * 0.095, 0.44, 0.22])), // stripes
        ...eyes(0.04, 0.04, 0.095, 0.5, 0.3), // above the stripes
        ...[-1, 1].flatMap((x) => [
          part(box(0.03, 0.18, 0.03), BLACK, [x * 0.05, 0.6, 0.18]), // horn
          part(box(0.03, 0.03, 0.08), BLACK, [x * 0.05, 0.68, 0.13]), // its hook
        ]),
      ]),
      pivot: [0, 1.05, 0.45],
      axis: "y",
      amount: 0.5, // looking round
      speed: 0.5,
    },
  },
  giraffe: {
    body: [
      part(box(1, 1.1, 2), GIRAFFE, [0, 2.3, 0]),
      ...legs(0.2, 1.8, 0.35, 0.75, GIRAFFE),
      ...[
        [2.5, -0.5],
        [2.15, 0.2],
        [2.55, 0.6],
        [2.2, -0.8],
      ].map(([y, z]) => part(box(1.02, 0.25, 0.3), PATCH, [0, y, z])), // patches
      ...tail([2.5, -1.03], [1.7, -1.03], part(box(0.08, 0.8, 0.08), PATCH, [0, 2.1, -1.03])),
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(0.35, 2.2, 0.4).translate(0, 1.1, 0).rotateX(0.35), GIRAFFE, [0, 0, 0]), // neck
        part(box(0.35, 0.4, 0.8), GIRAFFE, [0, 2.1, 1]), // head
        ...eyes(0.08, 0.08, 0.18, 2.2, 1.05),
        ...[-1, 1].map((x) => part(box(0.08, 0.3, 0.08), PATCH, [x * 0.1, 2.4, 0.8])), // ossicones
      ]),
      pivot: [0, 2.6, 0.8],
      amount: 0.12,
      speed: 0.7,
    },
  },
  elephant: {
    body: [
      part(box(1.8, 1.8, 3), GREY, [0, 2, 0]),
      ...legs(0.55, 1.3, 0.6, 1, GREY),
      part(box(1.2, 1.2, 1), GREY, [0, 2.5, 1.9]), // head
      ...[-1, 1].map((x) =>
        part(box(0.1, 1.3, 1.1).rotateY(x * 0.6), 0x7a7a7a, [x * 0.9, 2.5, 1.6]),
      ), // ears
      ...[-1, 1].map((x) => part(box(0.12, 0.12, 0.7).rotateX(0.5), WHITE, [x * 0.35, 1.9, 2.5])), // tusks
      ...eyes(0.12, 0.12, 0.55, 2.75, 2.4),
      ...tail([2.35, -1.55], [1.45, -1.55], part(box(0.1, 0.9, 0.1), GREY, [0, 1.9, -1.55])),
    ],
    swing: {
      geometry: part(new THREE.CylinderGeometry(0.12, 0.2, 1.7, 6), GREY, [0, -0.85, 0]), // trunk
      pivot: [0, 2.3, 2.35],
      amount: 0.35,
      speed: 1.2,
    },
  },
  zebra: {
    body: [
      part(box(0.7, 0.8, 1.6), WHITE, [0, 1.1, 0]),
      ...[-0.6, -0.3, 0, 0.3, 0.6].map((z) => part(box(0.72, 0.82, 0.12), BLACK, [0, 1.1, z])), // stripes
      ...legs(0.15, 0.8, 0.22, 0.6, WHITE),
      ...tail([1.4, -0.83], [0.8, -0.83], part(box(0.06, 0.6, 0.06), BLACK, [0, 1.1, -0.83])),
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(0.3, 0.8, 0.35).translate(0, 0.4, 0).rotateX(0.5), WHITE, [0, 0, 0]), // neck
        part(box(0.08, 0.8, 0.12).translate(0, 0.4, -0.2).rotateX(0.5), BLACK, [0, 0, 0]), // mane
        part(box(0.28, 0.3, 0.6), WHITE, [0, 0.75, 0.6]), // head
        part(box(0.29, 0.2, 0.15), BLACK, [0, 0.7, 0.88]), // muzzle
        ...eyes(0.05, 0.05, 0.145, 0.83, 0.6),
      ]),
      pivot: [0, 1.2, 0.7],
      rest: 0.9,
      amount: 0.9, // grazing, then looking up
      speed: 0.4,
    },
  },
  rhino: {
    body: [
      part(box(1.6, 1.5, 3.2), RHINO, [0, 1.45, 0]),
      ...[-0.6, 0.7].map((z) => part(box(1.65, 1.2, 0.1), 0x6f675f, [0, 1.45, z])), // folds
      ...legs(0.45, 0.8, 0.5, 1.1, RHINO),
      ...tail([1.9, -1.63], [1.3, -1.63], part(box(0.08, 0.6, 0.08), RHINO, [0, 1.6, -1.63])),
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(0.8, 0.8, 1.2), RHINO, [0, -0.1, 0.6]), // head
        part(new THREE.ConeGeometry(0.17, 0.7, 5), 0xd8d0c0, [0, 0.55, 1]), // horn
        part(new THREE.ConeGeometry(0.1, 0.3, 5), 0xd8d0c0, [0, 0.4, 0.6]), // small horn
        ...[-1, 1].map((x) => part(box(0.1, 0.3, 0.15), RHINO, [x * 0.3, 0.45, 0.1])), // ears
        ...eyes(0.1, 0.1, 0.41, 0.05, 0.6),
      ]),
      pivot: [0, 1.6, 1.5],
      rest: 0.25,
      amount: 0.25,
      speed: 0.5,
    },
  },
  flamingo: { body: flamingo(false), swing: flamingoNeck, lift: -0.3 }, // on one leg
  flamingoOnTwo: { body: flamingo(true), swing: flamingoNeck, lift: -0.3 },
  penguin: {
    body: [
      part(box(0.4, 0.7, 0.35), BLACK, [0, 0.45, 0]),
      part(box(0.3, 0.55, 0.05), WHITE, [0, 0.42, 0.18]), // belly
      part(box(0.28, 0.25, 0.28), BLACK, [0, 0.92, 0]), // head
      part(box(0.06, 0.06, 0.15), ORANGE, [0, 0.9, 0.2]), // beak
      ...eyes(0.06, 0.06, 0.145, 0.97, 0.07, WHITE),
      ...eyes(0.03, 0.03, 0.17, 0.97, 0.08), // pupils
      ...[-1, 1].flatMap((x) =>
        mark(
          [x, 0.1, 0, 0],
          part(box(0.06, 0.08, 0.06), ORANGE, [x * 0.1, 0.06, 0]), // leg
          part(box(0.12, 0.04, 0.18), ORANGE, [x * 0.1, 0.02, 0.05]), // its foot
        ),
      ),
      ...[-1, 1].map((x) => part(box(0.05, 0.4, 0.15).rotateZ(x * 0.3), BLACK, [x * 0.24, 0.5, 0])), // flippers
    ],
    ring: 3,
    pace: 0.6,
  },
  hippo: {
    lift: 0.5,
    body: [
      part(box(1.6, 1.3, 2.8), HIPPO, [0, -0.3, 0]),
      part(box(1, 0.3, 1), HIPPO, [0, -0.15, 1.75]), // lower jaw
      part(box(0.9, 0.05, 0.9), 0xd77a8a, [0, 0.02, 1.75]), // mouth
      ...[-1, 1].map((x) => part(box(0.1, 0.2, 0.1), WHITE, [x * 0.35, 0.12, 2.15])), // teeth
      ...legs(0.4, 0.5, 0.5, 0.9, HIPPO, { at: -1.45, tucked: true }),
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(1.1, 0.5, 1.1), HIPPO, [0, 0.25, 0.55]), // upper jaw
        ...eyes(0.15, 0.15, 0.35, 0.55, 0.2),
        ...[-1, 1].map((x) => part(box(0.12, 0.15, 0.06), HIPPO, [x * 0.4, 0.55, -0.05])), // ears
      ]),
      pivot: [0, 0.05, 1.2],
      rest: -0.35,
      amount: 0.35, // its mouth shut, then wide open
      speed: 0.6,
    },
  },
  boar: {
    body: [
      part(box(0.6, 0.65, 1.2), BOAR, [0, 0.65, 0]),
      part(box(0.1, 0.12, 1), 0x2e241c, [0, 1.02, 0]), // bristles
      ...legs(0.12, 0.35, 0.2, 0.45, BOAR),
      ...tail([0.875, -0.62], [0.625, -0.62], part(box(0.04, 0.25, 0.04), BOAR, [0, 0.75, -0.62])),
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(0.45, 0.45, 0.5), BOAR, [0, -0.05, 0.2]), // head
        part(box(0.25, 0.22, 0.35), BOAR, [0, -0.15, 0.55]), // snout
        part(box(0.22, 0.2, 0.04), 0x6b5048, [0, -0.15, 0.73]), // nose
        ...[-1, 1].map((x) => part(box(0.04, 0.1, 0.04), WHITE, [x * 0.13, -0.12, 0.6])), // tusks
        ...[-1, 1].map((x) => part(box(0.08, 0.15, 0.08), BOAR, [x * 0.15, 0.22, 0.05])), // ears
        ...eyes(0.05, 0.05, 0.23, 0.05, 0.35),
      ]),
      pivot: [0, 0.75, 0.6],
      rest: 0.35,
      amount: 0.35, // rooting in the ground, then looking up
      speed: 0.7,
    },
  },
  fox: {
    body: [
      part(box(0.3, 0.3, 0.7), FOX, [0, 0.4, 0]),
      part(box(0.25, 0.2, 0.1), WHITE, [0, 0.35, 0.33]), // chest
      ...legs(0.07, 0.27, 0.1, 0.25, 0x2a1d14),
      ...tail(
        [0.41, -0.34],
        [0.23, -0.94],
        part(box(0.16, 0.16, 0.55).rotateX(-0.3), FOX, [0, 0.33, -0.6]), // tail
        part(box(0.17, 0.17, 0.12).rotateX(-0.3), WHITE, [0, 0.25, -0.88]), // its tip
      ),
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(0.22, 0.2, 0.22), FOX, [0, 0.05, 0.08]), // head
        part(box(0.1, 0.09, 0.18), FOX, [0, 0, 0.25]), // snout
        part(box(0.04, 0.04, 0.03), BLACK, [0, 0.01, 0.34]), // nose
        ...[-1, 1].map((x) =>
          part(new THREE.ConeGeometry(0.06, 0.14, 4), FOX, [x * 0.07, 0.21, 0.05]),
        ), // ears
        ...eyes(0.03, 0.03, 0.07, 0.1, 0.19),
      ]),
      pivot: [0, 0.5, 0.32],
      axis: "y",
      amount: 0.6, // looking left and right
      speed: 0.5,
    },
  },
  wildcat: {
    body: [
      part(box(0.25, 0.28, 0.6), CAT, [0, 0.38, 0]),
      ...[-0.2, 0, 0.2].map((z) => part(box(0.27, 0.3, 0.05), TABBY, [0, 0.38, z])), // stripes
      ...legs(0.07, 0.25, 0.08, 0.22, CAT),
      ...tail(
        [0.4, -0.3],
        [0.4, -0.72],
        part(box(0.1, 0.1, 0.4), CAT, [0, 0.4, -0.48]), // bushy tail
        ...[-0.55, -0.62].map((z) => part(box(0.11, 0.11, 0.04), TABBY, [0, 0.4, z])), // its rings
        part(box(0.11, 0.11, 0.06), BLACK, [0, 0.4, -0.69]), // its tip
      ),
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(0.22, 0.2, 0.2), CAT, [0, 0.02, 0.05]), // head
        ...[-1, 1].map((x) =>
          part(new THREE.ConeGeometry(0.05, 0.1, 4), CAT, [x * 0.07, 0.15, 0.03]),
        ), // ears
        ...eyes(0.04, 0.03, 0.06, 0.05, 0.15, 0xc8b040),
        part(box(0.04, 0.03, 0.03), 0xd08a8a, [0, -0.02, 0.16]), // nose
      ]),
      pivot: [0, 0.5, 0.3],
      axis: "y",
      amount: 0.7, // looking round
      speed: 0.35,
    },
  },
  crocodile: {
    body: [
      part(box(0.7, 0.35, 1.4), CROCODILE, [0, 0.25, 0]),
      ...[-0.2, 0, 0.2].map((x) => part(box(0.08, 0.08, 1.3), 0x3a4826, [x, 0.45, 0])), // scutes
      ...tail(
        [0.2, -0.7],
        [0.1, -2.3],
        part(box(0.45, 0.25, 0.6), CROCODILE, [0, 0.2, -1]), // tail
        part(box(0.3, 0.18, 0.6), CROCODILE, [0, 0.15, -1.55]),
        part(box(0.15, 0.12, 0.5), CROCODILE, [0, 0.1, -2.05]),
      ),
      ...[-1, 1].flatMap((x) =>
        [-1, 1].flatMap((z) =>
          mark(
            [x * z, 0.08, z * 0.5, 0],
            part(box(0.35, 0.12, 0.15), CROCODILE, [x * 0.45, 0.08, z * 0.5]),
          ),
        ),
      ), // legs, sprawled
      part(box(0.45, 0.12, 0.75), CROCODILE, [0, 0.12, 1.05]), // lower jaw
      part(box(0.4, 0.02, 0.7), 0xc77a6a, [0, 0.19, 1.05]), // mouth
      ...[-1, 1].map((x) => part(box(0.04, 0.05, 0.65), WHITE, [x * 0.19, 0.22, 1.07])), // teeth
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(0.5, 0.18, 0.8), CROCODILE, [0, 0.1, 0.4]), // head
        ...eyes(0.1, 0.1, 0.15, 0.22, 0.1, 0xc8b040),
      ]),
      pivot: [0, 0.2, 0.7],
      rest: -0.25,
      amount: 0.25, // its jaws shut, then wide open
      speed: 0.4,
    },
  },
  wisent: {
    body: [
      part(box(0.8, 0.85, 1.3), WISENT, [0, 1.15, -0.45]),
      part(box(1, 1.25, 1), SHAG, [0, 1.35, 0.6]), // shaggy forequarters
      part(box(0.7, 0.3, 0.8), SHAG, [0, 2.05, 0.45]), // hump
      ...legs(0.2, 0.8, 0.28, 0.75, WISENT),
      ...tail(
        [1.45, -1.13],
        [0.725, -1.13],
        part(box(0.06, 0.6, 0.06), WISENT, [0, 1.15, -1.13]), // tail
        part(box(0.1, 0.15, 0.1), SHAG, [0, 0.8, -1.13]), // its tuft
      ),
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(0.6, 0.65, 0.6), SHAG, [0, -0.15, 0.35]), // head
        part(box(0.4, 0.3, 0.25), 0x241812, [0, -0.35, 0.7]), // muzzle
        part(box(0.3, 0.35, 0.3), SHAG, [0, -0.6, 0.3]), // beard
        ...[-1, 1].flatMap((x) => [
          part(box(0.2, 0.07, 0.07), 0x2a2420, [x * 0.38, 0.05, 0.35]), // horn
          part(box(0.06, 0.16, 0.06), 0x2a2420, [x * 0.47, 0.15, 0.35]), // its tip
        ]),
        ...eyes(0.07, 0.05, 0.3, -0.02, 0.5),
      ]),
      pivot: [0, 1.35, 1.1],
      rest: 0.45,
      amount: 0.45, // grazing, then looking up
      speed: 0.35,
    },
  },
  seal: {
    body: [
      part(box(0.6, 0.5, 1.6), SEAL, [0, -0.1, 0]),
      part(box(0.4, 0.4, 0.45), SEAL, [0, 0.2, 0.95]), // head
      part(box(0.12, 0.1, 0.1), BLACK, [0, 0.2, 1.2]), // nose
      ...eyes(0.07, 0.04, 0.1, 0.3, 1.18), // ahead
      part(box(0.6, 0.06, 0.3), 0x5a5550, [0, -0.05, -0.9]), // hind flippers
      ...legs(0.12, 0.25, 0.2, 0.5, SEAL, { at: -0.6, tucked: true }),
    ],
    ring: 4,
    pace: 1.2,
    swims: true,
    lift: 0.3,
  },
};
// Mallards, swimming round: drakes with green heads and white collars, ducks all brown; geese.
const bird = (body, head, beak, size) => ({
  body: [
    part(box(0.22, 0.18, 0.42).scale(size, size, size), body, [0, 0.05 * size, 0]),
    part(box(0.12, 0.13, 0.14).scale(size, size, size), head, [0, 0.2 * size, 0.2 * size]),
    part(box(0.06, 0.03, 0.1).scale(size, size, size), beak, [0, 0.18 * size, 0.3 * size]),
    ...eyes(0.025 * size, 0.025 * size, 0.062 * size, 0.23 * size, 0.22 * size),
    part(box(0.1, 0.06, 0.1).rotateX(0.5).scale(size, size, size), body, [
      0,
      0.12 * size,
      -0.22 * size,
    ]), // tail
    ...legs(0.03 * size, 0.15 * size, 0.05 * size, 0, beak, {
      at: -0.19 * size,
      tucked: true,
    }),
  ],
  ring: 2.5,
  pace: 0.5,
  swims: true,
});
KINDS.drake = bird(0x8a8070, 0x1f6b3a, 0xe0c020, 1);
KINDS.drake.body.push(part(box(0.125, 0.03, 0.125), WHITE, [0, 0.13, 0.2])); // collar
KINDS.duck = bird(0x7a5c3c, 0x7a5c3c, ORANGE, 1);
KINDS.goose = bird(0x8c8c84, 0x8c8c84, ORANGE, 1.7);
// Piglets: striped along their sides.
KINDS.piglet = {
  ...KINDS.boar,
  body: [
    ...KINDS.boar.body,
    ...[0.55, 0.7, 0.85].map((y) => part(box(0.62, 0.05, 1.1), 0xb89a6a, [0, y, 0])),
  ],
};
// Each kind's parts with their strides, and where its tucked legs' feet are (foot, y; 0 if none).
for (const kind of Object.values(KINDS)) {
  const tucked = kind.body.filter((g) => Math.abs(g.userData.stride?.[0]) === 3);
  kind.foot = Math.min(0, ...tucked.map((g) => (g.computeBoundingBox(), g.boundingBox.min.y)));
  kind.body = mergeGeometries(kind.body.map(strode));
}
// Legs swing up to SWING radians, by SPEED times a body's speed (its sizes a second); their gait
// goes on STEP radians per size gone, eased to its swing EASE times a second. Tails wag TAIL
// radians either way, WAG radians a second, and FAST more at the legs' full swing. Fleeing, an
// animal is out (its tucked legs down, its head up) eased EASE times a second.
const [SWING, SPEED, STEP, EASE] = [0.5, 0.5, 6, 8];
export { STEP, SWING }; // as a swan's legs swing (src/swimmers.js)
const [TAIL, WAG, FAST] = [0.3, 2, 10];

// Metres round each kind (before BIG and its size), kept clear of trees and of traffic as it flees.
const REACH = {
  giraffe: 1.6,
  elephant: 2.2,
  zebra: 1,
  rhino: 2,
  penguin: 0.3,
  flamingo: 0.4,
  flamingoOnTwo: 0.4,
  hippo: 1.8,
  seal: 1,
  crocodile: 1.5,
  boar: 0.8,
  piglet: 0.8,
  fox: 0.6,
  wildcat: 0.5,
  hind: 1.1,
  stag: 1.2,
  chamois: 0.7,
  swan: 0.7,
  cygnet: 0.7, // as the swans, so their ring is the same
  drake: 0.3,
  duck: 0.3,
  goose: 0.5,
  goat: 0.6,
  monkey: 0.3,
  lynx: 0.6,
  donkey: 0.8,
  wolf: 0.6,
  howler: 0.6,
  wisent: 1.5,
};

// Each group: its animals as [kind, x, z (metres from its place, facing along its heading, before
// BIG), radians turned from it (on a ring: where on it), size].
const ring = (kind, count, big) =>
  [...Array(count)].map((_, k) => [kind, 0, 0, (-k * 2 * Math.PI) / count, k ? 1 : big]);
const GROUPS = {
  giraffes: [
    ["giraffe", 0, 0, 0, 1],
    ["giraffe", 3, 2, 0.6, 1.1],
    ["giraffe", 1.5, -2.5, -0.4, 0.6],
    ["giraffe", -3, 1.5, 2.5, 1],
    ["giraffe", -2, -3, 1.2, 1.05],
    ["giraffe", 5, -1.5, -0.9, 0.65],
  ],
  elephants: [
    ["elephant", 0, 0, 0, 1],
    ["elephant", 4.5, 1, 0.5, 1.05],
    ["elephant", 2, -4, 0.3, 0.55],
    ["elephant", -4.5, 1.5, -0.4, 0.95],
    ["elephant", -1.5, -4.5, 2.8, 0.5],
  ],
  zebras: [
    ["zebra", 0, 0, 0, 1],
    ["zebra", 2, 1.5, 0.4, 1],
    ["zebra", -1.5, 2, -0.5, 1],
    ["zebra", 1, -2, 0.2, 0.7],
    ["zebra", -2.5, -1, 0.9, 1],
    ["zebra", 3.5, -0.8, -0.3, 0.95],
    ["zebra", 0.5, 3.5, 1.6, 1],
    ["zebra", -3.2, 3.5, 0.2, 0.65],
  ],
  rhinos: [
    ["rhino", 0, 0, 0, 1],
    ["rhino", 4, 2, 0.7, 0.95],
    ["rhino", 1.5, -3.5, -0.3, 0.55],
    ["rhino", -4, 1, 2.4, 1],
  ],
  penguins: ring("penguin", 12, 1.2),
  hippos: [
    ["hippo", 0, 0, 0, 1],
    ["hippo", 3.5, 1, 2.5, 0.9],
    ["hippo", 1.5, -3, 1, 0.95],
    ["hippo", 5, -2.5, -0.8, 0.5],
  ],
  // Together, to one side of their place.
  flamingos: [
    ["flamingo", -2, 0.5, 0.4, 1],
    ["flamingoOnTwo", -2.6, 1.2, -0.5, 1],
    ["flamingo", -1.8, 2, 2.6, 0.9],
    ["flamingoOnTwo", -3, -0.5, 1.9, 1.05],
    ["flamingo", -4.4, 0.2, 1.2, 1],
    ["flamingoOnTwo", -4.6, 1.4, -1, 0.95],
  ],
  crocodile: [["crocodile", 0, 0, 0, 1]],
  boars: [
    ["boar", 0, 0, 0, 1],
    ["boar", 1.6, 0.8, 0.6, 0.95],
    ["boar", -1.4, 1.2, -0.5, 1.05],
    ["piglet", 0.6, -1.2, 0.3, 0.45],
    ["piglet", -0.4, -1.4, -0.4, 0.4],
    ["piglet", 1.2, -1.9, 1, 0.45],
    ["piglet", -1, -0.6, 2.4, 0.4],
  ],
  foxes: [
    ["fox", 0, 0, 0, 1],
    ["fox", 1.2, 0.6, 0.8, 0.95],
    ["fox", -0.9, 0.9, -0.6, 0.7],
  ],
  wildcat: [["wildcat", 0, 0, 0, 1]],
  deer: [
    ["stag", 0, 0, 0, 1.1],
    ["hind", 2, 1, 0.5, 1],
    ["hind", -1.8, 1.4, -0.6, 0.95],
    ["hind", 1, -2, 2.6, 1],
    ["hind", 2.6, -1.2, 1.2, 0.55], // a calf
  ],
  // Four swans, a cygnet after each.
  swans: ring("swan", 8, 1.1).map((swan, k) => (k % 2 ? ["cygnet", 0, 0, swan[3], 0.6] : swan)),
  goats: [
    ["goat", 0, 0, 0, 1],
    ["goat", 1.3, 0.8, 0.7, 1.05],
    ["goat", -1.2, 1, -0.6, 0.95],
    ["goat", 0.5, -1.4, 2.3, 1],
    ["goat", -1.6, -0.8, 1.5, 0.55],
    ["goat", 1.8, -0.7, -0.9, 0.5],
  ],
  monkeys: [
    ["monkey", 0, 0, 0, 1],
    ["monkey", 0.8, 0.5, 0.8, 0.9],
    ["monkey", -0.7, 0.6, -0.7, 1],
    ["monkey", 0.4, -0.8, 2.6, 0.95],
    ["monkey", -0.6, -0.7, -2.4, 0.7],
    ["monkey", 1.3, -0.3, 1.6, 1],
    ["monkey", -1.3, -0.1, -1.4, 0.85],
  ],
  // Mallards and geese in a loose line round their ring.
  ducks: [
    ["drake", 0, 0, 0, 1],
    ["duck", 0, 0, -0.5, 1],
    ["drake", 0, 0, -1.6, 1],
    ["duck", 0, 0, -2, 1],
    ["duck", 0, 0, -2.4, 0.6],
    ["duck", 0, 0, -2.7, 0.6],
    ["drake", 0, 0, -4, 1],
  ],
  geese: [
    ["goose", 0, 0, 0, 1],
    ["goose", 0, 0, -0.7, 1],
    ["drake", 0, 0, -2.5, 1],
    ["duck", 0, 0, -3, 1],
    ["drake", 0, 0, -4.3, 1],
  ],
  lynx: [["lynx", 0, 0, 0, 1]],
  donkeys: [
    ["donkey", 0, 0, 0, 1],
    ["donkey", 1.5, 0.8, 0.6, 1.05],
    ["donkey", -1.4, 1, -0.5, 0.95],
    ["donkey", 0.6, -1.4, 2.4, 0.6], // a foal
  ],
  wolf: [["wolf", 0, 0, 0, 1]],
  "howling wolf": [["howler", 0, 0, 0, 1.1]],
  chamois: [
    ["chamois", 0, 0, 0, 1],
    ["chamois", 1.3, 0.7, 0.7, 0.95],
    ["chamois", -1.2, 0.9, -0.5, 1],
    ["chamois", 0.6, -1.3, 2.2, 0.6],
  ],
  seals: ring("seal", 5, 1.2),
  wisents: [
    ["wisent", 0, 0, 0, 1],
    ["wisent", 2.8, 1, 0.5, 1.05],
    ["wisent", -2.6, 1.3, -0.6, 0.95],
    ["wisent", 1, -2.6, 2.6, 1],
    ["wisent", 2.6, -2, 1.2, 0.45], // a calf
  ],
};

// The groups at their places ({ group, x, z, heading }); ground(x, z): the height there; clear(x,
// z, r): whether no tree reaches within r metres; danger: what they flee from (createFlight). Each
// animal stands at the nearest spot clear of trees (a ring's middle so the whole ring is); returns
// { meshes, update(seconds, dt) }: per body and per neck geometry one mesh, its instances the
// animals with it, in one draw call. Fleeing, one stands on its legs (those in the water put them
// down), its head up, its legs swinging as it goes; its tail wags all the while.
export function createZoo(places, ground, clear, danger) {
  const free = (x, z, r) => {
    for (let d = 0; d <= 40; d += 2)
      for (let k = 0; k < (d ? 8 : 1); k++) {
        const [fx, fz] = [x + d * Math.sin((k * Math.PI) / 4), z + d * Math.cos((k * Math.PI) / 4)];
        if (clear(fx, fz, r)) return [fx, fz];
      }
    return [x, z];
  };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const animals = places.flatMap(({ group, x, z, heading }, herd) =>
    GROUPS[group].map(([name, dx, dz, turn, size], k) => {
      const kind = KINDS[name];
      const mesh = new THREE.Object3D(); // placed here, drawn as an instance of its body's mesh
      mesh.scale.setScalar(BIG * size);
      const [sin, cos] = [BIG * Math.sin(heading), BIG * Math.cos(heading)];
      const reach = BIG * size * REACH[name];
      const [ax, az] = kind.ring
        ? free(x, z, BIG * (kind.ring + REACH[name])) // the same for all on it
        : free(x + dx * cos + dz * sin, z - dx * sin + dz * cos, reach);
      const lift = BIG * size * (kind.lift ?? 0);
      mesh.position.set(ax, ground(ax, az) + lift, az);
      mesh.rotation.y = heading + turn;
      let neck = null;
      if (kind.swing) {
        neck = new THREE.Object3D();
        neck.position.fromArray(kind.swing.pivot);
        mesh.add(neck);
      }
      const center = { x: ax, y: ground(ax, az), z: az };
      const facing = heading + turn;
      // Its legs' phase and swing, how far out, its tail's phase; where it was, how far off its
      // place (createFlight's, null if at it); seconds on its ring.
      const gait = { phase: 0, swing: 0, out: 0, wag: k, x: ax, z: az, off: null, round: 0 };
      const foot = BIG * size * kind.foot;
      return {
        herd,
        mesh,
        neck,
        kind,
        turn,
        k,
        lift,
        foot,
        scale: BIG * size,
        center,
        facing,
        reach,
        gait,
      };
    }),
  );
  const flee = createFlight(animals.length, danger);
  const herds = [...Map.groupBy(animals, ({ herd }) => herd).values()]; // those of a place
  // One fleeing pushed by px, pz, off its place, and where it goes with it; whether one is fleeing
  // clear of its place (further than its reach).
  const push = ({ gait: { off }, mesh: { position } }, px, pz) => {
    for (const k of [0, 5]) [off[k], off[k + 1]] = [off[k] + px, off[k + 1] + pz];
    [position.x, position.z] = [position.x + px, position.z + pz];
  };
  const loose = ({ gait: { off }, reach }) => off && Math.hypot(off[0], off[1]) > reach;
  // Per geometry its mesh and the bodies or necks it shows.
  const shown = new Map();
  const show = (geometry, object) =>
    (shown.get(geometry) ?? shown.set(geometry, []).get(geometry)).push(object);
  for (const { mesh, neck, kind, gait } of animals) {
    gait.slot = shown.get(kind.body)?.length ?? 0; // its instance
    show(kind.body, mesh);
    if (neck) show(kind.swing.geometry, neck);
  }
  // The bodies, moving their parts by their strides and the instance's gait (phase, swing, out,
  // its tail's phase): a leg turned about its hip by its way times swing radians, as the sine of
  // the phase, a tucked one drawn out from its hip by out; a tail turned about its base, sideways,
  // by TAIL radians as the sine of its phase.
  const legged = material.clone();
  legged.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "attribute vec4 stride;\nattribute vec4 gait;\nvoid main() {")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        if (stride.x == 2.0) {
          vec3 base = vec3(0.0, stride.yz);
          vec3 axis = vec3(0.0, cos(stride.w), sin(stride.w));
          vec3 v = transformed - base;
          float a = ${TAIL.toFixed(2)} * sin(gait.w);
          transformed = base + v * cos(a) + cross(axis, v) * sin(a) + axis * dot(axis, v) * (1.0 - cos(a));
        } else if (stride.x != 0.0) {
          vec2 hip = transformed.yz - stride.yz;
          if (abs(stride.x) > 2.0) hip *= gait.z;
          float a = sign(stride.x) * gait.y * sin(gait.x);
          transformed.yz = stride.yz + mat2(cos(a), sin(a), -sin(a), cos(a)) * hip;
        }`,
      );
  };
  const gaits = new Map(); // per body its instances' gait
  const meshes = [...shown].map(([geometry, objects]) => {
    const body = !!geometry.attributes.stride;
    const mesh = new THREE.InstancedMesh(geometry, body ? legged : material, objects.length);
    mesh.frustumCulled = false; // spread over the city
    if (body) {
      const gait = new THREE.InstancedBufferAttribute(new Float32Array(4 * objects.length), 4);
      geometry.setAttribute("gait", gait.setUsage(THREE.DynamicDrawUsage));
      gaits.set(geometry, gait);
    }
    return [mesh, objects];
  });
  // Their instances where the animals are now.
  const write = () => {
    for (const { mesh } of animals) mesh.updateMatrixWorld(true);
    for (const [mesh, objects] of meshes) {
      objects.forEach((object, i) => mesh.setMatrixAt(i, object.matrixWorld));
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  write();
  return {
    meshes: meshes.map(([mesh]) => mesh),
    // Off its place while it flees, on the ground there, facing its way.
    update(seconds, dt) {
      animals.forEach(
        ({ mesh, neck, kind, turn, k, lift, foot, scale, center, facing, reach, gait }, i) => {
          const { swing, pace, swims } = kind;
          let [x, z, heading] = [center.x, center.z, facing];
          // On its ring, which waits while it is off it.
          if (kind.ring) {
            if (!gait.off) gait.round += dt;
            const ring = BIG * kind.ring;
            const a = turn + (BIG * pace * gait.round) / ring;
            [x, z] = [center.x + ring * Math.sin(a), center.z + ring * Math.cos(a)];
            heading = Math.atan2(Math.cos(a), -Math.sin(a)); // ahead on the ring
            if (!swims) mesh.rotation.z = 0.2 * Math.sin(6 * seconds + k);
          }
          const off = flee(i, x, center.y, z, dt, reach);
          if (off) [x, z, heading] = [x + off[0], z + off[1], off[2]];
          gait.off = off;
          if (dt) gait.out += ((off ? 1 : 0) - gait.out) * Math.min(1, EASE * dt);
          // Raised (or lowered) as placed, out on its feet.
          const on = off || (kind.ring && !swims) ? ground(x, z) : center.y;
          let y = on + lift + (-foot - lift) * gait.out;
          if (kind.hop) y += scale * kind.hop * Math.abs(Math.sin(Math.PI * 2 * seconds + k));
          if (swims) y += 0.1 * Math.sin(2 * seconds + k) * (1 - gait.out);
          mesh.position.set(x, y, z);
          mesh.rotation.y = heading;
          if (neck)
            neck.rotation[swing.axis ?? "x"] =
              ((swing.rest ?? 0) + swing.amount * Math.sin(swing.speed * seconds + k)) *
              (1 - gait.out);
          if (!dt) return;
          const gone = Math.hypot(x - gait.x, z - gait.z) / scale;
          gait.phase += STEP * gone;
          const most = Math.min(SWING, (SPEED * gone) / dt);
          gait.swing += (most - gait.swing) * Math.min(1, EASE * dt);
          gait.wag += (WAG + (FAST * gait.swing) / SWING) * dt;
          [gait.x, gait.z] = [x, z];
          gaits
            .get(kind.body)
            .array.set([gait.phase, gait.swing, gait.out, gait.wag], 4 * gait.slot);
        },
      );
      // Of a herd, two fleeing clear of their places pushed apart where they come within each
      // other's reach (near their places they may, as some stand so).
      for (const herd of herds)
        for (let n = 0; n < herd.length; n++)
          for (let m = n + 1; m < herd.length; m++) {
            const [a, b] = [herd[n], herd[m]];
            if (!loose(a) || !loose(b)) continue;
            const [dx, dz] = [
              b.mesh.position.x - a.mesh.position.x,
              b.mesh.position.z - a.mesh.position.z,
            ];
            const d = Math.hypot(dx, dz);
            const overlap = a.reach + b.reach - d;
            if (overlap <= 0) continue;
            const [ux, uz] = d ? [dx / d, dz / d] : [1, 0];
            push(a, (-ux * overlap) / 2, (-uz * overlap) / 2);
            push(b, (ux * overlap) / 2, (uz * overlap) / 2);
          }
      for (const instances of gaits.values()) instances.needsUpdate = true;
      write();
    },
  };
}

// Where a swan's neck turns: at its base; radians it dips, its beak then on the water BEAK metres
// ahead of the swan (before its size).
const NECK = [0, 0.2, 0.38];
const DIP = 1.6;
const BEAK = 0.87;
// Seconds a piece of bread flies, metres it rises in its arc, seconds a peck takes.
const FLY = 1;
const ARC = 1.5;
const PECK = 1;
// Swans at places ({ x, y, z, heading, size, young: grey }), fed bread tossed from a point (a
// Vector3) every period seconds from first on, to each in turn, while feeding() (none tossed
// else); each pecks its piece where it lands, ahead of it. Fleeing from danger (createFlight), off
// its place on its legs on ground(x, z), facing its way, they swinging as it goes. Returns
// { meshes, update(seconds, dt) }.
export function createSwans(places, from, period, first, ground, danger, feeding) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const breadShape = part(box(0.12, 0.07, 0.12), 0xd9b26a, [0, 0.035, 0]);
  const [, H, X, AT] = SWAN_LEG;
  const legShape = swanLeg();
  const shapes = [false, true].map((young) => [
    mergeGeometries(swanBody(young)),
    mergeGeometries(swanNeck(young)).translate(...NECK.map((v) => -v)),
  ]);
  const swans = places.map(({ x, y, z, heading, size, young }) => {
    const [body, neck] = shapes[young ? 1 : 0].map((g) => new THREE.Mesh(g, material));
    body.position.set(x, y, z);
    body.rotation.y = heading;
    body.scale.setScalar(size);
    neck.position.fromArray(NECK);
    body.add(neck);
    const legs = [-1, 1].map((side) => {
      const leg = new THREE.Mesh(legShape, material);
      leg.position.set(side * X, AT + H, 0);
      body.add(leg);
      return leg;
    });
    const reach = BEAK * size;
    const target = new THREE.Vector3(
      x + reach * Math.sin(heading),
      y,
      z + reach * Math.cos(heading),
    );
    const bread = new THREE.Mesh(breadShape, material);
    // Its legs' phase; its last toss and whether it was tossed.
    return { body, neck, legs, bread, target, x, y, z, heading, size, phase: 0, toss: NaN };
  });
  const flee = createFlight(swans.length, danger);
  const cycle = period * swans.length;
  return {
    meshes: swans.flatMap(({ body, bread }) => [body, bread]),
    update(seconds, dt) {
      swans.forEach((swan, k) => {
        const { body, neck, legs, bread, target, x, y, z, heading, size } = swan;
        const off = flee(k, x, y, z, dt);
        const [bx, bz] = off ? [x + off[0], z + off[1]] : [x, z];
        swan.phase += (STEP * Math.hypot(bx - body.position.x, bz - body.position.z)) / size;
        body.position.set(bx, off ? ground(bx, bz) - AT * size : y, bz);
        body.rotation.y = off ? off[2] : heading;
        legs.forEach((leg, side) => {
          leg.visible = !!off;
          leg.rotation.x = (side ? SWING : -SWING) * Math.sin(swan.phase);
        });
        const at = seconds - first - k * period;
        const toss = Math.floor(at / cycle);
        if (toss !== swan.toss) [swan.toss, swan.tossed] = [toss, feeding()];
        const since = at - toss * cycle; // since its last toss
        const peck = since - FLY;
        const pecking = swan.tossed && !off && peck > 0 && peck < PECK;
        neck.rotation.x = pecking ? DIP * Math.sin((Math.PI * peck) / PECK) : 0;
        bread.visible = swan.tossed && peck < PECK / 2; // eaten once the beak is down
        if (since < FLY) {
          const s = since / FLY;
          bread.position.lerpVectors(from, target, s).y += 4 * ARC * s * (1 - s);
        } else bread.position.copy(target);
      });
    },
  };
}
