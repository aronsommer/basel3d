// The museum on two empty industrial sites in Klybeck, by Novartis, and round them: every kind
// placed in the city (INVENTORY.md), built by the same code there, each with its id on a plate on
// the ground (createLabels): all one can drive or fly oneself (EXHIBITS, placed by src/main.js with
// the others, so they can be) on a parking east of the people's site, the dinosaur among them; on
// the southern site the catalog's kinds (exhibitsOf); east of it an airliner and beyond it the
// Rega's helicopters on their pads, the attack helicopter circling high over them; north of it
// the jet and the UFO; on the Rhine east of it the boats, the serpent, a ferry, the ships and
// whales passing and the swimmers' round, cyclists on its bank; on the northern site pedestrians
// walking round (MUSEUM), a track round them for a train (TRACK), a small one for a tram (TRAM),
// west of them a road the generated cars drive (ROAD); north of all a flock of birds.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fromWGS84 } from "./geo.js";
import { part } from "./parts.js";

// Whether the museum is open in this browser: all of it is there only then (none of its exhibits,
// courses, pedestrians). Its secret switch, a red button (createButton, src/main.js), opens or
// closes it (toggle), which takes the page loading again.
const KEY = "basel3d.museum"; // "1" (open)
export const OPEN = (() => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false; // storage blocked
  }
})();
export function toggle() {
  try {
    localStorage.setItem(KEY, OPEN ? "0" : "1");
  } catch {} // storage blocked: it stays as it is
  location.reload();
}
// The switch: a big red push button on a low grey base on the ground, among trees west of the
// museum (ground(x, z): the height there).
export function createButton(ground) {
  const [x, z] = fromWGS84(47.582627, 7.576159);
  const cylinder = (r, h) => new THREE.CylinderGeometry(r, r, h, 24);
  const mesh = new THREE.Mesh(
    mergeGeometries([
      part(cylinder(0.5, 0.15), 0x8c9196, [0, 0.075, 0]), // base
      part(cylinder(0.32, 0.1), 0xd8231f, [0, 0.2, 0]), // the button
    ]),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  mesh.position.set(x, ground(x, z), z);
  return mesh;
}

// A site by its corners (WGS84) and the heading (radians) of its sides' way south: at(lx, lz), the
// scene x, z of a point lx metres west and lz metres south of its middle, along its sides.
function site(corners, heading) {
  const points = corners.map(([lat, lon]) => fromWGS84(lat, lon));
  const [cx, cz] = [0, 1].map((k) => points.reduce((sum, p) => sum + p[k], 0) / 4);
  const [cos, sin] = [Math.cos(heading), Math.sin(heading)];
  return {
    heading,
    at: (lx, lz) => ({ x: cx - lx * cos + lz * sin, z: cz + lx * sin + lz * cos }),
  };
}
const VEHICLES = site(
  [
    [47.580021, 7.578962],
    [47.578987, 7.578903],
    [47.578668, 7.581117],
    [47.579792, 7.58137],
  ],
  -0.093,
);
const PEOPLE = site(
  [
    [47.583131, 7.579487],
    [47.582171, 7.579429],
    [47.582064, 7.580826],
    [47.58307, 7.580965],
  ],
  -0.065,
);
const place = (lx, lz, more) => ({ ...VEHICLES.at(lx, lz), heading: VEHICLES.heading, ...more });
// A place midway between two points (WGS84), facing from the first towards the second.
function between(from, to) {
  const [[ax, az], [bx, bz]] = [from, to].map(([lat, lon]) => fromWGS84(lat, lon));
  return { x: (ax + bx) / 2, z: (az + bz) / 2, heading: Math.atan2(bx - ax, bz - az) };
}

// By kind: the vehicles on the parking east of the people's site (spot); the jet and the UFO
// north of the site; the airliner at its east side, facing south; east of it, towards the Rhine,
// the Rega's helicopters on their pads side by side at PADS, facing south (on one height,
// src/main.js), the helicopter circling CIRCLE metres round their middle, HIGH metres over the
// ground, as wide and high as the city's (clear of the serpent); the boats on the Rhine.
const [CIRCLE, HIGH] = [150, 300];
const PADS = [
  [47.580308, 7.582358],
  [47.580294, 7.582661],
].map(([lat, lon]) => fromWGS84(lat, lon));
// The parking: bays from the first point of each pair (WGS84) towards the second, lined up (one
// heading, their mean; their middles evenly from the first's to the last's), each with two spots
// a quarter of BAY metres from its middle either way along it (the first ahead, west): spot(k),
// the k-th, the bays from the south. The catalog's take theirs as in SPOTS_OF, any other the next free.
const BAY = 27;
const SPOTS = (() => {
  const bays = [
    [47.581118, 7.581592, 47.581144, 7.581237],
    [47.581278, 7.581618, 47.581308, 7.581247],
    [47.581437, 7.581671, 47.581471, 7.581267],
    [47.5816, 7.581696, 47.581631, 7.58128],
    [47.581763, 7.581687, 47.581792, 7.581328],
    [47.581929, 7.581634, 47.581951, 7.581338],
  ].map(([lat, lon, toLat, toLon]) => between([lat, lon], [toLat, toLon]));
  const heading = Math.atan2(
    bays.reduce((sum, b) => sum + Math.sin(b.heading), 0),
    bays.reduce((sum, b) => sum + Math.cos(b.heading), 0),
  );
  const [first, last] = [bays[0], bays.at(-1)];
  const [ux, uz] = [(Math.sin(heading) * BAY) / 4, (Math.cos(heading) * BAY) / 4];
  return bays.flatMap((_, k) => {
    const t = k / (bays.length - 1);
    const [x, z] = [first.x + (last.x - first.x) * t, first.z + (last.z - first.z) * t];
    return [1, -1].map((side) => ({ x: x + ux * side, z: z + uz * side, heading }));
  });
})();
const taken = new Set();
const spot = (k, more) => (taken.add(k), { ...SPOTS[k], ...more });
// Spot k's x, z moved metres back (east).
const back = (k, metres) => {
  const { x, z, heading } = SPOTS[k];
  return { x: x - Math.sin(heading) * metres, z: z - Math.cos(heading) * metres };
};
const SPOTS_OF = { V1: [0, 1] };
const next = (id, more) => {
  const k = SPOTS_OF[id]?.find((s) => !taken.has(s)) ?? SPOTS.findIndex((_, s) => !taken.has(s));
  return spot(k, more);
};
const ALL = {
  ambulance: [spot(2)],
  fire: [spot(3)],
  motorcycle: [spot(4), spot(5, { color: 0x7ee000 })],
  quad: [spot(6)],
  xrt: [spot(7)],
  tank: [spot(8, back(8, 2))],
  drone: [spot(9, back(9, 2))],
  dino: [spot(10)],
  rega: ["h145", "aw109"].map((model, k) => {
    const [x, z] = PADS[k];
    return { x, z, heading: VEHICLES.heading, model };
  }),
  jet: [between([47.580464, 7.581148], [47.58021, 7.581115])],
  ufo: [between([47.580319, 7.580016], [47.580765, 7.580092])],
  plane: [between([47.579728, 7.581653], [47.579172, 7.581513])],
  helicopter: [
    {
      x: (PADS[0][0] + PADS[1][0]) / 2,
      z: (PADS[0][1] + PADS[1][1]) / 2,
      heading: 0,
      radius: CIRCLE,
      high: HIGH,
    },
  ],
  // On the Rhine, one behind the other, facing from the first to the second, upstream (south).
  ...(() => {
    const [a, b] = [
      [47.580408, 7.583532],
      [47.579975, 7.583432],
    ];
    const { heading } = between(a, b);
    const at = ([lat, lon]) => {
      const [x, z] = fromWGS84(lat, lon);
      return [{ x, z, heading }];
    };
    return { fireboat: at(a), policeboat: at(b) };
  })(),
};
export const EXHIBITS = Object.fromEntries(
  Object.entries(ALL).map(([kind, places]) => [kind, OPEN ? places : []]),
);
// The catalog's kinds (src/catalog.js) in the museum: where it shows the kind with this id and
// name, placed in the city at places: one of each variant (places differing but in x, z and
// heading), each marked museum (for makers laying it out otherwise there), with the vehicles if one
// drives it (V), else on the site of the scenes (SCENES; LAYOUT, the animals' groups ZOO: metres
// west and south of its middle, its label's metres south of it) or, not there, in
// a row SCENES_ROW metres south of the vehicles' site's middle, from SCENE_FROM metres west (east
// negative) on east, SCENE metres apart; in the order asked, all facing south. Each one's label in
// LABELS (label): "id name", of a kind with more variants "id-k name" (k from 1, in the order of
// its places), a group's name (animals) instead of its own.
const SCENES = site(
  [
    [47.579972, 7.578862],
    [47.577564, 7.578286],
    [47.577287, 7.580764],
    [47.579795, 7.581108],
  ],
  -0.125,
);
// Bands from north to south, numbered as read from above (north to south, west to east), sized to
// what stands there: the small scenes in a row, apart by their widths; the bike's way (123 m); the
// football pitch (about 100 by 80 m, as in the city) in the west and the clique's loop (30 by 63 m)
// in the east; then the animals (ZOO).
const LAYOUT = {
  L1: [79, -125, 4],
  S1: [65, -125, 5],
  S2: [49, -125, 6],
  S3: [19, -125, 4], // 33 m wide, a row
  S4: [-15, -125, 4], // 19 m
  S5: [-48, -125, 5], // and the second tower's friends 18 m east of the first's
  S6: [0, -95, 20],
  S7: [35, -35, 45],
  S8: [-60, -35, 37],
};
// The animals' groups in rows by size, from ZOO_FROM metres south of the middle, ZOO_ROW apart,
// each row centred west to east in the catalog's order (so numbered as read): per group how far
// it goes from its place while it moves, all round and south (metres, measured), its neighbours
// GAP more apart, at least PLATE metres for its label, which lies beyond what it reaches south
// (LABEL_BEYOND more); and metres east it is set, for one lying to one side of its place.
const ZOO_ROWS = [
  [
    ["elephants", 16.5, 8.9],
    ["rhinos", 15.2, 8.9],
    ["giraffes", 13, 8.8],
    ["hippos", 13.3, 4.9],
    ["zebras", 11.9, 9.6],
    ["seals", 11.5, 9.2],
  ],
  [
    ["deer", 8.3, 5.7],
    ["flamingos", 15.5, 4.6, 6.1],
    ["boars", 7, 5.2],
    ["donkeys", 7.1, 5],
    ["chamois", 4.8, 3.4],
    ["goats", 5.7, 3.9],
    ["foxes", 4.2, 2.7],
    ["crocodile", 4.8, 3],
    ["monkeys", 3.1, 1.7],
  ],
  [
    ["penguins", 7.8, 7.3],
    ["swans", 7.9, 6.7],
    ["ducks", 5.8, 5.3],
    ["geese", 6.4, 5.5],
    ["wildcat", 1.5, 1],
    ["lynx", 1.6, 1.5],
    ["howling wolf", 2.1, 2],
    ["wolf", 2.1, 1.9],
  ],
];
const [ZOO_FROM, ZOO_ROW, GAP, LABEL_BEYOND, PLATE] = [40, 38, 3, 3.5, 7];
const ZOO = Object.fromEntries(
  ZOO_ROWS.flatMap((row, r) => {
    const half = ([, out]) => Math.max(out, PLATE / 2);
    const width = row.reduce((sum, g) => sum + 2 * half(g), 0) + GAP * (row.length - 1);
    let west = width / 2; // from the west end eastwards
    return row.map((g) => {
      const [group, , south, east = 0] = g;
      const at = west - half(g);
      west -= 2 * half(g) + GAP;
      return [group, [at - east, ZOO_FROM + r * ZOO_ROW, south + LABEL_BEYOND]];
    });
  }),
);
const [SCENES_ROW, SCENE_FROM, SCENE] = [40, -20, -8];
let scenes = 0;
// Where the labels lie, by number (WGS84, as placed with "Move labels", src/main.js); any other
// where it is laid out below.
const LABEL_AT = {
  V2: [47.581312, 7.581217],
  V3: [47.581278, 7.581653],
  "V4-1": [47.581473, 7.581263],
  "V4-2": [47.581441, 7.58166],
  V5: [47.581632, 7.581285],
  V6: [47.5816, 7.581669],
  V7: [47.581796, 7.581272],
  V8: [47.581763, 7.581706],
  V9: [47.581929, 7.581636],
  "V10-1": [47.580225, 7.582344],
  "V10-2": [47.580213, 7.58265],
  V11: [47.580181, 7.581252],
  V12: [47.580301, 7.579932],
  V13: [47.579126, 7.581499],
  V14: [47.580301, 7.58251],
  V15: [47.580278, 7.583495],
  V16: [47.57987, 7.583411],
  T1: [47.580427, 7.578878],
  T2: [47.580824, 7.579386],
  T3: [47.582189, 7.579545],
  T4: [47.580097, 7.583764],
  P1: [47.582619, 7.580194],
  P2: [47.581607, 7.583398],
  P3: [47.581955, 7.583248],
  T5: [47.578054, 7.582944],
  A2: [47.580043, 7.583755],
  A3: [47.579126, 7.582883],
  A4: [47.584733, 7.580797],
  L1: [47.579824, 7.578917],
  S8: [47.578568, 7.580543],
  "V1-1": [47.581149, 7.581207],
  "V1-2": [47.581116, 7.581626],
  S2: [47.579772, 7.579309],
  S3: [47.579756, 7.579708],
  S4: [47.579717, 7.580156],
  "A1-1": [47.578269, 7.578712],
  "A1-2": [47.57823, 7.57917],
  "A1-3": [47.578204, 7.57955],
  "A1-4": [47.578177, 7.580013],
  "A1-5": [47.578123, 7.580338],
  "A1-6": [47.578096, 7.580687],
  "A1-7": [47.57795, 7.578757],
  "A1-8": [47.577927, 7.579105],
  "A1-9": [47.577895, 7.579447],
  "A1-10": [47.577877, 7.579673],
  "A1-11": [47.577875, 7.579872],
  "A1-12": [47.577855, 7.580049],
  "A1-13": [47.577851, 7.580221],
  "A1-14": [47.577835, 7.580379],
  "A1-15": [47.577833, 7.58053],
  "A1-16": [47.577574, 7.578954],
  "A1-17": [47.57755, 7.579217],
  "A1-18": [47.577552, 7.579424],
  "A1-19": [47.577533, 7.579624],
  "A1-20": [47.577558, 7.579802],
  "A1-21": [47.577542, 7.579933],
  "A1-22": [47.577526, 7.580064],
  "A1-23": [47.577516, 7.580196],
  S1: [47.579799, 7.5791],
  "S5-1": [47.57967, 7.58059],
  "S5-2": [47.57965, 7.580827],
  S7: [47.578605, 7.579277],
  S6: [47.579324, 7.579881],
};
export const LABELS = [];
function label(text, x, z) {
  const at = LABEL_AT[text.slice(0, text.indexOf(" "))];
  const [lx, lz] = at ? fromWGS84(...at) : [x, z];
  LABELS.push({ text, x: lx, z: lz });
}
// [x, z] d metres ahead of a place ({ x, z, heading }).
const ahead = ({ x, z, heading }, d) => [x + Math.sin(heading) * d, z + Math.cos(heading) * d];
// Metres ahead of the middle of what one drives or flies its label lies, by kind (vehicle: any
// other, up to 2.5 m to its nose): 3 m beyond its nose (from the half lengths in their files).
const AHEAD = {
  vehicle: 5,
  ambulance: 6.5,
  fire: 8,
  tank: 7,
  dino: 7.5,
  fireboat: 12.5,
  policeboat: 8.5,
  rega: 9,
  jet: 14,
  plane: 30,
  ufo: 22,
  helicopter: 0,
};
// Those not yet in the catalog (EXHIBITS), labelled as its kinds are, under the ids that are to be
// theirs there: by kind [id, name].
const NAMES = {
  ambulance: ["V2", "Ambulance"],
  fire: ["V3", "Fire truck"],
  motorcycle: ["V4", "Motorcycle"],
  quad: ["V5", "Quad"],
  xrt: ["V6", "Traxxas XRT"],
  tank: ["V7", "Tank"],
  drone: ["V8", "Drone"],
  dino: ["V9", "Dinosaur"],
  rega: ["V10", "Rega helicopter"],
  jet: ["V11", "Fighter jet"],
  ufo: ["V12", "UFO"],
  plane: ["V13", "Airliner"],
  helicopter: ["V14", "Attack helicopter"],
  fireboat: ["V15", "Fireboat"],
  policeboat: ["V16", "Police boat"],
};
for (const [kind, places] of Object.entries(EXHIBITS))
  places.forEach((place, k) => {
    const [id, name] = NAMES[kind];
    const number = places.length > 1 ? `${id}-${k + 1}` : id;
    label(`${number} ${name}`, ...ahead(place, AHEAD[kind] ?? AHEAD.vehicle));
  });
export function exhibitsOf(id, name, places) {
  if (!OPEN) return [];
  const variants = new Map(
    places.map(({ x, z, heading, ...rest }) => [JSON.stringify(rest), rest]),
  );
  return [...variants.values()].map((rest, k) => {
    const number = variants.size > 1 ? `${id}-${k + 1}` : id;
    const named = rest.group ? rest.group[0].toUpperCase() + rest.group.slice(1) : name;
    const text = `${number} ${named}`;
    const museum = { ...rest, museum: true };
    if (id.startsWith("V")) {
      const at = next(id, museum);
      label(text, ...ahead(at, AHEAD.vehicle));
      return at;
    }
    const layout = LAYOUT[id] ?? ZOO[rest.group];
    if (!layout) {
      const at = place(SCENE_FROM + scenes++ * SCENE, SCENES_ROW, museum);
      label(text, at.x, at.z);
      return at;
    }
    const [west, south, below] = layout;
    const across = rest.group ? west : west - k * 18; // a kind's variants on eastwards
    const { x, z } = SCENES.at(across, south + below);
    label(text, x, z);
    return { ...SCENES.at(across, south), heading: SCENES.heading, ...museum };
  });
}
// A course through these scene [x, z] points round, back to the first, its corners rounded:
// arcs of radius metres (less where the sides are too short: each arc takes at most half of
// either side), a point every ARC metres along them.
const ARC = 2;
function rounded(points, radius) {
  const course = [];
  points.forEach(([x, z], k) => {
    const [[px, pz], [nx, nz]] = [-1, 1].map(
      (d) => points[(k + d + points.length) % points.length],
    );
    const [inLength, outLength] = [Math.hypot(x - px, z - pz), Math.hypot(nx - x, nz - z)];
    const [ux, uz, vx, vz] = [
      (x - px) / inLength,
      (z - pz) / inLength,
      (nx - x) / outLength,
      (nz - z) / outLength,
    ];
    const turn = Math.acos(Math.min(1, Math.max(-1, ux * vx + uz * vz))); // radians
    const half = Math.tan(turn / 2);
    if (half < 1e-6) return course.push([x, z]); // straight on
    const t = Math.min(radius * half, inLength / 2, outLength / 2); // metres from the corner
    const r = t / half;
    const side = Math.sign(ux * vz - uz * vx); // which way it turns
    // The arc's middle, r to the inside of where it starts, and its start's angle about it.
    const [sx, sz] = [x - ux * t, z - uz * t];
    const [cx, cz] = [sx - uz * r * side, sz + ux * r * side];
    const start = Math.atan2(sx - cx, sz - cz);
    const steps = Math.max(1, Math.ceil((r * turn) / ARC));
    for (let s = 0; s <= steps; s++) {
      const a = start - (side * turn * s) / steps;
      course.push([cx + r * Math.sin(a), cz + r * Math.cos(a)]);
    }
  });
  return course;
}
// The museum's courses (src/movers.js): its track round the people's site, the train's, corners
// rounded TRAIN metres; a small one for the tram, rounded TRAM metres; and its road west of the
// sites, the generated cars', all their kinds in turn.
const [TRAIN, TRAM_RADIUS] = [40, 20];
const ll = (list) => list.map(([lat, lon]) => fromWGS84(lat, lon));
export const TRAM = rounded(
  ll([
    [47.580949, 7.57925],
    [47.580273, 7.579147],
    [47.580125, 7.580719],
    [47.580824, 7.580802],
  ]),
  TRAM_RADIUS,
);
export const TRACK = rounded(
  ll([
    [47.582068, 7.57943],
    [47.581977, 7.580951],
    [47.583139, 7.581103],
    [47.583223, 7.580034],
    [47.583205, 7.57966],
    [47.583209, 7.5793],
    [47.583089, 7.579374],
    [47.582961, 7.579383],
    [47.582238, 7.579268],
    [47.582145, 7.579307],
  ]),
  TRAIN,
);
export const ROAD = [
  [47.580369, 7.579039],
  [47.580922, 7.579119],
  [47.581495, 7.579204],
  [47.581961, 7.579273],
  [47.582082, 7.579141],
  [47.582181, 7.577721],
  [47.582079, 7.577606],
  [47.581942, 7.577523],
  [47.581733, 7.577445],
  [47.581477, 7.577437],
  [47.581337, 7.577469],
  [47.581231, 7.577509],
  [47.581189, 7.577577],
  [47.581158, 7.577702],
  [47.58113, 7.57788],
  [47.581124, 7.57803],
  [47.581128, 7.578198],
  [47.581035, 7.578196],
  [47.580843, 7.57815],
  [47.580643, 7.578114],
  [47.580579, 7.578144],
  [47.580507, 7.578242],
  [47.580426, 7.578493],
  [47.580372, 7.578668],
  [47.580316, 7.578844],
  [47.580318, 7.57897],
].map(([lat, lon]) => fromWGS84(lat, lon));
// Whether x, z is at the museum's vehicles, within REACH metres of their site's middle (the boats
// and the circling helicopter too).
const REACH = 300;
const MIDDLE = VEHICLES.at(0, 0);
export const atMuseum = (x, z) => Math.hypot(x - MIDDLE.x, z - MIDDLE.z) < REACH;
// The people's site: generated pedestrians (src/walkers.js) of each kind in turn walking round
// rectangles about its middle (WALKS: metres from it west and east, north and south), their
// loops as public/walks.bin has them: buffer, x0, z0 (whence its points count, in eighths of a
// metre); x, z: its middle.
const WALKS = [
  [45, 45],
  [35, 35],
  [25, 25],
  [15, 15],
];
export const MUSEUM = (() => {
  const centre = PEOPLE.at(0, 0);
  const [x0, z0] = [centre.x - 100, centre.z - 100];
  const data = WALKS.flatMap(([a, b]) => [
    4,
    ...[
      [a, -b],
      [-a, -b],
      [-a, b],
      [a, b],
    ].flatMap(([lx, lz]) => {
      const { x, z } = PEOPLE.at(lx, lz);
      return [Math.round((x - x0) * 8), Math.round((z - z0) * 8)];
    }),
  ]);
  return { buffer: Uint16Array.from(data).buffer, x0, z0, ...centre };
})();
// The Rhine swimmers' round (src/swimmers.js), scene [x, z]: up the bank, into the Rhine, down it,
// out at its edge (the last, the first not swum from) and round back.
export const SWIM = [
  [47.582434, 7.583391],
  [47.582354, 7.583267],
  [47.582376, 7.583024],
  [47.582024, 7.582955],
  [47.581727, 7.583271],
  [47.580828, 7.583033],
  [47.580774, 7.583388],
  [47.580728, 7.583723],
  [47.582332, 7.584186],
  [47.582381, 7.583786],
].map(([lat, lon]) => fromWGS84(lat, lon));

// The sea serpent (src/serpent.js) in the Rhine south of the boats, looking at the scenes, and a
// flock of birds (src/birds.js) north of the trains' round: scene [x, z].
export const SERPENT = { at: fromWGS84(47.5791, 7.5836), look: fromWGS84(47.5797, 7.5805) };
export const FLOCK = fromWGS84(47.584733, 7.580797);
// A ferry across the Rhine south of the serpent, as src/ferries.js's LANDINGS (the left bank's
// landing first), without a name, so not among the city's names.
export const FERRY = [null, [47.578274, 7.583051], [47.578247, 7.585851]];

// What moves on its own courses and walks, labelled beside them under ids of their own (T traffic,
// P people moving), and the animals not in the catalog (A).
if (OPEN) {
  const middle = (points) =>
    [0, 1].map((k) => points.reduce((sum, p) => sum + p[k], 0) / points.length);
  const inside = (points, d) => {
    const [[x, z], [mx, mz]] = [points[0], middle(points)];
    const length = Math.hypot(mx - x, mz - z);
    return [x + ((mx - x) / length) * d, z + ((mz - z) / length) * d];
  };
  label("T1 Road vehicles", ...inside(ROAD, 8));
  label("T2 Trams", ...inside(TRAM, 8));
  label("T3 Trains", ...inside(TRACK, 10));
  label("T4 Ships", ...fromWGS84(47.580192, 7.583482)); // between the boats, near the ships' way
  label("P1 Pedestrians", MUSEUM.x, MUSEUM.z);
  label("P2 Rhine swimmers", ...SWIM[4]);
  label("P3 Cyclists and scooters", ...SWIM[3]);
  label("T5 Ferry", ...fromWGS84(47.578274, 7.582951)); // on the bank by its landing
  label("A2 Whales", ...fromWGS84(47.5797, 7.5838)); // among the ships passing
  label("A3 Sea serpent", ...fromWGS84(47.5791, 7.5826)); // on the bank before it
  label("A4 Birds", ...FLOCK);
}

// The labels (LABELS) as plates flat over the ground (ground(x, z): the height there; settle),
// drawn before it, turned as the site of the scenes: on dark, in white, the id (all up to the
// first space) in letters LETTER metres high, below it the rest half as high; readable from the
// south, sharp also seen aslant (anisotropy: the renderer's most).
const [LETTER, LIFT, STEP] = [1.6, 0.3, 1];
// Lays a label along the ground under it (looked at every STEP metres across it; the plane
// fitting it best), LIFT metres over where the ground rises highest above that plane, so no bump
// or slope hides any of it.
export function settle(mesh, ground) {
  const { width, height } = mesh.geometry.parameters;
  const [cos, sin] = [Math.cos(mesh.rotation.y), Math.sin(mesh.rotation.y)];
  const [n, m] = [Math.ceil(width / STEP), Math.ceil(height / STEP)];
  const points = []; // [metres across, metres along, height]
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      const [a, b] = [(i / n - 0.5) * width, (j / m - 0.5) * height];
      const [x, z] = [mesh.position.x + a * cos + b * sin, mesh.position.z - a * sin + b * cos];
      points.push([a, b, ground(x, z)]);
    }
  // On the symmetric grid the best plane's slopes and middle height fall out one by one.
  const sum = (f) => points.reduce((total, p) => total + f(p), 0);
  const [across, along] = [0, 1].map((k) => sum((p) => p[k] * p[2]) / sum((p) => p[k] ** 2));
  const middle = sum((p) => p[2]) / points.length;
  const above = Math.max(...points.map(([a, b, y]) => y - middle - across * a - along * b));
  mesh.position.y = middle + above + LIFT;
  mesh.rotation.set(-Math.atan(along), mesh.rotation.y, Math.atan(across), "YXZ");
}
const [BIG, SMALL, PAD] = [96, 48, 32]; // canvas px: the id's letters, the name's, the margin
export function createLabels(ground, anisotropy) {
  const group = new THREE.Group();
  for (const { text, x, z } of LABELS) {
    const [id, name] = [text.slice(0, text.indexOf(" ")), text.slice(text.indexOf(" ") + 1)];
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const fonts = [`700 ${BIG}px Inter, sans-serif`, `500 ${SMALL}px Inter, sans-serif`];
    const widths = [id, name].map((line, k) => {
      context.font = fonts[k];
      return context.measureText(line).width;
    });
    [canvas.width, canvas.height] = [
      Math.ceil(Math.max(...widths)) + 2 * PAD,
      BIG + SMALL + 2 * PAD,
    ];
    context.fillStyle = "#1d242b";
    context.beginPath();
    context.roundRect(0, 0, canvas.width, canvas.height, PAD);
    context.fill();
    context.fillStyle = "#fff";
    context.textAlign = "center";
    context.textBaseline = "top";
    context.font = fonts[0];
    context.fillText(id, canvas.width / 2, PAD * 0.75);
    context.font = fonts[1];
    context.fillText(name, canvas.width / 2, PAD * 0.75 + BIG);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    const metre = LETTER / BIG; // per canvas px
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(canvas.width * metre, canvas.height * metre).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    mesh.rotation.y = SCENES.heading;
    mesh.position.set(x, 0, z);
    settle(mesh, ground);
    mesh.userData.text = text;
    group.add(mesh);
  }
  return group;
}
