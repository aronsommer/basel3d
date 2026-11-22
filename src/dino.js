// The long-necked dinosaur of the Merian Gärten, low-poly: a heavy body on four column legs, a
// long neck rising steeply to a small head and a long tail ending in a thin whip curled up; driven
// as in src/drive.js, walking with its legs in diagonal pairs, its head turning where it goes and
// its tail swaying.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part } from "./parts.js";
import { createDriving } from "./drive.js";

const SKIN = 0xa8a27e;
const BELLY = 0xc4bd98;
const STRIDE = 8; // metres walked per step cycle
const SPEC = {
  max: 18,
  back: 2,
  accelerate: 9,
  brake: 8,
  roll: 4,
  steer: 0.6,
  grip: 30,
  spin: 0.4,
  react: 4,
  axles: 4.5,
  half: 4.5,
  width: 3.2,
};
const NECK = [0, 6.5, 3.5]; // where neck, tail and legs turn, metres
const TAIL = [0, 5.6, -4];
const HIP = 4.6; // metres up where the legs turn
// Front left, front right, back left, back right: [x, z, radius].
const LEGS = [
  [1.2, 2.3, 0.65],
  [-1.2, 2.3, 0.65],
  [1.25, -2.2, 0.75],
  [-1.25, -2.2, 0.75],
];

// A tapering cylinder from one point to another (radius r0 to r1), with a ball at its end so
// bends close.
const along = new THREE.Vector3(0, 1, 0);
function limb(from, to, r0, r1, color) {
  const [a, b] = [new THREE.Vector3(...from), new THREE.Vector3(...to)];
  const turn = new THREE.Quaternion().setFromUnitVectors(along, b.clone().sub(a).normalize());
  return [
    part(
      new THREE.CylinderGeometry(r1, r0, a.distanceTo(b), 7).applyQuaternion(turn),
      color,
      a.clone().add(b).multiplyScalar(0.5).toArray(),
    ),
    part(new THREE.SphereGeometry(r1, 7, 5), color, to),
  ];
}
// Parts merged and moved so that pivot is their origin.
const around = (parts, [x, y, z]) => mergeGeometries(parts).translate(-x, -y, -z);

// One dinosaur per place ({ x, y, z, heading }), each { group, material, update, half }; boost and
// world as for the police cars (src/police.js).
export function createDinos(places, boost, world) {
  const body = mergeGeometries([
    part(
      new THREE.LatheGeometry(
        [
          [0, -4.6],
          [1.6, -3.6],
          [2.3, -1.5],
          [2.4, 0.5],
          [2, 2.8],
          [1.3, 4],
          [0, 4.4],
        ].map(([r, z]) => new THREE.Vector2(r, z)),
        10,
      )
        .rotateX(Math.PI / 2)
        .scale(0.85, 0.95, 1),
      (y) => (y < -0.8 ? BELLY : SKIN),
      [0, 5.4, 0],
    ),
  ]);
  const neck = around(
    [
      ...limb(NECK, [0, 11.9, 8], 1.1, 0.7, SKIN),
      ...limb([0, 11.9, 8], [0, 17.4, 10.3], 0.7, 0.45, SKIN),
      part(new THREE.BoxGeometry(0.8, 0.85, 2).rotateX(0.2), SKIN, [0, 17.5, 11.1]), // head
      part(new THREE.BoxGeometry(0.7, 0.45, 0.9).rotateX(0.2), BELLY, [0, 17.1, 12.1]), // snout
      ...[-1, 1].map((x) =>
        part(new THREE.BoxGeometry(0.1, 0.15, 0.15), 0x161616, [x * 0.4, 17.75, 11.3]),
      ), // eyes
    ],
    NECK,
  );
  const tail = around(
    [
      ...limb(TAIL, [0, 4.6, -9], 1.1, 0.55, SKIN),
      ...limb([0, 4.6, -9], [0, 3.8, -14], 0.55, 0.22, SKIN),
      ...limb([0, 3.8, -14], [0, 4.6, -16.5], 0.22, 0.08, SKIN),
      ...limb([0, 4.6, -16.5], [0, 7, -17.2], 0.08, 0.04, SKIN), // the whip
    ],
    TAIL,
  );
  const legs = LEGS.map(([x, z, r]) =>
    around(
      [
        part(new THREE.CylinderGeometry(r, r * 1.1, HIP + 0.4, 8), SKIN, [x, (HIP + 0.4) / 2, z]),
        part(new THREE.CylinderGeometry(r * 1.3, r * 1.35, 0.3, 8), BELLY, [x, 0.15, z]), // foot
      ],
      [x, HIP, z],
    ),
  );

  return places.map((place) => {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const group = new THREE.Group();
    group.rotation.order = "YXZ"; // heading first, then pitch
    const at = (geometry, [x, y, z]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };
    at(body, [0, 0, 0]);
    const head = at(neck, NECK);
    const whip = at(tail, TAIL);
    const columns = legs.map((leg, k) => at(leg, [LEGS[k][0], HIP, LEGS[k][1]]));
    const driving = createDriving(place, SPEC, world);
    const s = driving.state;

    // Driven by input (createDriving), else in its place; its neck and tail sway a little.
    function update(seconds, dt, input) {
      driving.step(dt, input);
      group.position.set(s.x, s.y, s.z);
      group.rotation.set(s.pitch, s.heading, 0);
      group.scale.setScalar(boost(group.position));
      const step = (2 * Math.PI * s.rolled) / STRIDE;
      // Front left with back right, front right with back left.
      columns.forEach((leg, k) => {
        leg.rotation.x = 0.45 * Math.sin(step + (k === 0 || k === 3 ? 0 : Math.PI));
      });
      head.rotation.set(0.03 * Math.sin(0.5 * seconds), 0.35 * s.turn, 0);
      whip.rotation.y = 0.12 * Math.sin(0.6 * seconds) + 0.1 * Math.sin(step);
    }
    update(0, 0, null); // in place before the first frame

    return { group, material, update, half: SPEC.half };
  });
}
