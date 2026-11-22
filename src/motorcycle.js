// Sport motorcycles: a red front fairing, tank and raised tail, a dark engine and frame between
// the wheels, flat wide tyres on gold five-spoke rims, a silver exhaust; driven as in
// src/drive.js, leaning into turns, with a crouched rider in black leathers while driven.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part, profile } from "./parts.js";
import { createDriving } from "./drive.js";

const AXLES = 1.4; // metres between them
// Front, back: radius and width in metres.
const WHEELS = [
  { radius: 0.33, width: 0.13 },
  { radius: 0.36, width: 0.24 },
];
// Radians a wheel is shown turning per frame at most: turning faster, its tread stripes (15°
// apart) would seem to stand or turn back, as wheels in films.
const SPIN = 0.06;
const LEAN = 0.3; // radians it leans at most, steering fully at speed
const UPRIGHT = 8; // metres per second below which it leans less, the slower the less
// Radians the front rises while speeding up: from WHEELIE at a standstill down to LIFT at
// WHEELIE_UNTIL metres per second and beyond.
const WHEELIE = 0.15;
const LIFT = 0.04;
const WHEELIE_UNTIL = 20;
const SPEC = {
  max: 50,
  back: 6,
  accelerate: 22,
  brake: 60,
  roll: 12,
  steer: 0.4,
  grip: 300,
  spin: 0,
  react: 7,
  axles: AXLES,
  half: 1.05,
  width: 0.8,
};

// One per place ({ x, y, z, heading }), each { group, material, update, half }; they share their
// geometries and all materials but their own (so one is highlighted alone). boost(position): how
// much larger to draw one far away; world: as for createDriving (src/drive.js).
export function createMotorcycles(places, boost, world) {
  const RED = 0xd8141e;
  const WHITE = 0xf2f2f2;
  const DARK = 0x1b1d22;
  const ENGINE = 0x3a3e45;
  const METAL = 0xb8bcc2;
  const GOLD = 0xd9a520;
  // A box w × h × d at p, tilted about x by angle (radians; positive turns +y towards +z).
  const box = ([w, h, d], color, p, angle = 0) =>
    part(new THREE.BoxGeometry(w, h, d).rotateX(angle), color, p);
  const side = (points, width, color) => part(profile(points, width), color, [0, 0, 0]);
  const bike = mergeGeometries([
    // Front fairing, pointed, under a dark windscreen; its lower edge above the front wheel.
    side(
      [
        [0.4, 0.62],
        [0.55, 0.98],
        [0.74, 1.04],
        [1.02, 0.84],
        [0.98, 0.72],
        [0.6, 0.72],
      ],
      0.5,
      RED,
    ),
    box([0.14, 0.03, 0.4], RED, [0, 2 * WHEELS[0].radius + 0.03, AXLES / 2]), // mudguard
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
      box([0.04, 0.06, 0.64], DARK, [x * 0.15, 0.41, -0.4], -0.23), // swingarm, outside the back tyre
      box([0.06, 0.04, 0.12], DARK, [x * 0.24, 1.0, 0.52]), // handlebar
      box([0.06, 0.04, 0.1], METAL, [x * 0.2, 0.42, -0.22]), // foot peg
    ]),
    part(
      new THREE.CylinderGeometry(0.06, 0.075, 0.45, 8).rotateX(Math.PI / 2 + 0.3),
      METAL,
      [0.2, 0.62, -0.62],
    ), // exhaust, rising to the back, beside the back wheel
    // Its opening at the back end: dark inside a rim. The exhaust's axis is tilted 0.3 radians
    // from z, its back end at (0.2, 0.687, -0.835).
    part(
      new THREE.CircleGeometry(0.058, 10).rotateY(Math.PI).rotateX(0.3),
      DARK,
      [0.2, 0.688, -0.838],
    ),
    part(new THREE.TorusGeometry(0.066, 0.012, 4, 10).rotateX(0.3), METAL, [0.2, 0.687, -0.835]),
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
    box([0.2, 0.06, 0.02], 0xffffff, [0, 0.79, 1.005], -0.3),
    box([0.16, 0.04, 0.02], 0xff1a1a, [0, 0.99, -1.025]),
  ]);
  const lampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  // Each a tyre with a flat tread and straight sidewalls round a gold rim with five spokes; stripes
  // across the tread show it turn. Its axis along x.
  const TYRE = 0x15171a;
  const TREAD = 0x50545b;
  const across = (g, color) => part(g.rotateZ(Math.PI / 2), color, [0, 0, 0]); // y axis to x
  // On the side x (-1, 1) of a tyre width wide, facing out.
  const flank = (g, color, x, width) =>
    part(g.rotateY((x * Math.PI) / 2), color, [(x * width) / 2, 0, 0]);
  const tyres = WHEELS.map(({ radius, width }) => {
    const rim = radius - 0.09;
    return mergeGeometries([
      across(new THREE.CylinderGeometry(radius, radius, width, 24, 1, true), TYRE),
      ...[-1, 1].map((x) => flank(new THREE.RingGeometry(rim, radius, 24), TYRE, x, width)),
      part(new THREE.TorusGeometry(rim, 0.015, 4, 24).rotateY(Math.PI / 2), GOLD, [0, 0, 0]),
      across(new THREE.CylinderGeometry(0.045, 0.045, width, 8), METAL),
      ...[...Array(24)].map((_, k) =>
        part(
          new THREE.BoxGeometry(width * 0.9, 0.012, 0.02)
            .translate(0, radius, 0)
            .rotateX((k * Math.PI) / 12),
          TREAD,
          [0, 0, 0],
        ),
      ),
      ...[...Array(5)].map((_, k) =>
        part(
          new THREE.BoxGeometry(0.03, 0.035, rim)
            .translate(0, 0, rim / 2)
            .rotateX((k * 2 * Math.PI) / 5),
          GOLD,
          [0, 0, 0],
        ),
      ),
    ]);
  });
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
      wheel.position.set(0, WHEELS[k].radius, ((k ? -1 : 1) * AXLES) / 2);
      wheel.rotation.order = "YXZ"; // steered, then turning
      model.add(wheel);
      return wheel;
    });
    const driving = createDriving(place, SPEC, world);
    const s = driving.state;
    let lift = 0; // radians the front is up
    let rolled = 0; // s.rolled at the last frame

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
      wheels.forEach((wheel, k) => {
        const turned = (s.rolled - rolled) / WHEELS[k].radius;
        wheel.rotation.x += THREE.MathUtils.clamp(turned, -SPIN, SPIN);
      });
      rolled = s.rolled;
      wheels[0].rotation.y = s.steer;
    }
    update(0, 0, null); // in place before the first frame

    return { group, material, update, half: SPEC.half };
  }
}
