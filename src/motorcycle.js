// Sport motorcycles: a red front fairing, tank and raised tail, a dark engine and frame between
// the wheels, silver rims and exhaust; driven as in src/drive.js, leaning into turns, with a
// crouched rider in black leathers while driven.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part, profile } from "./parts.js";
import { createDriving } from "./drive.js";

const AXLES = 1.4; // metres between them
const WHEEL = 0.31; // radius in metres
const LEAN = 0.3; // radians it leans at most, steering fully at speed
const UPRIGHT = 8; // metres per second below which it leans less, the slower the less
// Radians the front rises while speeding up: from WHEELIE at a standstill down to LIFT at
// WHEELIE_UNTIL metres per second and beyond.
const WHEELIE = 0.15;
const LIFT = 0.04;
const WHEELIE_UNTIL = 20;
const SPEC = {
  max: 50,
  back: 3,
  accelerate: 22,
  brake: 60,
  roll: 8,
  steer: 0.4,
  grip: 300,
  react: 7,
  axles: AXLES,
  half: 1.05,
  width: 0.8,
};

// One per place ({ x, y, z, heading }), each { group, material, update }; they share their
// geometries and all materials but their own (so one is highlighted alone). boost(position): how
// much larger to draw one far away; world: as for createDriving (src/drive.js).
export function createMotorcycles(places, boost, world) {
  const RED = 0xd8141e;
  const WHITE = 0xf2f2f2;
  const DARK = 0x1b1d22;
  const ENGINE = 0x3a3e45;
  const METAL = 0xb8bcc2;
  // A box w × h × d at p, tilted about x by angle (radians; positive turns +y towards +z).
  const box = ([w, h, d], color, p, angle = 0) =>
    part(new THREE.BoxGeometry(w, h, d).rotateX(angle), color, p);
  const side = (points, width, color) => part(profile(points, width), color, [0, 0, 0]);
  const bike = mergeGeometries([
    // Front fairing, its nose low and pointed, under a dark windscreen.
    side(
      [
        [0.42, 0.6],
        [0.55, 0.98],
        [0.74, 1.04],
        [1.0, 0.8],
        [0.94, 0.58],
        [0.7, 0.48],
      ],
      0.5,
      RED,
    ),
    box([0.34, 0.03, 0.3], DARK, [0, 1.06, 0.84], 1.0), // windscreen
    side(
      [
        [-0.1, 0.86],
        [0.12, 1.0],
        [0.45, 1.03],
        [0.56, 0.9],
        [0.3, 0.72],
        [-0.05, 0.72],
      ],
      0.42,
      RED,
    ), // tank
    // The raised tail with a white stripe, open below to show the back wheel.
    side(
      [
        [-1.02, 1.02],
        [-0.45, 0.93],
        [-0.12, 0.88],
        [-0.12, 0.8],
        [-0.55, 0.82],
        [-1.02, 0.96],
      ],
      0.26,
      RED,
    ),
    box([0.27, 0.02, 0.5], WHITE, [0, 0.97, -0.72], 0.17), // stripe on the tail
    box([0.3, 0.06, 0.52], DARK, [0, 0.92, -0.36], -0.08), // seat
    box([0.32, 0.36, 0.52], ENGINE, [0, 0.5, 0.06]), // engine
    box([0.36, 0.08, 0.5], DARK, [0, 0.31, 0.12]), // belly pan
    box([0.1, 0.08, 0.7], DARK, [0, 0.82, 0.1], 0.35), // frame
    ...[-1, 1].flatMap((x) => [
      box([0.04, 0.7, 0.05], METAL, [x * 0.09, 0.66, 0.63], -0.4), // fork
      box([0.04, 0.06, 0.64], DARK, [x * 0.12, 0.38, -0.4], -0.23), // swingarm
      box([0.06, 0.04, 0.12], DARK, [x * 0.24, 1.0, 0.52]), // handlebar
      box([0.06, 0.04, 0.1], METAL, [x * 0.2, 0.42, -0.22]), // foot peg
    ]),
    part(
      new THREE.CylinderGeometry(0.06, 0.075, 0.45, 8).rotateX(Math.PI / 2 + 0.3),
      METAL,
      [0.15, 0.6, -0.62],
    ), // exhaust, rising to the back
  ]);
  // The rider, crouched over the tank, from hips to hands; each limb runs between its joints.
  const rider = mergeGeometries([
    box([0.34, 0.58, 0.2], DARK, [0, 1.135, -0.1], 0.87), // body
    box([0.3, 0.12, 0.3], RED, [0, 0.95, -0.3]), // hips
    part(new THREE.IcosahedronGeometry(0.15, 1), WHITE, [0, 1.43, 0.24]), // helmet
    box([0.2, 0.07, 0.04], DARK, [0, 1.43, 0.38]), // visor
    ...[-1, 1].flatMap((x) => [
      box([0.09, 0.09, 0.46], DARK, [x * 0.22, 1.18, 0.31], 0.56), // arm
      box([0.14, 0.14, 0.44], DARK, [x * 0.165, 0.875, -0.09], 0.26), // thigh
      box([0.11, 0.45, 0.11], DARK, [x * 0.185, 0.66, -0.04], 0.79), // shin
      box([0.1, 0.08, 0.2], DARK, [x * 0.2, 0.47, -0.16]), // boot
    ]),
  ]);
  // Head and tail light, unlit so they glow.
  const lamps = mergeGeometries([
    box([0.2, 0.07, 0.02], 0xffffff, [0, 0.76, 0.975], -0.5),
    box([0.16, 0.04, 0.02], 0xff1a1a, [0, 0.99, -1.025]),
  ]);
  const lampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  // Front narrower than back, each with a silver rim.
  const tyres = [0.12, 0.19].map((width) =>
    mergeGeometries([
      part(
        new THREE.CylinderGeometry(WHEEL, WHEEL, width, 16).rotateZ(Math.PI / 2),
        DARK,
        [0, 0, 0],
      ),
      part(
        new THREE.CylinderGeometry(0.2, 0.2, width + 0.01, 10).rotateZ(Math.PI / 2),
        METAL,
        [0, 0, 0],
      ),
    ]),
  );
  return places.map(createOne);

  function createOne(place) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // group follows the road (and the camera it), model leans in it.
    const group = new THREE.Group();
    group.rotation.order = "YXZ"; // heading first, then pitch
    const model = new THREE.Group();
    const driver = new THREE.Mesh(rider, material);
    model.add(new THREE.Mesh(bike, material), new THREE.Mesh(lamps, lampMaterial), driver);
    group.add(model);
    // Front, back.
    const wheels = tyres.map((tyre, k) => {
      const wheel = new THREE.Mesh(tyre, material);
      wheel.position.set(0, WHEEL, ((k ? -1 : 1) * AXLES) / 2);
      wheel.rotation.order = "YXZ"; // steered, then turning
      model.add(wheel);
      return wheel;
    });
    const driving = createDriving(place, SPEC, world);
    const s = driving.state;
    let lift = 0; // radians the front is up

    // Driven by input (createDriving), else in its place, upright and without its rider.
    function update(seconds, dt, input) {
      driving.step(dt, input);
      // Leaning into the turn as far as it steers, so both go together; positive to the right.
      model.rotation.z = -s.turn * LEAN * Math.min(1, Math.max(0, s.speed) / UPRIGHT);
      // Speeding up, the front rises about where the back wheel stands, most from a standstill.
      const rising = input?.climb > 0 && s.speed >= 0 && s.speed < SPEC.max;
      const rise = THREE.MathUtils.lerp(WHEELIE, LIFT, Math.min(1, s.speed / WHEELIE_UNTIL));
      lift = input ? lift + ((rising ? rise : 0) - lift) * Math.min(1, dt * 8) : 0;
      model.rotation.x = -lift;
      model.position.set(0, (Math.sin(lift) * AXLES) / 2, ((Math.cos(lift) - 1) * AXLES) / 2);
      group.position.set(s.x, s.y, s.z);
      group.rotation.set(s.pitch, s.heading, 0);
      group.scale.setScalar(boost(group.position));
      driver.visible = !!input;
      for (const wheel of wheels) wheel.rotation.x = s.rolled / WHEEL;
      wheels[0].rotation.y = s.steer;
    }
    update(0, 0, null); // in place before the first frame

    return { group, material, update };
  }
}
