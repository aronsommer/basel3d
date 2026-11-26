// The museum on two empty industrial sites in Klybeck, by Novartis, and round them: every kind
// placed in the city (INVENTORY.md), built by the same code there, each with its id on a plate on
// the ground (createLabels): all one can drive or fly oneself (AT) on a parking east of
// the people's site, the dinosaur among them; on the southern site the catalog's other kinds
// (exhibitsOf); east of it an airliner and beyond it the
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
// courses, pedestrians). Its secret switch, a push button (createButton, src/main.js), opens or
// closes it (toggle), which takes the page loading again.
const KEY = "basel3d.museum"; // "1" (open) or "0"
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
// All of it seen from above when it opens (src/main.js): its middle (WGS84) and the metres it
// spans north to south and west to east, the switch and the ferry's landings too, with some room.
export const OVERVIEW = [47.58101, 7.581005, 900, 800];
// The switch: a big push button, red while the museum is closed and a lighter green while it is
// open, on a low grey base on the ground, 1.5 m across and 0.375 m high, among trees west of the
// museum (ground(x, z): the height there).
export function createButton(ground) {
  const [x, z] = fromWGS84(47.582627, 7.576159);
  const cylinder = (r, h) => new THREE.CylinderGeometry(r, r, h, 24);
  const mesh = new THREE.Mesh(
    mergeGeometries([
      part(cylinder(0.5, 0.15), 0x8c9196, [0, 0.075, 0]), // base
      part(cylinder(0.32, 0.1), OPEN ? 0x3ee05a : 0xd8231f, [0, 0.2, 0]), // the button
    ]).scale(1.5, 1.5, 1.5),
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
// A point (WGS84) as scene { x, z }.
const point = (lat, lon) => {
  const [x, z] = fromWGS84(lat, lon);
  return { x, z };
};
// A place midway between two points (WGS84), facing from the first towards the second.
function between(from, to) {
  const [[ax, az], [bx, bz]] = [from, to].map(([lat, lon]) => fromWGS84(lat, lon));
  return { x: (ax + bx) / 2, z: (az + bz) / 2, heading: Math.atan2(bx - ax, bz - az) };
}

// The boats on the Rhine, one behind the other, from the first point (WGS84) towards the second,
// upstream (south).
const BOATS = [
  [47.580408, 7.583532],
  [47.579975, 7.583432],
];
const UPSTREAM = between(...BOATS).heading;

// By kind: the vehicles on the parking east of the people's site (spot); the jet and the UFO
// north of the site; the airliner at its east side, facing south; east of it, towards the Rhine,
// the Rega's helicopters on their pads side by side at PADS, facing south (on one height,
// src/catalog.js), the helicopter circling round their middle, as wide and high as the city's
// (clear of the serpent); the boats on the Rhine.
const PADS = [
  [47.580308, 7.582358],
  [47.580294, 7.582661],
].map(([lat, lon]) => fromWGS84(lat, lon));
// The parking: bays from the first point of each pair (WGS84) towards the second, lined up (one
// heading, their mean; their middles evenly from the first's to the last's), each with two spots
// a quarter of BAY metres from its middle either way along it (the first ahead, west): spot(k),
// the k-th, the bays from the south.
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
// The catalog's (src/catalog.js), by id, a place per variant in order; any other the next free spot.
const AT = {
  V1: [spot(0), spot(1)],
  V2: [spot(2)],
  V3: [spot(3)],
  V4: [spot(4), spot(5)],
  V5: [spot(6)],
  V6: [spot(7)],
  V7: [spot(8, back(8, 2))],
  V8: [spot(9, back(9, 2))],
  V9: [spot(11, point(47.581937, 7.581548))],
  ...(() => {
    const at = ([lat, lon]) => [{ ...point(lat, lon), heading: UPSTREAM }];
    return { V15: at(BOATS[0]), V16: at(BOATS[1]) };
  })(),
  V10: PADS.map(([x, z]) => ({ x, z, heading: VEHICLES.heading })),
  V11: [between([47.580464, 7.581148], [47.58021, 7.581115])],
  V12: [between([47.580319, 7.580016], [47.580765, 7.580092])],
  V13: [between([47.579728, 7.581653], [47.579172, 7.581513])],
  V14: [{ x: (PADS[0][0] + PADS[1][0]) / 2, z: (PADS[0][1] + PADS[1][1]) / 2, heading: 0 }],
  // The sea serpent in the Rhine south of the boats, looking at the scenes; a flock of birds north
  // of the trains' round.
  A3: [{ ...point(47.5791, 7.5836), look: fromWGS84(47.5797, 7.5805) }],
  A4: [point(47.584733, 7.580797)],
};
// Kinds the museum shows where they are in the city, by id: metres ahead of each its label lies.
const IN_PLACE = { V17: 12 };
// The catalog's kinds (src/catalog.js) in the museum: where it shows the kind with this id and
// name, placed in the city at places: one of each variant (places differing but in x, z and
// heading; one if it keeps to no place), each marked museum (for makers laying it out otherwise
// there), if one drives or flies it (V) at its place in AT, else on the next free spot; else on
// the site of the scenes (SCENES; LAYOUT, the animals' groups ZOO: metres west and south of its
// middle, its label's metres south of it) or, not there, in a row SCENES_ROW metres south of the
// vehicles' site's middle, from SCENE_FROM metres west (east negative) on east, SCENE metres apart;
// in the order asked, all facing south. Each one's label in LABELS (label): "id name", of a kind with more
// variants "id-k name" (k from 1, in the order of its places), a group's name (animals) instead of
// its own; its city, the variant's places, if any.
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
  S3: [18, -125, 4], // 35 m wide, a row
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
  [["wisents", 10.3, 6.2]],
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
  V9: [47.581921, 7.581646],
  "V10-1": [47.580213, 7.582331],
  "V10-2": [47.580189, 7.582656],
  V11: [47.580178, 7.581328],
  V12: [47.580301, 7.579932],
  V13: [47.579126, 7.581499],
  V14: [47.58045, 7.582516],
  V15: [47.580278, 7.583495],
  V16: [47.57987, 7.583411],
  V18: [47.581948, 7.581325],
  "T1-1": [47.58067, 7.578924],
  "T1-2": [47.58063, 7.578916],
  "T1-3": [47.580589, 7.578908],
  "T1-4": [47.580548, 7.578901],
  "T1-5": [47.580508, 7.578893],
  "T1-6": [47.580467, 7.578886],
  "T1-7": [47.580427, 7.578878],
  "T2-1": [47.580822, 7.579432],
  "T2-2": [47.580772, 7.57942],
  "T3-1": [47.582189, 7.579545],
  "T3-2": [47.582143, 7.579547],
  "T4-1": [47.580219, 7.583787],
  "T4-2": [47.580178, 7.583779],
  "T4-3": [47.580138, 7.583772],
  "T4-4": [47.580097, 7.583764],
  P1: [47.582619, 7.580194],
  P2: [47.581607, 7.583398],
  "P3-1": [47.581955, 7.583248],
  "P3-2": [47.581915, 7.58324],
  T5: [47.578054, 7.582944],
  A2: [47.580053, 7.583755],
  A3: [47.579126, 7.582883],
  A4: [47.584733, 7.580797],
  Museum: [47.581814, 7.580094],
  Pins: [47.581558, 7.580453],
  Graffiti: [47.581567, 7.579763],
  L1: [47.579814, 7.578884],
  S8: [47.578568, 7.580543],
  "V1-1": [47.581149, 7.581207],
  "V1-2": [47.581116, 7.581626],
  S2: [47.579756, 7.579357],
  S3: [47.579739, 7.579716],
  S4: [47.579707, 7.58016],
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
  "A1-16": [47.577558, 7.578954],
  "A1-17": [47.57755, 7.579217],
  "A1-18": [47.577545, 7.579438],
  "A1-19": [47.577533, 7.579624],
  "A1-20": [47.577558, 7.579802],
  "A1-21": [47.577542, 7.579933],
  "A1-22": [47.577526, 7.580064],
  "A1-23": [47.577516, 7.580196],
  "A1-24": [47.577194, 7.57948],
  S1: [47.579779, 7.579085],
  "S5-1": [47.57965, 7.580572],
  "S5-2": [47.579629, 7.580858],
  S7: [47.578605, 7.579277],
  S6: [47.579324, 7.579881],
};
// Each label's city: its kind's or variant's places in the city ({ x, z }), for pins (src/main.js);
// none for what keeps to no place.
export const LABELS = [];
function label(text, x, z, more) {
  const at = LABEL_AT[text.split(" ")[0]];
  const [lx, lz] = at ? fromWGS84(...at) : [x, z];
  LABELS.push({ text, x: lx, z: lz, ...more });
}
// Places, but none within APART metres of one kept before, so a group gets one pin.
const APART = 30;
const apart = (places) =>
  places.reduce(
    (kept, { x, z }) =>
      kept.some((k) => Math.hypot(k.x - x, k.z - z) < APART) ? kept : [...kept, { x, z }],
    [],
  );
// [x, z] d metres ahead of a place ({ x, z, heading }).
const ahead = ({ x, z, heading = 0 }, d) => [x + Math.sin(heading) * d, z + Math.cos(heading) * d];
// Metres ahead of the middle of what one drives or flies its label lies, where LABEL_AT does not
// place it: 3 m beyond the nose of one up to 2.5 m long.
const AHEAD = 5;
// The plates alone of a kind of the catalog without make, which src/main.js shows in the museum
// itself: one for each of its names (one, or a list for what takes its turn there), placed in
// LABEL_AT, each with its places in the city as its city, if any.
export function platesOf(id, name, places) {
  if (!OPEN) return;
  const names = [name].flat();
  const city = apart(places);
  names.forEach((n, k) =>
    label(`${names.length > 1 ? `${id}-${k + 1}` : id} ${n}`, 0, 0, city.length ? { city } : {}),
  );
}
export function exhibitsOf(id, name, places) {
  if (!OPEN) return [];
  if (id in IN_PLACE) {
    for (const p of places) label(`${id} ${name}`, ...ahead(p, IN_PLACE[id]));
    return [];
  }
  const keyed = places.map(({ x, z, heading, ...rest }) => [JSON.stringify(rest), rest]);
  const variants = new Map(places.length ? keyed : [["{}", {}]]); // one, keeping to no place
  return [...variants].map(([key, rest], k) => {
    const city = apart(places.filter((_, i) => keyed[i][0] === key));
    const more = city.length ? { city } : {}; // no pins without places
    const number = variants.size > 1 ? `${id}-${k + 1}` : id;
    const named = rest.group ? rest.group[0].toUpperCase() + rest.group.slice(1) : name;
    const text = `${number} ${named}`;
    const museum = { ...rest, museum: true };
    const fixed = AT[id]?.[k];
    if (fixed || id.startsWith("V")) {
      const at = { ...museum, ...(fixed ?? spot(SPOTS.findIndex((_, s) => !taken.has(s)))) };
      label(text, ...ahead(at, AHEAD), more);
      return at;
    }
    const layout = LAYOUT[id] ?? ZOO[rest.group];
    if (!layout) {
      const at = place(SCENE_FROM + scenes++ * SCENE, SCENES_ROW, museum);
      label(text, at.x, at.z, more);
      return at;
    }
    const [west, south, below] = layout;
    const across = rest.group ? west : west - k * 18; // a kind's variants on eastwards
    const { x, z } = SCENES.at(across, south + below);
    label(text, x, z, more);
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
// and the circling helicopter too: up to 360 m away).
const REACH = 400;
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

// A ferry across the Rhine south of the serpent, as src/ferries.js's LANDINGS (the left bank's
// landing first), without a name, so not among the city's names.
export const FERRY = [null, [47.578274, 7.583051], [47.578247, 7.585851]];

// The plates to its overview (src/main.js), for all labels' pins and for the graffiti test.
if (OPEN) {
  label("Museum", 0, 0, { size: 9, home: true });
  label("Pins All on / off", 0, 0, { all: true, size: 6 });
  label("Graffiti Test", 0, 0, { graffiti: true, size: 6 });
}

// The labels (LABELS) as plates flat over the ground (ground(x, z): the height there; settle),
// drawn before it, square to north (unturned): on dark, in white, the id (all up to the first
// space) in letters LETTER metres high (size times, if it has one), below it the rest, if any,
// half as high; readable from the south, sharp also seen aslant (anisotropy: the renderer's most).
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
// Canvas px of the id's letters, the name's and the margin: two thirds of 96, 48, 32, so less than
// half the memory (all labels about 13 MB, not 29), their size in metres the same (LETTER).
const [BIG, SMALL, PAD] = [64, 32, 21];
export function createLabels(ground, anisotropy) {
  const group = new THREE.Group();
  for (const { text, x, z, city, all, home, graffiti, size = 1 } of LABELS) {
    const [id, name = ""] = text.split(/ (.*)/); // the rest, if any
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const fonts = [`700 ${BIG}px Inter, sans-serif`, `500 ${SMALL}px Inter, sans-serif`];
    const widths = [id, name].map((line, k) => {
      context.font = fonts[k];
      return context.measureText(line).width;
    });
    [canvas.width, canvas.height] = [
      Math.ceil(Math.max(...widths)) + 2 * PAD,
      BIG + (name ? SMALL : 0) + 2 * PAD,
    ];
    context.fillStyle = "#1d242b";
    context.beginPath();
    context.roundRect(0, 0, canvas.width, canvas.height, PAD);
    context.fill();
    context.fillStyle = "#fff";
    context.textAlign = "center";
    context.textBaseline = "top";
    context.font = fonts[0];
    context.fillText(id, canvas.width / 2, name ? PAD * 0.75 : PAD); // alone, in the middle
    context.font = fonts[1];
    context.fillText(name, canvas.width / 2, PAD * 0.75 + BIG);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    const metre = (LETTER / BIG) * size; // per canvas px
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
    mesh.position.set(x, 0, z);
    settle(mesh, ground);
    mesh.userData = { text, city, all, home, graffiti };
    group.add(mesh);
  }
  return group;
}
