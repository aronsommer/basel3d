// Basel's four ferries across the Rhine, which have no engine: each hangs by a rope from a pulley
// running on a cable high over the river between two masts, upstream of the ferry, and with its
// bow turned towards the other bank the current pushes it over. Each crosses from bank to bank and
// back for ever, resting at each landing.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part } from "./parts.js";
import { baselstab } from "./baselstab.js";

// [name, Grossbasel landing, Kleinbasel landing, masts?] as [latitude, longitude], the landings
// from OSM (route=ferry); masts [Grossbasel, Kleinbasel] where they stand, each else (null) OUT
// beyond its landing and UP upstream.
const LANDINGS = [
  ["St. Johann-Fähre Ueli", [47.569383, 7.583405], [47.569397, 7.586203]], // way 24519494
  [
    "Klingental-Fähre Vogel Gryff",
    [47.561946, 7.58647],
    [47.56266, 7.588467],
    [
      [47.561777, 7.586579],
      [47.562567, 7.588781],
    ],
  ], // way 24872915
  ["Münster-Fähre Leu", [47.557029, 7.593011], [47.558103, 7.59436]], // way 170862718
  [
    "St. Alban-Fähre Wild Maa",
    [47.555279, 7.602624],
    [47.556772, 7.602338],
    [null, [47.556925, 7.602575]],
  ], // way 25400030
];
const UP = 20; // metres the cable runs upstream of the ferry's line
const HIGH = 16; // metres the cable is above the water at its masts, at least
const ABOVE = 6; // and above the ground there
const SAG = 2; // metres the cable hangs down in its middle
const PIECES = 16; // straight pieces of a cable
const OUT = 8; // metres the masts stand beyond the landings
// Metres short of the landings (OSM's, at the water's edge) the ferry rests, at least, and further
// out while the bank under its side there is more than HIDE above the water (it would hide it).
const IN = 3;
const HIDE = 0.3;
const SPEED = 1.5; // metres per second crossing, on average
const REST = 15; // seconds at each landing
const TURN = 0.45; // radians the bow turns towards the other bank halfway over
const BOW = [0, 0.46, 7]; // where the rope holds the ferry, on its deck
const LATE = 41; // seconds each ferry is ahead of the one before

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const DARK = 0x202224;
const WHITE = 0xf2f2f0;
// The hull from above ([x, z], bow along +z): a square stern, a long pointed bow.
const PLAN = [
  [-1.5, -7],
  [1.5, -7],
  [1.7, -5],
  [1.7, 2],
  [0, 8],
  [-1.7, 2],
  [-1.7, -5],
];
// A flat shape of PLAN, laid down (extruded high metres up when high is given).
const flat = (high) => {
  const shape = new THREE.Shape(PLAN.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = high
    ? new THREE.ExtrudeGeometry(shape, { depth: high, bevelEnabled: false })
    : new THREE.ShapeGeometry(shape);
  return g.rotateX(-Math.PI / 2);
};
// As on the photo of the St. Johann ferry: a long low hull, black below and a band of black and
// white stripes all round, a deck, a hut of varnished wood at the stern with a round window and a
// name plate on each side, under an arched light roof, and the Basel flag on a pole in front of
// it; the waterline at y = 0.
const BOAT = mergeGeometries([
  part(flat(0.75), DARK, [0, -0.3, 0]), // hull
  part(flat(), 0xa07850, [0, 0.46, 0]), // deck
  // The band: pieces of about 0.8 m along each side, black and white in turn.
  ...PLAN.flatMap(([x0, z0], k) => {
    const [x1, z1] = PLAN[(k + 1) % PLAN.length];
    const long = Math.hypot(x1 - x0, z1 - z0);
    const count = Math.round(long / 0.8);
    return [...Array(count)].map((_, j) => {
      const t = (j + 0.5) / count;
      return part(
        box(0.06, 0.36, long / count).rotateY(Math.atan2(x1 - x0, z1 - z0)),
        j % 2 ? DARK : WHITE,
        [x0 + (x1 - x0) * t, 0.26, z0 + (z1 - z0) * t],
      );
    });
  }),
  part(box(3, 1.8, 5.6), 0xb0602a, [0, 1.36, -3.9]), // hut
  part(box(2.2, 1.5, 0.04), DARK, [0, 1.25, -1.09]), // its door, open
  ...[-1, 1].flatMap((side) => [
    part(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 12).rotateZ(Math.PI / 2), DARK, [
      side * 1.5,
      1.6,
      -5.2,
    ]), // round window
    part(box(0.04, 0.35, 1.2), WHITE, [side * 1.5, 1.6, -3.2]), // name plate
  ]),
  part(
    new THREE.CylinderGeometry(1.75, 1.75, 6.2, 10, 1, false, -Math.PI / 2, Math.PI)
      .rotateX(-Math.PI / 2) // its round side up
      .scale(1, 0.3, 1),
    0xd9d9d4,
    [0, 2.26, -3.9],
  ), // roof
  part(box(0.08, 1, 1), DARK, [0, 0.2, -7.3]), // rudder
  part(box(0.07, 3.6, 0.07), WHITE, [0.9, 2.2, -0.9]), // flagpole
  part(box(0.02, 0.6, 0.9), WHITE, [0.9, 3.65, -1.36]), // flag
  // The Baselstab on both its sides: seen from +x its hook is towards the pole, from -x mirrored,
  // as through the cloth.
  ...[1, -1].map((side) =>
    part(baselstab(0.48).rotateY((side * Math.PI) / 2), DARK, [0.9 + side * 0.012, 3.41, -1.36]),
  ),
]);
const STEEL = 0x50565b;
// The pulley running on the cable (along +z), its top on it: red, square, with a white Swiss
// cross on each side.
const PULLEY = mergeGeometries([
  part(box(0.25, 0.6, 0.6), 0xd52b1e, [0, -0.3, 0]),
  ...[-1, 1].flatMap((side) => [
    part(box(0.02, 0.375, 0.1125), WHITE, [side * 0.13, -0.3, 0]),
    part(box(0.02, 0.1125, 0.375), WHITE, [side * 0.13, -0.3, 0]),
  ]),
]);

// The ferries, their masts, cables and ropes in group; each ferry
// { name, mesh, material, a, r, length, at(seconds) }: on the line from its Grossbasel landing a
// (scene x, z) along r (towards Kleinbasel) length metres long, at(seconds) metres from a.
// place(latitude, longitude): scene [x, z]; boost(position): how much wider and higher to draw it
// far away.
export function createFerries(place, heightAt, boost) {
  const group = new THREE.Group();
  const masts = [];
  const cables = [];
  const painted = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const ferries = LANDINGS.map(([name, grossbasel, kleinbasel, standing], i) => {
    const [ax, az] = place(...grossbasel);
    const [bx, bz] = place(...kleinbasel);
    const length = Math.hypot(bx - ax, bz - az);
    const r = { x: (bx - ax) / length, z: (bz - az) / length };
    const up = { x: -r.z, z: r.x }; // upstream: Grossbasel is on the left bank
    const water = heightAt((ax + bx) / 2, (az + bz) / 2);
    const ends = [-OUT, length + OUT].map((p, k) =>
      standing?.[k] ? place(...standing[k]) : [ax + r.x * p + up.x * UP, az + r.z * p + up.z * UP],
    );
    const [[x0, z0], [x1, z1]] = ends;
    const tops = ends.map(([x, z]) => {
      const ground = heightAt(x, z);
      const top = Math.max(water + HIGH, ground + ABOVE);
      const tall = top + 1 - ground;
      masts.push(
        part(new THREE.CylinderGeometry(0.15, 0.3, tall, 8), STEEL, [x, ground + tall / 2, z]),
      );
      return top;
    });
    // The cable at f from the Grossbasel mast (0) to the other (1), sagging.
    const cable = (f, out) =>
      out.set(
        x0 + (x1 - x0) * f,
        tops[0] + (tops[1] - tops[0]) * f - 4 * SAG * f * (1 - f),
        z0 + (z1 - z0) * f,
      );
    const point = new THREE.Vector3();
    for (let k = 0; k < PIECES; k++)
      for (const j of [k, k + 1]) cables.push(...cable(j / PIECES, point).toArray());
    // Where it rests, metres from each landing: its side over the water all along its length.
    const [rest0, rest1] = [0, 1].map((k) => {
      const [lx, lz] = k ? [bx, bz] : [ax, az];
      const s = k ? -1 : 1; // from the landing out over the water
      // Whether the bank hides its side towards the landing, at its stern, middle and bow.
      const hidden = (d) =>
        [PLAN[0][1], 0, PLAN[4][1]].some((u) => {
          const out = s * (d - PLAN[2][0]);
          return heightAt(lx + r.x * out + up.x * u, lz + r.z * out + up.z * u) > water + HIDE;
        });
      let d = IN;
      while (d < length / 2 && hidden(d)) d += 0.5;
      return d;
    });
    // Over after resting, gently away and in, and back again.
    const span = length - rest0 - rest1;
    const cross = span / SPEED;
    const cycle = 2 * (REST + cross);
    const ease = THREE.MathUtils.smoothstep;
    const at = (seconds) => {
      const t = (seconds + i * LATE) % cycle;
      return rest0 + span * (ease(t, REST, REST + cross) - ease(t, 2 * REST + cross, cycle));
    };
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = new THREE.Mesh(BOAT, material);
    const pulley = new THREE.Mesh(PULLEY, painted);
    pulley.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    group.add(mesh, pulley);
    // Its place and heading seconds in, its pulley over its bow; returns the rope's ends.
    const [bow, hook] = [new THREE.Vector3(), new THREE.Vector3()];
    const update = (seconds) => {
      const p = at(seconds);
      // Turned the more the faster it goes (1.5 SPEED at most).
      const turn = (TURN * (at(seconds + 0.5) - at(seconds - 0.5))) / (1.5 * SPEED);
      mesh.position.set(ax + r.x * p, water + 0.04 * Math.sin(seconds * 1.3 + i), az + r.z * p);
      mesh.rotation.set(0, Math.atan2(up.x, up.z) + turn, 0.015 * Math.sin(seconds * 1.1 + i));
      const b = boost(mesh.position);
      mesh.scale.set(b, b, 1);
      mesh.updateMatrix();
      bow.fromArray(BOW).applyMatrix4(mesh.matrix);
      const over =
        ((bow.x - x0) * (x1 - x0) + (bow.z - z0) * (z1 - z0)) / ((x1 - x0) ** 2 + (z1 - z0) ** 2);
      cable(THREE.MathUtils.clamp(over, 0, 1), pulley.position);
      hook.copy(pulley.position).y -= 0.6; // the pulley's bottom
      return [hook, bow];
    };
    return { name, mesh, material, a: { x: ax, z: az }, r, length, at, update };
  });
  const lines = new THREE.LineBasicMaterial({ color: 0x2b2b2b });
  const mastMesh = new THREE.Mesh(mergeGeometries(masts), painted);
  const cableLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(cables, 3),
    ),
    lines,
  );
  // The ropes from the pulleys to the bows, moved every frame.
  const ropeEnds = new THREE.BufferAttribute(new Float32Array(ferries.length * 6), 3);
  const ropes = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", ropeEnds),
    lines,
  );
  ropes.frustumCulled = false; // its bounds are never computed
  group.add(mastMesh, cableLines, ropes);

  const update = (seconds) => {
    ferries.forEach((ferry, i) =>
      ferry.update(seconds).forEach(({ x, y, z }, k) => ropeEnds.setXYZ(2 * i + k, x, y, z)),
    );
    ropeEnds.needsUpdate = true;
  };
  return { group, ferries, update };
}
