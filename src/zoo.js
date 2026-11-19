// Zoo animals, low-poly and BIG times their size so they are seen well, each kind in a group
// around its place: giraffes nodding, elephants swinging their trunks, zebras grazing, rhinos
// nodding, a parade of penguins waddling round in a ring; in the water hippos opening their mouths
// wide and seals swimming round in a ring, among flamingos (some on one leg) bobbing their heads;
// a crocodile opening its jaws slowly.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part } from "./parts.js";

const BIG = 2;
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const legs = (w, h, x, z, color) =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sz) => part(box(w, h, w), color, [sx * x, h / 2, sz * z])));
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

// The kinds, facing +z: body, what stays still; swing, what turns about x at pivot (rest + amount ·
// sin(speed · seconds) radians); ring: metres round their place they go on at pace metres a second,
// waddling on land or bobbing in water; lift: metres raised, so more shows above the water (or
// lowered, to stand in it).
const flamingo = [
  part(box(0.35, 0.35, 0.6), PINK, [0, 1, 0]),
  part(box(0.04, 0.85, 0.04), PINK, [0.06, 0.42, 0]),
];
const flamingoNeck = {
  geometry: mergeGeometries([
    part(box(0.06, 0.6, 0.06).translate(0, 0.3, 0).rotateX(0.2), PINK, [0, 0, 0]), // neck
    part(box(0.08, 0.1, 0.18), PINK, [0, 0.6, 0.18]), // head
    part(box(0.04, 0.1, 0.1), BLACK, [0, 0.55, 0.3]), // beak
  ]),
  pivot: [0, 1.1, 0.25],
  amount: 0.25,
  speed: 0.9,
};
const KINDS = {
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
      part(box(0.08, 0.8, 0.08), PATCH, [0, 2.1, -1.05]), // tail
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(0.35, 2.2, 0.4).translate(0, 1.1, 0).rotateX(0.35), GIRAFFE, [0, 0, 0]), // neck
        part(box(0.35, 0.4, 0.8), GIRAFFE, [0, 2.1, 1]), // head
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
      ...[-1, 1].map((x) => part(box(0.12, 0.12, 0.12), BLACK, [x * 0.55, 2.75, 2.4])), // eyes
      part(box(0.1, 0.9, 0.1), GREY, [0, 1.9, -1.55]), // tail
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
      part(box(0.06, 0.6, 0.06), BLACK, [0, 1.1, -0.83]), // tail
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(0.3, 0.8, 0.35).translate(0, 0.4, 0).rotateX(0.5), WHITE, [0, 0, 0]), // neck
        part(box(0.08, 0.8, 0.12).translate(0, 0.4, -0.2).rotateX(0.5), BLACK, [0, 0, 0]), // mane
        part(box(0.28, 0.3, 0.6), WHITE, [0, 0.75, 0.6]), // head
        part(box(0.29, 0.2, 0.15), BLACK, [0, 0.7, 0.88]), // muzzle
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
      part(box(0.08, 0.6, 0.08), RHINO, [0, 1.6, -1.65]), // tail
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(0.8, 0.8, 1.2), RHINO, [0, -0.1, 0.6]), // head
        part(new THREE.ConeGeometry(0.17, 0.7, 5), 0xd8d0c0, [0, 0.55, 1]), // horn
        part(new THREE.ConeGeometry(0.1, 0.3, 5), 0xd8d0c0, [0, 0.4, 0.6]), // small horn
        ...[-1, 1].map((x) => part(box(0.1, 0.3, 0.15), RHINO, [x * 0.3, 0.45, 0.1])), // ears
        ...[-1, 1].map((x) => part(box(0.1, 0.1, 0.1), BLACK, [x * 0.41, 0.05, 0.6])), // eyes
      ]),
      pivot: [0, 1.6, 1.5],
      rest: 0.25,
      amount: 0.25,
      speed: 0.5,
    },
  },
  flamingo: { body: flamingo, swing: flamingoNeck, lift: -0.3 }, // on one leg
  flamingoOnTwo: {
    body: [...flamingo, part(box(0.04, 0.85, 0.04), PINK, [-0.06, 0.42, 0])],
    swing: flamingoNeck,
    lift: -0.3,
  },
  penguin: {
    body: [
      part(box(0.4, 0.7, 0.35), BLACK, [0, 0.45, 0]),
      part(box(0.3, 0.55, 0.05), WHITE, [0, 0.42, 0.18]), // belly
      part(box(0.28, 0.25, 0.28), BLACK, [0, 0.92, 0]), // head
      part(box(0.06, 0.06, 0.15), ORANGE, [0, 0.9, 0.2]), // beak
      ...[-1, 1].map((x) => part(box(0.12, 0.04, 0.18), ORANGE, [x * 0.1, 0.02, 0.05])), // feet
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
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(1.1, 0.5, 1.1), HIPPO, [0, 0.25, 0.55]), // upper jaw
        ...[-1, 1].map((x) => part(box(0.15, 0.15, 0.15), BLACK, [x * 0.35, 0.55, 0.2])), // eyes
        ...[-1, 1].map((x) => part(box(0.12, 0.15, 0.06), HIPPO, [x * 0.4, 0.55, -0.05])), // ears
      ]),
      pivot: [0, 0.05, 1.2],
      rest: -0.35,
      amount: 0.35, // its mouth shut, then wide open
      speed: 0.6,
    },
  },
  crocodile: {
    body: [
      part(box(0.7, 0.35, 1.4), CROCODILE, [0, 0.25, 0]),
      ...[-0.2, 0, 0.2].map((x) => part(box(0.08, 0.08, 1.3), 0x3a4826, [x, 0.45, 0])), // scutes
      part(box(0.45, 0.25, 0.6), CROCODILE, [0, 0.2, -1]), // tail
      part(box(0.3, 0.18, 0.6), CROCODILE, [0, 0.15, -1.55]),
      part(box(0.15, 0.12, 0.5), CROCODILE, [0, 0.1, -2.05]),
      ...[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => part(box(0.35, 0.12, 0.15), CROCODILE, [x * 0.45, 0.08, z * 0.5])),
      ), // legs
      part(box(0.45, 0.12, 0.75), CROCODILE, [0, 0.12, 1.05]), // lower jaw
      part(box(0.4, 0.02, 0.7), 0xc77a6a, [0, 0.19, 1.05]), // mouth
      ...[-1, 1].map((x) => part(box(0.04, 0.05, 0.65), WHITE, [x * 0.19, 0.22, 1.07])), // teeth
    ],
    swing: {
      geometry: mergeGeometries([
        part(box(0.5, 0.18, 0.8), CROCODILE, [0, 0.1, 0.4]), // head
        ...[-1, 1].map((x) => part(box(0.1, 0.1, 0.1), 0xc8b040, [x * 0.15, 0.22, 0.1])), // eyes
      ]),
      pivot: [0, 0.2, 0.7],
      rest: -0.25,
      amount: 0.25, // its jaws shut, then wide open
      speed: 0.4,
    },
  },
  seal: {
    body: [
      part(box(0.6, 0.5, 1.6), SEAL, [0, -0.1, 0]),
      part(box(0.4, 0.4, 0.45), SEAL, [0, 0.2, 0.95]), // head
      part(box(0.12, 0.1, 0.1), BLACK, [0, 0.2, 1.2]), // nose
      part(box(0.6, 0.06, 0.3), 0x5a5550, [0, -0.05, -0.9]), // hind flippers
    ],
    ring: 4,
    pace: 1.2,
    swims: true,
    lift: 0.3,
  },
};
for (const kind of Object.values(KINDS)) kind.body = mergeGeometries(kind.body);

// Metres round each kind (before BIG and its size), kept clear of trees.
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
    ["flamingo", -2, 0.5, 0.4, 1],
    ["flamingoOnTwo", -2.6, 1.2, -0.5, 1],
    ["flamingo", -1.8, 2, 2.6, 0.9],
    ["flamingoOnTwo", -3, -0.5, 1.9, 1.05],
    ["flamingo", 7, 0, 1.2, 1],
    ["flamingoOnTwo", 6.5, 1.2, -1, 0.95],
  ],
  crocodiles: [["crocodile", 0, 0, 0, 1]],
  seals: [
    ...ring("seal", 5, 1.2),
    ["flamingo", 0, 0, 0, 1],
    ["flamingoOnTwo", 0.8, 0.5, 0.5, 1],
    ["flamingo", -0.7, 0.9, -0.3, 1.05],
    ["flamingoOnTwo", 0.3, -0.8, 2, 0.9],
    ["flamingoOnTwo", 5.5, 1, 2.8, 0.95],
    ["flamingo", 6.2, 0.2, 1.2, 1],
    ["flamingo", 5.8, -0.8, -0.6, 1],
    ["flamingoOnTwo", 6.6, 1.5, 0.9, 1.05],
  ],
};

// The groups at their places ({ group, x, z, heading }); ground(x, z): the height there; clear(x,
// z, r): whether no tree reaches within r metres. Each animal stands at the nearest spot clear of
// trees (a ring's middle so the whole ring is); returns { meshes, update(seconds) }.
export function createZoo(places, ground, clear) {
  const free = (x, z, r) => {
    for (let d = 0; d <= 40; d += 2)
      for (let k = 0; k < (d ? 8 : 1); k++) {
        const [fx, fz] = [x + d * Math.sin((k * Math.PI) / 4), z + d * Math.cos((k * Math.PI) / 4)];
        if (clear(fx, fz, r)) return [fx, fz];
      }
    return [x, z];
  };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const animals = places.flatMap(({ group, x, z, heading }) =>
    GROUPS[group].map(([name, dx, dz, turn, size], k) => {
      const kind = KINDS[name];
      const mesh = new THREE.Mesh(kind.body, material);
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
        neck = new THREE.Mesh(kind.swing.geometry, material);
        neck.position.fromArray(kind.swing.pivot);
        mesh.add(neck);
      }
      return { mesh, neck, kind, turn, k, lift, center: { x: ax, y: ground(ax, az), z: az } };
    }),
  );
  return {
    meshes: animals.map(({ mesh }) => mesh),
    update(seconds) {
      for (const { mesh, neck, kind, turn, k, lift, center } of animals) {
        const { swing, pace, swims } = kind;
        if (neck)
          neck.rotation.x = (swing.rest ?? 0) + swing.amount * Math.sin(swing.speed * seconds + k);
        if (!kind.ring) continue;
        const ring = BIG * kind.ring;
        const a = turn + (BIG * pace * seconds) / ring;
        const [x, z] = [center.x + ring * Math.sin(a), center.z + ring * Math.cos(a)];
        mesh.rotation.y = Math.atan2(Math.cos(a), -Math.sin(a)); // ahead on the ring
        if (swims) mesh.position.set(x, center.y + lift + 0.1 * Math.sin(2 * seconds + k), z);
        else {
          mesh.position.set(x, ground(x, z), z);
          mesh.rotation.z = 0.2 * Math.sin(6 * seconds + k);
        }
      }
    },
  };
}
