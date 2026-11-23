// Sport quads: black fenders and side panels, an orange nose with a black grille over LED
// headlights, an orange tube frame, A-arms and front bumper, white coil shocks, a high handlebar
// with black hand guards, fat balloon tyres on black rims with an orange beadlock ring; driven as
// in src/drive.js, the front wheels steering, the body rolling out of turns, a rider in a white
// jersey, jeans and a poison green helmet.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part, profile } from "./parts.js";
import { createDriving } from "./drive.js";

const AXLES = 1.25; // metres between them
// Front, back: radius, width and x of the middle in metres.
const WHEELS = [
  { radius: 0.3, width: 0.3, x: 0.48 },
  { radius: 0.32, width: 0.36, x: 0.5 },
];
// Radians a wheel is shown turning per frame at most: turning faster, its tread stripes (15°
// apart) would seem to stand or turn back, as wheels in films.
const SPIN = 0.06;
const ROLL = 0.06; // radians the body rolls out of a turn at most, steering fully at speed
const FIRM = 8; // metres per second below which it rolls less, the slower the less
// Radians the front rises while speeding up: from WHEELIE at a standstill down to LIFT at
// WHEELIE_UNTIL metres per second and beyond.
const WHEELIE = 0.1;
const LIFT = 0.02;
const WHEELIE_UNTIL = 15;
const SPEC = {
  max: 28,
  back: 6,
  accelerate: 16,
  brake: 40,
  roll: 8,
  steer: 0.55,
  grip: 120,
  spin: 0,
  react: 8,
  axles: AXLES,
  half: 1.1,
  width: 1.3,
};

// One per place ({ x, y, z, heading }), each { group, material, update, half, width, driver (the
// rider's mesh, hidden; src/main.js shows it) }; they share their geometries and all materials
// but their own (so one is highlighted alone). boost(position): how much larger to draw one far
// away; world: as for createDriving (src/drive.js).
export function createQuads(places, boost, world) {
  const ORANGE = 0xff6a00;
  const BLACK = 0x16181c;
  const ENGINE = 0x3a3e45;
  const METAL = 0xb8bcc2;
  // A box w × h × d at p, tilted about x by angle (radians; positive turns +y towards +z).
  const box = ([w, h, d], color, p, angle = 0) =>
    part(new THREE.BoxGeometry(w, h, d).rotateX(angle), color, p);
  const side = (points, width, color) => part(profile(points, width), color, [0, 0, 0]);
  // A bar or limb t thick from a to b ([x, y, z]), a little past both.
  const limb = (a, b, t, color) => {
    const way = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    return part(
      new THREE.BoxGeometry(t, t, way.length() + t).applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), way.normalize()),
      ),
      color,
      a.map((v, k) => (v + b[k]) / 2),
    );
  };
  const [front, back] = WHEELS;
  const quad = mergeGeometries([
    // Fenders over both front wheels, black, under the orange nose between them.
    side(
      [
        [0.2, 0.66],
        [0.4, 0.8],
        [0.85, 0.76],
        [1.0, 0.62],
        [0.95, 0.56],
        [0.88, 0.64],
        [0.62, 0.68],
        [0.3, 0.62],
      ],
      2 * front.x + front.width,
      BLACK,
    ),
    side(
      [
        [0.15, 0.72],
        [0.42, 0.94],
        [0.72, 0.88],
        [1.06, 0.64],
        [0.98, 0.58],
        [0.5, 0.72],
      ],
      0.5,
      ORANGE,
    ),
    ...[-1, 1].map((x) => box([0.14, 0.02, 0.22], BLACK, [x * 0.11, 0.81, 0.84], 0.62)), // grille
    // Fenders over both back wheels, black with orange stripes.
    side(
      [
        [-1.04, 0.64],
        [-1.0, 0.78],
        [-0.6, 0.8],
        [-0.22, 0.74],
        [-0.18, 0.64],
        [-0.35, 0.68],
        [-0.62, 0.7],
        [-0.94, 0.64],
      ],
      2 * back.x + back.width,
      BLACK,
    ),
    ...[-1, 1].map((x) => box([0.05, 0.015, 0.36], ORANGE, [x * 0.5, 0.81, -0.62])), // stripes
    box([0.38, 0.2, 0.34], BLACK, [0, 0.88, 0.18], -0.2), // tank
    box([0.06, 0.015, 0.3], ORANGE, [0, 0.99, 0.16], -0.2), // stripe on the tank
    box([0.34, 0.1, 0.64], BLACK, [0, 0.88, -0.32]), // seat
    box([0.4, 0.3, 0.46], ENGINE, [0, 0.52, -0.04]), // engine
    box([0.06, 0.06, 0.4], BLACK, [0, 0.98, 0.53], 1.2), // steering column
    box([0.8, 0.04, 0.04], BLACK, [0, 1.16, 0.46]), // handlebar
    box([0.8, 0.05, 0.05], ORANGE, [0, 0.86, -1.02]), // grab bar
    box([0.62, 0.05, 0.05], ORANGE, [0, 0.72, 1.12]), // bumper, top
    box([0.62, 0.05, 0.05], ORANGE, [0, 0.4, 1.06]), // bumper, bottom
    box([0.26, 0.24, 0.03], ORANGE, [0, 0.56, 1.1]), // bumper plate
    ...[-1, 1].flatMap((x) => [
      box([0.08, 0.1, 0.18], BLACK, [x * 0.36, 1.18, 0.53]), // hand guard
      box([0.05, 0.34, 0.05], ORANGE, [x * 0.3, 0.56, 1.1]), // bumper upright
      box([0.04, 0.36, 0.5], BLACK, [x * 0.29, 0.62, 0.02]), // side panel
      box([0.16, 0.04, 0.46], BLACK, [x * 0.31, 0.34, -0.02]), // footboard
      box([0.04, 0.04, 1.5], ORANGE, [x * 0.2, 0.3, 0]), // frame, below
      box([0.04, 0.04, 0.5], ORANGE, [x * 0.2, 0.56, 0.42], -0.8), // frame, up to the nose
      box([0.34, 0.04, 0.06], ORANGE, [x * 0.32, 0.34, AXLES / 2 - 0.08]), // A-arm
      box([0.34, 0.04, 0.06], ORANGE, [x * 0.32, 0.44, AXLES / 2 + 0.08]), // A-arm
      part(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 8).rotateZ(x * 0.5), 0xf2f2f2, [
        x * 0.32,
        0.56,
        AXLES / 2,
      ]), // shock
      box([0.06, 0.06, 0.62], BLACK, [x * 0.26, 0.4, -AXLES / 2 + 0.25], 0.12), // swingarm
    ]),
    // Two exhausts, rising to the back, their tops just under the back fender, each fed by a pipe
    // from the engine; an opening at the back end, dark inside a rim. Each one's axis is tilted
    // 0.25 radians from z, its front end at y 0.473, z -0.642, its back end at y 0.585, z -1.078.
    ...[-1, 1].flatMap((x) => [
      limb([x * 0.15, 0.5, -0.25], [x * 0.15, 0.473, -0.642], 0.045, METAL),
      part(new THREE.CylinderGeometry(0.055, 0.065, 0.45, 8).rotateX(Math.PI / 2 + 0.25), METAL, [
        x * 0.15,
        0.529,
        -0.86,
      ]),
      part(new THREE.CircleGeometry(0.052, 10).rotateY(Math.PI).rotateX(0.25), BLACK, [
        x * 0.15,
        0.586,
        -1.081,
      ]),
      part(new THREE.TorusGeometry(0.058, 0.012, 4, 10).rotateX(0.25), METAL, [
        x * 0.15,
        0.585,
        -1.078,
      ]),
    ]),
  ]);
  // The rider, sitting up and leaning a little forward, from hips to hands; each limb runs between
  // its joints.
  // A white jersey, jeans, black gloves and boots, a poison green helmet.
  const JERSEY = 0xf2f2f2;
  const TROUSERS = 0x41618f;
  const rider = mergeGeometries([
    box([0.36, 0.6, 0.22], JERSEY, [0, 1.28, -0.15], 0.35), // body
    box([0.32, 0.14, 0.3], TROUSERS, [0, 0.98, -0.25]), // hips
    part(new THREE.IcosahedronGeometry(0.15, 1), 0x7ee000, [0, 1.7, 0]), // helmet
    box([0.2, 0.07, 0.04], BLACK, [0, 1.7, 0.14]), // visor
    ...[-1, 1].flatMap((x) => [
      limb([x * 0.2, 1.51, -0.06], [x * 0.33, 1.16, 0.44], 0.09, JERSEY), // arm, shoulder to grip
      box([0.1, 0.1, 0.1], BLACK, [x * 0.33, 1.16, 0.46]), // glove
      box([0.14, 0.14, 0.38], TROUSERS, [x * 0.19, 0.99, -0.05]), // thigh
      box([0.11, 0.6, 0.11], TROUSERS, [x * 0.24, 0.7, 0.06], 0.2), // shin
      box([0.1, 0.08, 0.22], BLACK, [x * 0.26, 0.4, 0.04]), // boot
    ]),
  ]);
  // Head and tail lights, unlit so they glow.
  const lamps = mergeGeometries(
    [-1, 1].flatMap((x) => [
      box([0.16, 0.012, 0.06], 0xffffff, [x * 0.15, 0.71, 0.98], 0.62),
      box([0.1, 0.04, 0.02], 0xff1a1a, [x * 0.3, 0.72, -1.03]),
    ]),
  );
  const lampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  // Each a balloon tyre with stripes across its tread round a black rim with an orange beadlock
  // ring. Its axis along x.
  const TYRE = 0x15171a;
  const across = (g, color) => part(g.rotateZ(Math.PI / 2), color, [0, 0, 0]); // y axis to x
  // On the side x (-1, 1) of a tyre width wide, facing out.
  const flank = (g, color, x, width) =>
    part(g.rotateY((x * Math.PI) / 2), color, [(x * width) / 2, 0, 0]);
  const tyres = WHEELS.map(({ radius, width }) => {
    const rim = radius - 0.13;
    return mergeGeometries([
      across(new THREE.CylinderGeometry(radius, radius, width, 20, 1, true), TYRE),
      ...[-1, 1].map((x) => flank(new THREE.RingGeometry(rim, radius, 20), TYRE, x, width)),
      ...[-1, 1].map((x) => flank(new THREE.CircleGeometry(rim, 12), BLACK, x, width * 0.8)),
      ...[-1, 1].map((x) =>
        flank(new THREE.RingGeometry(rim * 0.7, rim, 12), ORANGE, x, width * 0.8 + 0.01),
      ),
      // Stripes across the tread, to show it turn.
      ...[...Array(24)].map((_, k) =>
        part(
          new THREE.BoxGeometry(width * 0.9, 0.012, 0.02)
            .translate(0, radius, 0)
            .rotateX((k * Math.PI) / 12),
          0x50545b,
          [0, 0, 0],
        ),
      ),
    ]);
  });
  return places.map(createOne);

  function createOne(place) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // group follows the road (and the camera it), model rolls and rises in it.
    const group = new THREE.Group();
    group.rotation.order = "YXZ"; // heading first, then pitch
    const model = new THREE.Group();
    const driver = new THREE.Mesh(rider, material);
    model.add(new THREE.Mesh(quad, material), new THREE.Mesh(lamps, lampMaterial), driver);
    group.add(model);
    // Front left, front right, back left, back right.
    const wheels = WHEELS.flatMap(({ radius, x }, k) =>
      [-1, 1].map((s) => {
        const wheel = new THREE.Mesh(tyres[k], material);
        wheel.position.set(s * x, radius, ((k ? -1 : 1) * AXLES) / 2);
        wheel.rotation.order = "YXZ"; // steered, then turning
        model.add(wheel);
        return wheel;
      }),
    );
    const driving = createDriving(place, SPEC, world);
    const s = driving.state;
    let lift = 0; // radians the front is up
    let rolled = 0; // s.rolled at the last frame

    // Driven by input (createDriving), else in its place, level.
    function update(seconds, dt, input) {
      driving.step(dt, input);
      // Rolling out of the turn as far as it steers; positive to the right.
      model.rotation.z = s.turn * ROLL * Math.min(1, Math.max(0, s.speed) / FIRM);
      // Speeding up, the front rises about where the back wheels stand, most from a standstill.
      const rising = input?.climb > 0 && s.speed >= 0 && s.speed < SPEC.max;
      const rise = THREE.MathUtils.lerp(WHEELIE, LIFT, Math.min(1, s.speed / WHEELIE_UNTIL));
      lift = input ? lift + ((rising ? rise : 0) - lift) * Math.min(1, dt * 8) : 0;
      model.rotation.x = -lift;
      model.position.set(0, (Math.sin(lift) * AXLES) / 2, ((Math.cos(lift) - 1) * AXLES) / 2);
      group.position.set(s.x, s.y, s.z);
      group.rotation.set(s.pitch, s.heading, 0);
      group.scale.setScalar(boost(group.position));
      wheels.forEach((wheel, k) => {
        const turned = (s.rolled - rolled) / WHEELS[k >> 1].radius;
        wheel.rotation.x += THREE.MathUtils.clamp(turned, -SPIN, SPIN);
        if (k < 2) wheel.rotation.y = s.steer;
      });
      rolled = s.rolled;
    }
    update(0, 0, null); // in place before the first frame

    driver.visible = false;
    return { group, material, update, half: SPEC.half, width: SPEC.width, driver };
  }
}
