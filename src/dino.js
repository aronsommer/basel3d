// The long-necked dinosaur of the Merian Gärten, low-poly: a heavy body on four column legs, a
// long neck rising steeply to a small head and a long tail ending in a thin whip curled up; driven
// as in src/drive.js, walking with its legs in diagonal pairs, its head turning where it goes and
// its tail swaying; not ridden, it flees from traffic as the animals do (src/people.js).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part } from "./parts.js";
import { createDriving } from "./drive.js";
import { createFlight } from "./people.js";

const SKIN = 0xa8a27e;
const BELLY = 0xc4bd98;
const STRIDE = 8; // metres walked per step cycle
// Radians its legs swing at most while it walks, eased to it (or to straight, standing) EASE times
// a second; fleeing, it goes FLEE times as fast as the animals.
const [SWING, EASE, FLEE] = [0.45, 6, 2];
const SPEC = {
  max: 18,
  back: 2,
  accelerate: 9,
  brake: 30, // it walks: stops at once, not rolling on
  roll: 30,
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
const ROUND = 12; // sides round its neck, tail and legs
// Its head's parts, merged, tilted nose down and moved to its place; where its jaw turns (at the
// jaw's back, up in the skull); the jaw OPEN radians open, CHEW more or less as it chews, CHEWS
// radians a second.
const headed = (parts) => mergeGeometries(parts).rotateX(0.2).translate(0, 17.5, 11.1);
const HINGE = new THREE.Vector3(0, -0.4, -0.6)
  .applyEuler(new THREE.Euler(0.2, 0, 0))
  .add(new THREE.Vector3(0, 17.5, 11.1));
const [OPEN, CHEW, CHEWS] = [0.2, 0.08, 1.4]; // never quite shut
// Its neck from deep in its body up to its head, its tail from deep in its body out to the whip's
// end, each [y, z, radius] along its middle (so neither ends in a flat face at the body).
const NECK_LINE = [
  [5.6, 1.5, 1.3],
  [6.5, 3.5, 1.1],
  [8.4, 5.4, 1],
  [10.3, 6.9, 0.88],
  [12.2, 8.1, 0.76],
  [14, 9, 0.65],
  [15.8, 9.7, 0.55],
  [17.4, 10.3, 0.45],
];
const TAIL_LINE = [
  [5.4, -1.5, 1.3],
  [5.6, -4, 1.1],
  [5, -6.5, 0.82],
  [4.6, -9, 0.55],
  [4.15, -11.5, 0.38],
  [3.85, -14, 0.22],
  [4, -15.6, 0.14],
  [4.6, -16.5, 0.08],
  [5.8, -17, 0.05],
  [7, -17.2, 0.04], // the whip
];
const HIP = 4.6; // metres up where the legs turn
// Front left, front right, back left, back right: [x, z, radius].
const LEGS = [
  [1.2, 2.3, 0.65],
  [-1.2, 2.3, 0.65],
  [1.25, -2.2, 0.75],
  [-1.25, -2.2, 0.75],
];

// A tapering cylinder from one point to another (radius r0 to r1), with a ball at its end so
// bends close, as many sides round (ROUND) as the ball.
const along = new THREE.Vector3(0, 1, 0);
function limb(from, to, r0, r1, color) {
  const [a, b] = [new THREE.Vector3(...from), new THREE.Vector3(...to)];
  const turn = new THREE.Quaternion().setFromUnitVectors(along, b.clone().sub(a).normalize());
  return [
    part(
      new THREE.CylinderGeometry(r1, r0, a.distanceTo(b), ROUND).applyQuaternion(turn),
      color,
      a.clone().add(b).multiplyScalar(0.5).toArray(),
    ),
    part(new THREE.SphereGeometry(r1, ROUND, ROUND / 2), color, to),
  ];
}
// Limbs along these points in its middle ([y, z, radius] each), bending gently.
const chain = (points, color) =>
  points
    .slice(1)
    .flatMap(([y, z, r], i) =>
      limb([0, ...points[i].slice(0, 2)], [0, y, z], points[i][2], r, color),
    );
// Parts merged and moved so that pivot is their origin.
const around = (parts, [x, y, z]) => mergeGeometries(parts).translate(-x, -y, -z);

// One dinosaur per place ({ x, y, z, heading }), each { group, material, update, half, width };
// boost and world as for the police cars (src/police.js); danger: what it flees from
// (createFlight).
export function createDinos(places, boost, world, danger) {
  const flee = createFlight(places.length, danger, FLEE);
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
        16,
      )
        .rotateX(Math.PI / 2)
        .scale(0.85, 0.95, 1),
      (y) => (y < -0.8 ? BELLY : SKIN),
      [0, 5.4, 0],
    ),
  ]);
  const neck = around(
    [
      ...chain(NECK_LINE, SKIN),
      // Its head: the skull and eyes on its sides.
      headed([
        part(new THREE.BoxGeometry(0.8, 0.85, 2), SKIN, [0, 0, 0]),
        ...[-1, 1].map((x) =>
          part(new THREE.BoxGeometry(0.1, 0.15, 0.15), 0x161616, [x * 0.4, 0.2, 0.25]),
        ), // eyes
      ]),
    ],
    NECK,
  );
  // Its lower jaw, under the skull, ending a little behind its tip, a tongue on it; turning at HINGE
  // (its origin), from the neck's.
  const jaw = headed([
    part(new THREE.BoxGeometry(0.7, 0.3, 1.35), BELLY, [0, -0.5, 0.025]),
    part(new THREE.BoxGeometry(0.6, 0.02, 1.1), 0xb0504a, [0, -0.355, 0.05]), // tongue
  ]).translate(...HINGE.clone().negate().toArray());
  const tail = around(chain(TAIL_LINE, SKIN), TAIL);
  const legs = LEGS.map(([x, z, r]) =>
    around(
      [
        part(new THREE.CylinderGeometry(r, r * 1.1, HIP + 0.4, ROUND), SKIN, [
          x,
          (HIP + 0.4) / 2,
          z,
        ]),
        part(new THREE.CylinderGeometry(r * 1.3, r * 1.35, 0.3, ROUND), BELLY, [x, 0.15, z]), // foot
      ],
      [x, HIP, z],
    ),
  );

  return places.map((place, k) => {
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
    const chewing = new THREE.Mesh(jaw, material);
    chewing.position.subVectors(HINGE, new THREE.Vector3(...NECK));
    head.add(chewing);
    const whip = at(tail, TAIL);
    const columns = legs.map((leg, k) => at(leg, [LEGS[k][0], HIP, LEGS[k][1]]));
    const driving = createDriving(place, SPEC, world);
    const s = driving.state;
    // Metres walked fleeing; as walked by the last frame; its legs' swing.
    let [fled, last, swing] = [0, 0, 0];

    // Driven by input (createDriving), else in its place, or off it while it flees, on the ground
    // there, facing its way; its neck and tail sway a little.
    function update(seconds, dt, input) {
      driving.step(dt, input);
      const off = input ? null : flee(k, s.x, s.y, s.z, dt, SPEC.half);
      if (off) {
        const [x, z] = [s.x + off[0], s.z + off[1]];
        fled += Math.hypot(x - group.position.x, z - group.position.z);
        group.position.set(x, world.ground(x, z, s.y), z);
        group.rotation.set(0, off[2], 0);
      } else {
        group.position.set(s.x, s.y, s.z);
        group.rotation.set(s.pitch, s.heading, 0);
      }
      group.scale.setScalar(boost(group.position));
      const walked = s.rolled + fled;
      const step = (2 * Math.PI * walked) / STRIDE;
      // Front left with back right, front right with back left; straight while it stands.
      const moving = dt && walked !== last;
      swing += ((moving ? SWING : 0) - swing) * Math.min(1, EASE * dt);
      last = walked;
      columns.forEach((leg, k) => {
        leg.rotation.x = swing * Math.sin(step + (k === 0 || k === 3 ? 0 : Math.PI));
      });
      head.rotation.set(0.03 * Math.sin(0.5 * seconds), 0.35 * s.turn, 0);
      chewing.rotation.x = OPEN + CHEW * Math.sin(CHEWS * seconds);
      whip.rotation.y = 0.12 * Math.sin(0.6 * seconds) + 0.1 * Math.sin(step);
    }
    update(0, 0, null); // in place before the first frame
    return { group, material, update, half: SPEC.half, width: SPEC.width };
  });
}
