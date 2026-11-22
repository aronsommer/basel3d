// The Basiliskbrunnen, Basel's dark green cast-iron drinking fountains: water runs from a spout on
// a column into a round basin, and on top stands a basilisk holding the Basel shield.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part } from "./parts.js";
import { baselstab } from "./baselstab.js";

// [latitude, longitude]: the fountains named "Basilisk" in the canton's list of fountains
// (data.bs.ch, dataset 100008, Industrielle Werke Basel), and the last from OSM.
export const BASILISKS = [
  [47.560565, 7.597712], // Riehentorstrasse / Hammerstrasse
  [47.560455, 7.571721], // Colmarerstrasse / Hegenheimerstrasse
  [47.568648, 7.594851], // Bläsiring / Hammerstrasse
  [47.533288, 7.597043], // Bruderholzallee / Fritz Hauser-Strasse
  [47.549583, 7.606486], // Hardstrasse / Grellingerstrasse
  [47.55428, 7.582628], // Eulerstrasse / Leimenstrasse
  [47.550931, 7.580011], // Steinenring 46
  [47.566649, 7.592701], // Feldbergstrasse / Mülheimerstrasse
  [47.575791, 7.588828], // Kleinhüningerstrasse / Klybeckstrasse
  [47.563151, 7.588496], // Unterer Rheinweg / Klingentalgraben
  [47.567261, 7.586427], // Unterer Rheinweg / Oetlingerstrasse
  [47.575122, 7.60117], // Freiburgerstrasse / Wieseufer
  [47.568291, 7.561497], // Burgfelderstrasse / Waldighoferstrasse
  [47.567982, 7.573991], // Entenweidstrasse / Gasstrasse
  [47.533786, 7.58739], // Bruderholzallee / Oberer Batterieweg
  [47.558276, 7.597035], // Theodorskirchplatz 7 (Hof Waisenhaus)
  [47.547857, 7.598811], // St. Jakobs-Strasse / Sevogelstrasse
  [47.562003, 7.597269], // Hammerstrasse / Clarahofweg
  [47.546448, 7.606817], // Engelgasse / St. Alban-Ring
  [47.562179, 7.585499], // Totentanz / St. Johanns-Vorstadt
  [47.576851, 7.591596], // Wiesenplatz / Färberstrasse
  [47.558946, 7.59313], // Oberer Rheinweg / Reverenzgässlein
  [47.568577, 7.583245], // Elsässerrheinweg
  [47.5724, 7.576339], // Elsässerstrasse / Hüningerstrasse
  [47.556574, 7.588625], // Gerbergasse / Rüdengasse
  [47.564369, 7.569092], // Burgfelderstrasse, by the Kannenfeldpark
  [47.574199, 7.608441], // Tierpark Lange Erlen
  [47.551436, 7.574856], // Schützenmattpark
  [47.563197, 7.592379], // Klingentalstrasse
  [47.557028, 7.602375], // Schaffhauserrheinweg / Fischerweg (moved off the road)
  [47.560175, 7.610139], // OSM node 6764846014
];

const GREEN = 0x1f7a45;
const WATER = 0x9cc8e0;
const BRASS = 0xc9a23a;
const BLACK = 0x111111;
// Measured on a photo of one straight from the front, scaled so its rim is at drinking height.
const SLAB = 0.12; // metres the stone slab is high
const RIM = SLAB + 0.937; // metres up the basin's rim
const LEVEL = SLAB + 0.9; // and its water
const H = 0.51; // metres the basilisk is high, its wings' tips
const AT = new THREE.Vector3(0, RIM + 0.05, -0.37); // the middle of its foot, on its plinth
const TURN = -0.6; // radians its head is turned to its right
// The basilisk's parts are given in H from the middle of its foot, its head's turned by TURN.
const figure = (geometry, color, [x, y, z], turn = 0) =>
  part(geometry.translate(x, y, z).rotateY(turn).scale(H, H, H), color, AT.toArray());
const head = (geometry, color, at) => figure(geometry, color, at, TURN);
// A shape ([x, y] points) made a slab thick deep along +z.
const slab = (points, deep) =>
  new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))), {
    depth: deep,
    bevelEnabled: false,
  });
// A cone (radius, long) pointing along direction, its middle at.
const UP = new THREE.Vector3(0, 1, 0);
const pointing = (radius, long, direction) =>
  new THREE.ConeGeometry(radius, long, 5).applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()),
  );
// Its right wing from the shoulder: a bat's wing spread up and out, scalloped below.
const WING = [
  [0, 0.06],
  [0.1, 0.26],
  [0.24, 0.36],
  [0.33, 0.34],
  [0.34, 0.2],
  [0.32, 0.02],
  [0.26, 0.05],
  [0.21, -0.04],
  [0.15, 0],
  [0.09, -0.1],
  [0.03, -0.06],
];
// Its tail, from its back down round its foot in almost two turns.
const TAIL = new THREE.CatmullRomCurve3(
  [...Array(21)].map((_, k) => {
    const t = k / 20;
    const [a, r] = [Math.PI + t * 3.5 * Math.PI, 0.12 - 0.02 * t];
    return new THREE.Vector3(r * Math.sin(a), 0.4 - 0.3 * Math.sqrt(t), r * Math.cos(a));
  }),
);
// Its beak open from where it joins the head (JAW): the upper half a little up, the lower down,
// and between them the brass spout, from inside the head out a little down; where its water
// leaves it.
const JAW = new THREE.Vector3(0, 0.862, 0.09);
const UPPER = new THREE.Vector3(0, 0.2, 0.98);
const LOWER = new THREE.Vector3(0, -0.34, 0.94);
const SPOUT_DIRECTION = new THREE.Vector3(0, -0.2, 0.98).normalize();
const SPOUT_LENGTH = 0.22;
const SPOUT_START = JAW.clone().addScaledVector(SPOUT_DIRECTION, -0.02);
const SPOUT_END = SPOUT_START.clone()
  .addScaledVector(SPOUT_DIRECTION, SPOUT_LENGTH)
  .applyAxisAngle(UP, TURN)
  .multiplyScalar(H)
  .add(AT);
const FALL = SPOUT_END.y - LEVEL; // metres down to the water
// One fountain, facing +z, about 1.6 m high, as on photos of them: on a stone slab a cast-iron
// foot with steps, a stem, a vase and a cup carry a wide round basin, white inside, with a dog's
// bowl low at the side; on a plinth on the back of its rim stands the basilisk (after a scan of
// the one at the Hauensteinerstrasse) on a square foot with its tail coiled round it, holding the
// Basel shield before it (a white oval with the black Baselstab), its bat's wings spread as wide
// as it is high, its head turned to the side, eyes white with black pupils, the beak open and the
// water running from the brass spout in it onto a grating that reaches from the plinth across the
// basin.
const FOUNTAIN = mergeGeometries([
  part(new THREE.BoxGeometry(0.6, SLAB, 0.6), 0xb9b5ab, [0, SLAB / 2, 0]), // stone slab
  part(new THREE.BoxGeometry(0.35, 0.063, 0.35), GREEN, [0, SLAB + 0.032, 0]), // iron foot
  // Its steps, stem, vase, cup and the basin, round, from [radius, metres above the slab].
  part(
    new THREE.LatheGeometry(
      [
        [0.146, 0.063],
        [0.146, 0.11],
        [0.119, 0.11],
        [0.119, 0.138],
        [0.051, 0.15],
        [0.051, 0.21],
        [0.071, 0.21],
        [0.071, 0.245],
        [0.067, 0.25],
        [0.1, 0.33],
        [0.123, 0.443],
        [0.087, 0.494],
        [0.095, 0.494],
        [0.095, 0.546],
        [0.055, 0.57],
        [0.095, 0.62],
        [0.17, 0.62],
        [0.17, 0.668],
        [0.237, 0.668],
        [0.33, 0.7],
        [0.42, 0.76],
        [0.431, 0.84],
        [0.459, 0.88],
        [0.462, RIM - SLAB],
        [0.43, RIM - SLAB],
        [0.425, LEVEL - SLAB],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      16,
    ),
    GREEN,
    [0, SLAB, 0],
  ),
  part(new THREE.CircleGeometry(0.425, 16).rotateX(-Math.PI / 2), 0xdfe9ea, [0, LEVEL, 0]),
  part(new THREE.CylinderGeometry(0.083, 0.05, 0.06, 10), GREEN, [0.17, SLAB + 0.07, 0.05]), // dog's bowl
  part(new THREE.CircleGeometry(0.07, 10).rotateX(-Math.PI / 2), WATER, [0.17, SLAB + 0.101, 0.05]),
  part(new THREE.BoxGeometry(0.16, 0.05, 0.16), GREEN, [0, RIM + 0.025, AT.z]), // basilisk's plinth
  // The grating: a frame with a bar along its middle, on the rim, from the plinth.
  ...[-0.1, 0, 0.1].map((x) =>
    part(new THREE.BoxGeometry(0.02, 0.02, 0.42), GREEN, [x, RIM - 0.01, -0.08]),
  ),
  ...[-0.29, 0.13].map((z) =>
    part(new THREE.BoxGeometry(0.22, 0.02, 0.02), GREEN, [0, RIM - 0.01, z]),
  ),
  part(new THREE.BoxGeometry(0.015, FALL, 0.015), WATER, [
    SPOUT_END.x,
    SPOUT_END.y - FALL / 2,
    SPOUT_END.z,
  ]), // the water from the spout
  figure(new THREE.BoxGeometry(0.26, 0.07, 0.26), GREEN, [0, 0.035, 0]), // foot
  figure(new THREE.TubeGeometry(TAIL, 32, 0.028, 5), GREEN, [0, 0, 0]),
  // What the tail coils round, from the foot up under the body, so nothing hangs in the air.
  figure(new THREE.CylinderGeometry(0.09, 0.1, 0.38, 10), GREEN, [0, 0.26, 0]),
  figure(
    slab(
      [
        [-0.1, 0.6],
        [0.1, 0.6],
        [0.1, 0.35],
        [0, 0.2],
        [-0.1, 0.35],
      ],
      0.03,
    ),
    GREEN,
    [0, 0, 0.1],
  ), // shield
  figure(new THREE.CircleGeometry(0.065, 12).scale(1, 1.3, 1), 0xe8e4d8, [0, 0.43, 0.132]),
  figure(baselstab(0.13), BLACK, [0, 0.365, 0.134]),
  ...[-1, 1].map((side) =>
    figure(new THREE.BoxGeometry(0.04, 0.08, 0.05), GREEN, [side * 0.05, 0.6, 0.1]),
  ), // claws on the shield
  figure(new THREE.IcosahedronGeometry(0.11, 1).scale(1, 1.5, 1), GREEN, [0, 0.6, -0.02]), // body
  figure(new THREE.CylinderGeometry(0.05, 0.07, 0.18, 6).rotateX(0.3), GREEN, [0, 0.78, 0.02]), // neck
  head(new THREE.IcosahedronGeometry(0.06).scale(1, 0.9, 1.3), GREEN, [0, 0.88, 0.05]),
  head(
    pointing(0.03, 0.12, UPPER),
    GREEN,
    JAW.clone()
      .addScaledVector(UPPER, 0.06)
      .add(new THREE.Vector3(0, 0.012, 0))
      .toArray(),
  ), // upper beak
  head(
    pointing(0.022, 0.09, LOWER),
    GREEN,
    JAW.clone()
      .addScaledVector(LOWER, 0.045)
      .add(new THREE.Vector3(0, -0.012, 0))
      .toArray(),
  ), // lower beak
  head(new THREE.BoxGeometry(0.03, 0.06, 0.04), GREEN, [0, 0.8, 0.08]), // wattle
  head(new THREE.BoxGeometry(0.025, 0.11, 0.12), GREEN, [0, 0.96, 0.02]), // comb
  ...[-1, 1].flatMap((side) => [
    head(new THREE.IcosahedronGeometry(0.016), 0xffffff, [side * 0.05, 0.9, 0.09]),
    head(new THREE.IcosahedronGeometry(0.008), BLACK, [side * 0.063, 0.9, 0.095]), // pupil
  ]), // eyes
  head(
    new THREE.CylinderGeometry(0.015, 0.015, SPOUT_LENGTH, 6).applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(UP, SPOUT_DIRECTION),
    ),
    BRASS,
    SPOUT_START.clone()
      .addScaledVector(SPOUT_DIRECTION, SPOUT_LENGTH / 2)
      .toArray(),
  ), // spout
  // Its wings, as wide as it is high, swept back a little; the left one the right one turned round.
  ...[0.35, Math.PI - 0.35].map((turn, k) =>
    figure(slab(WING, 0.015).scale(1.35, 1, 1).rotateY(turn), GREEN, [
      k ? -0.06 : 0.06,
      0.66,
      -0.06,
    ]),
  ),
]);

// All in one mesh, each at its place ({ x, y, z } on the ground) facing heading (radians from
// +z towards +x).
export function createBasilisks(places) {
  const mesh = new THREE.InstancedMesh(
    FOUNTAIN,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    places.length,
  );
  const matrix = new THREE.Matrix4();
  places.forEach(({ x, y, z, heading }, k) =>
    mesh.setMatrixAt(k, matrix.makeRotationY(heading).setPosition(x, y, z)),
  );
  return mesh;
}
