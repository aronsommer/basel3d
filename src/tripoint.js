// A regular tetrahedron at the Dreiländereck, each side facing its country with its flag. The
// borders meet in the Rhine (OSM node 14096063577), running towards 21° (France–Germany), 108°
// (Germany–Switzerland) and 201° (France–Switzerland); its sides face 50°, 170° and 290° (compass),
// each its sector's middle within 16°, the Germany–Switzerland edge at 110°.
import * as THREE from "three";

const EDGE = 90; // metres, every edge
const SLANT = (EDGE * Math.sqrt(3)) / 2; // a side's height, from its base's middle to the top
const HIGH = EDGE * Math.sqrt(2 / 3); // the top over the base
const INNER = EDGE / (2 * Math.sqrt(3)); // the base's middle to a base edge's
// A side as [across, up] seen from outside, counter-clockwise.
const SIDE = [
  [-EDGE / 2, 0],
  [EDGE / 2, 0],
  [0, SLANT],
];
const [THIRD, SIXTH] = [SLANT / 3, EDGE / 6];
// The side cut to across from u0 to u1 and up from v0 to v1.
function cut(u0, u1, v0 = 0, v1 = SLANT) {
  let points = SIDE;
  for (const [k, limit, sign] of [
    [0, u0, 1],
    [0, u1, -1],
    [1, v0, 1],
    [1, v1, -1],
  ]) {
    const kept = [];
    points.forEach((p, i) => {
      const q = points[(i + 1) % points.length];
      const [dp, dq] = [(p[k] - limit) * sign, (q[k] - limit) * sign];
      if (dp >= 0) kept.push(p);
      if (dp * dq < 0) kept.push([0, 1].map((j) => p[j] + ((q[j] - p[j]) * dp) / (dp - dq)));
    });
    points = kept;
  }
  return points;
}
// The Swiss cross: CROSS metres high and wide, its arms 6 of its 20 parts wide, round the side's
// middle; the side cut on the cross's lines into 5 × 5 cells, white in the cross, red outside, so
// nothing overlaps.
const CROSS = 0.45 * EDGE;
const ARM = (CROSS * 6) / 20;
const U = [-EDGE / 2, -CROSS / 2, -ARM / 2, ARM / 2, CROSS / 2, EDGE / 2];
const V = [0, THIRD - CROSS / 2, THIRD - ARM / 2, THIRD + ARM / 2, THIRD + CROSS / 2, SLANT];
const SWISS = [];
for (let i = 0; i < 5; i++)
  for (let j = 0; j < 5; j++) {
    const white = (i === 2 && j > 0 && j < 4) || (j === 2 && i > 0 && i < 4);
    SWISS.push([cut(U[i], U[i + 1], V[j], V[j + 1]), white ? 0xffffff : 0xff0000]);
  }
// Each side's compass bearing and its flag: [points, colour].
const SIDES = [
  [
    50,
    [
      [cut(-EDGE / 2, EDGE / 2, 0, THIRD), 0xffcc00],
      [cut(-EDGE / 2, EDGE / 2, THIRD, 2 * THIRD), 0xff0000],
      [cut(-EDGE / 2, EDGE / 2, 2 * THIRD), 0x000000],
    ],
  ],
  [170, SWISS],
  [
    290,
    [
      [cut(-EDGE / 2, -SIXTH), 0x000091],
      [cut(-SIXTH, SIXTH), 0xffffff],
      [cut(SIXTH, EDGE / 2), 0xe1000f],
    ],
  ],
];
const MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

// The tetrahedron with its base's middle at x, y, z; without a bottom.
export function createTripoint(x, y, z) {
  const [positions, colors] = [[], []];
  const c = new THREE.Color();
  for (const [bearing, flag] of SIDES) {
    const [s, k] = [Math.sin((bearing * Math.PI) / 180), Math.cos((bearing * Math.PI) / 180)];
    // Its base's middle, the right as seen from outside, towards the top.
    const base = new THREE.Vector3(x + INNER * s, y, z - INNER * k);
    const right = new THREE.Vector3(-k, 0, -s);
    const up = new THREE.Vector3(-INNER * s, HIGH, INNER * k).divideScalar(SLANT);
    const at = ([u, v]) => base.clone().addScaledVector(right, u).addScaledVector(up, v);
    for (const [points, colour] of flag)
      for (let i = 1; i < points.length - 1; i++)
        for (const p of [points[0], points[i], points[i + 1]]) {
          positions.push(...at(p).toArray());
          colors.push(...c.set(colour).toArray());
        }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geometry, MATERIAL);
}
