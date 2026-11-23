// The museum on two empty industrial sites in Klybeck, by Novartis, and round them: all one can
// drive or fly oneself (EXHIBITS, placed by src/main.js with the others, so they can be): the
// vehicles on a parking east of the people's site, the dinosaur among them; on the southern site
// the catalog's kinds (exhibitsOf); east of it an airliner and beyond it the Rega's helicopters on
// their pads, the other helicopter circling over them; north of it the jet and the UFO; the boats
// on the Rhine east of it; on the northern site generated passers-by walking round (MUSEUM), a
// track round them for a train (TRACK), a small one for a tram (TRAM), west of them a road the
// generated cars drive (ROAD).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fromWGS84 } from "./geo.js";
import { part } from "./parts.js";

// Whether the museum is open in this browser: all of it is there only then (none of its exhibits,
// courses, passers-by). Its secret switch, a red button (createButton, src/main.js), opens or
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
// ground; the boats on the Rhine.
const [CIRCLE, HIGH] = [40, 50];
const PADS = [
  [47.580308, 7.582358],
  [47.580294, 7.582661],
].map(([lat, lon]) => fromWGS84(lat, lon));
// The parking: bays from the first point of each pair (WGS84) towards the second, lined up (one
// heading, their mean; their middles evenly from the first's to the last's), each with two spots
// a quarter of BAY metres from its middle either way along it (the first ahead): spot(k), the
// k-th, the bays from the south. The catalog's take theirs as in SPOTS_OF, any other the next free.
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
    return [-1, 1].map((side) => ({ x: x + ux * side, z: z + uz * side, heading }));
  });
})();
const taken = new Set();
const spot = (k, more) => (taken.add(k), { ...SPOTS[k], ...more });
const SPOTS_OF = { V1: [2, 3] };
const next = (id, more) => {
  const k = SPOTS_OF[id]?.find((s) => !taken.has(s)) ?? SPOTS.findIndex((_, s) => !taken.has(s));
  return spot(k, more);
};
const ALL = {
  ambulance: [spot(0)],
  fire: [spot(1)],
  quad: [spot(4)],
  xrt: [spot(5)],
  motorcycle: [spot(6), spot(7, { color: 0x7ee000 })],
  tank: [spot(8)],
  drone: [spot(9)],
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
// heading), with the vehicles if one drives it (V), else in a row SCENES metres south of their
// middle, from SCENE_FROM metres west (east negative) on east, SCENE metres apart; in the order
// asked. Each one's label ("id name") over it in LABELS.
const [SCENES, SCENE_FROM, SCENE] = [40, -20, -8];
let scenes = 0;
export const LABELS = [];
export function exhibitsOf(id, name, places) {
  if (!OPEN) return [];
  const variants = new Map(
    places.map(({ x, z, heading, ...rest }) => [JSON.stringify(rest), rest]),
  );
  return [...variants.values()].map((rest) => {
    const at = id.startsWith("V")
      ? next(id, rest)
      : place(SCENE_FROM + scenes++ * SCENE, SCENES, rest);
    LABELS.push({ text: `${id} ${name}`, x: at.x, z: at.z });
    return at;
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
// The people's site: generated passers-by (src/walkers.js) of each kind in turn walking round
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
