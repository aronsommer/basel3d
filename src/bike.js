// A girl on a small pink bike riding to and fro along a path, weaving a little and now and then
// pulling a wheelie, her little sister on a blue tricycle after her.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part } from "./parts.js";
import { createCrowd } from "./people.js";

const PINK = 0xff5fa8;
const BLUE = 0x1e88e5;
const GREY = 0xb8b8b8;
const RIDE = 3.5; // metres per second at most, the bike
const TRIKE = 2; // and the tricycle
const STEER = 2; // radians per second, their turning at most
export const PEDAL = 2.5; // radians of the bike's pedals per metre
const WIDE = 1; // metres either side of the path's middle she aims at its ends
const NEAR = 2; // metres from an end where she turns, and from her where the sister stops
const LIFT = 0.45; // radians, the front wheel up in a wheelie
const LOOKS = [
  // Brown long hair.
  {
    skin: 0xf1c7a5,
    hair: 0x5a3418,
    top: 0xb57edc,
    bottom: 0x4a5d7a,
    shoes: 0xffffff,
    head: "long",
  },
  // Rosa trousers, barefoot.
  { skin: 0xf1c7a5, hair: 0x7a4a24, top: 0xffffff, bottom: 0xf8a5c8, shoes: 0xf1c7a5 },
];

// A tube of radius r from one point to another.
const UP = new THREE.Vector3(0, 1, 0);
function tube(from, to, r, color) {
  const [a, b] = [new THREE.Vector3(...from), new THREE.Vector3(...to)];
  const turn = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize());
  const geometry = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 5).applyQuaternion(turn);
  return part(geometry, color, a.add(b).multiplyScalar(0.5).toArray());
}
const box = (w, h, d, color, at) => part(new THREE.BoxGeometry(w, h, d), color, at);
// A wheel of radius r across x = x, its middle at the origin, with two spokes across.
const wheel = (r, x = 0) => [
  part(new THREE.TorusGeometry(r - 0.025, 0.025, 5, 14).rotateY(Math.PI / 2), 0x1d1d1d, [x, 0, 0]),
  box(0.01, 2 * r - 0.05, 0.015, GREY, [x, 0, 0]),
  box(0.01, 0.015, 2 * r - 0.05, GREY, [x, 0, 0]),
];

// Each facing +z, its rear on the ground at the origin: frame, wheels ([geometry, radius, middle])
// and where the rider stands ([y, z], were she standing) to sit on its saddle, with a woman's body
// of size, leaning forward by lean (radians), in pose.
const R = 0.2; // metres, the bike's wheels' radius
const [BIKE_PEDALS, BIKE_SEAT, BIKE_HEAD, BIKE_BAR] = [
  [0, 0.22, 0.3],
  [0, 0.55, 0.14],
  [0, 0.6, 0.62],
  [0, 0.8, 0.6],
];
// The bike's frame in this colour, with a basket or not.
export const bikeFrame = (color, basket) =>
  mergeGeometries([
    tube(BIKE_PEDALS, BIKE_SEAT, 0.022, color),
    tube(BIKE_PEDALS, BIKE_HEAD, 0.025, color),
    tube([0, R, 0], BIKE_PEDALS, 0.015, color),
    tube([0, R, 0], [0, 0.5, 0.16], 0.015, color),
    tube(BIKE_HEAD, [0, R, 0.75], 0.018, color),
    tube(BIKE_HEAD, BIKE_BAR, 0.015, GREY),
    box(0.4, 0.025, 0.025, GREY, BIKE_BAR),
    ...[-1, 1].map((s) => box(0.035, 0.035, 0.035, 0xffffff, [s * 0.2, BIKE_BAR[1], BIKE_BAR[2]])), // grips
    box(0.1, 0.04, 0.2, 0x222222, [0, 0.57, 0.12]), // saddle
    ...(basket ? [box(0.22, 0.14, 0.14, 0xffffff, [0, 0.72, 0.74])] : []),
  ]);
export const BIKE = {
  frame: bikeFrame(PINK, true),
  wheels: [
    [[0, R, 0], R],
    [[0, R, 0.75], R],
  ].map(([at, r]) => [mergeGeometries(wheel(r)), r, at]),
  seat: [0.06, -0.02],
  size: 0.62,
  lean: 0.25,
  pose: "ride",
};
// The tricycle's pedals are on its front wheel, so they turn with it.
const [F, B] = [0.16, 0.1]; // metres, its front and back wheels' radii
const TRIKE_FORK = [0, 0.4, 0.4];
const TRIKE_BAR = [0, 0.43, 0.37];
const TRICYCLE = {
  frame: mergeGeometries([
    tube([0, F, 0.48], TRIKE_FORK, 0.018, BLUE),
    tube(TRIKE_FORK, TRIKE_BAR, 0.015, GREY),
    tube([0, 0.3, 0.44], [0, 0.11, 0.02], 0.025, BLUE),
    tube([0, 0.12, 0.06], [0, 0.27, 0.1], 0.02, BLUE),
    box(0.3, 0.025, 0.025, GREY, TRIKE_BAR),
    ...[-1, 1].map((s) =>
      box(0.035, 0.035, 0.035, 0xffffff, [s * 0.15, TRIKE_BAR[1], TRIKE_BAR[2]]),
    ), // grips
    box(0.12, 0.04, 0.12, 0x222222, [0, 0.29, 0.1]), // saddle
  ]),
  wheels: [
    [
      mergeGeometries([
        ...wheel(F),
        ...[-1, 1].flatMap((s) => [
          box(0.015, 0.07, 0.02, GREY, [s * 0.06, s * 0.035, 0]), // cranks
          box(0.05, 0.02, 0.04, 0x222222, [s * 0.08, s * 0.07, 0]), // pedals
        ]),
      ]),
      F,
      [0, F, 0.48],
    ],
    [
      mergeGeometries([
        ...[-1, 1].flatMap((s) => wheel(B, s * 0.2)),
        box(0.4, 0.02, 0.02, GREY, [0, 0, 0]), // axle
      ]),
      B,
      [0, B, 0],
    ],
  ],
  seat: [-0.093, 0.06],
  size: 0.45,
  lean: 0.1,
  pose: "trike",
};

// The path from one end to the other ([x, z] each); ground(x, z) the height there. { objects,
// update(dt) }.
export function createBike([from, to], ground) {
  const random = (a, b) => a + Math.random() * (b - a);
  const towards = (dx, dz) => Math.atan2(dx, dz);
  const turned = (a) => Math.atan2(Math.sin(a), Math.cos(a)); // into -π…π
  const [ux, uz] = [to[0] - from[0], to[1] - from[1]];
  const length = Math.hypot(ux, uz);
  // A point near an end, either side of the path's middle.
  const near = ([x, z]) => {
    const v = random(-WIDE, WIDE);
    return [x + (uz / length) * v, z - (ux / length) * v];
  };

  // A rider on a vehicle at x, z (its rear), facing heading, at speed, off radians from where she
  // wants to go; lift the front up; her pedals' radians, by gear per metre.
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const [girl, sister] = [BIKE, TRICYCLE].map(({ frame, wheels, seat, size, lean, pose }, k) => {
    const group = new THREE.Group();
    group.rotation.order = "YXZ"; // heading first, then pitch and wheelie
    group.add(new THREE.Mesh(frame, material));
    const spinning = wheels.map(([geometry, r, at]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...at);
      group.add(mesh);
      return [mesh, r];
    });
    const crowd = createCrowd("woman", 1, false); // she rides, she does not flee
    crowd.dress(0, LOOKS[k], pose);
    crowd.mesh.frustumCulled = false; // she moves
    group.add(crowd.mesh);
    const back = k * 1.5; // metres behind the start
    return {
      group,
      wheels: spinning,
      crowd,
      seat,
      size,
      lean,
      base: Math.max(...wheels.map(([, , at]) => at[2])), // metres to the front wheel's middle
      gear: k ? 1 / F : PEDAL,
      x: from[0] - (ux / length) * back,
      z: from[1] - (uz / length) * back,
      heading: towards(ux, uz),
      speed: 0,
      off: 0,
      lift: 0,
      pedals: 0,
    };
  });
  // Turns r towards aim (radians) and moves her on at up to top, slowing down to turn.
  function ride(r, aim, top, dt) {
    r.off = turned(aim - r.heading);
    r.heading += THREE.MathUtils.clamp(r.off, -STEER * dt, STEER * dt);
    r.speed += (top * Math.max(0.35, Math.cos(r.off)) - r.speed) * Math.min(1, 1.5 * dt);
    const step = r.speed * dt;
    r.x += Math.sin(r.heading) * step;
    r.z += Math.cos(r.heading) * step;
    r.pedals += step * r.gear;
    for (const [mesh, radius] of r.wheels) mesh.rotation.x += step / radius;
    // Pitched as the ground under its rear and front wheels.
    const y = ground(r.x, r.z);
    const ahead = ground(r.x + Math.sin(r.heading) * r.base, r.z + Math.cos(r.heading) * r.base);
    r.group.position.set(r.x, y, r.z);
    r.group.rotation.set(-r.lift - Math.atan2(ahead - y, r.base), r.heading, 0);
    r.crowd.place(0, 0, ...r.seat, 0, r.pedals, r.size, r.lean);
  }

  let target = near(to);
  let [end, wheelie, time] = [1, 0, 0]; // the end she goes to (0 from, 1 to); seconds
  return {
    objects: [girl.group, sister.group],
    update(dt) {
      time += dt;
      if (Math.hypot(target[0] - girl.x, target[1] - girl.z) < NEAR) {
        end = 1 - end;
        target = near(end ? to : from);
      }
      // Weaving a little on the way; going straight and fast, now and then up on the rear wheel
      // for a while.
      const aim = towards(target[0] - girl.x, target[1] - girl.z) + 0.25 * Math.sin(0.9 * time);
      if ((wheelie -= dt) < 0 && Math.abs(girl.off) < 0.2 && girl.speed > 0.8 * RIDE)
        if (Math.random() < 0.15 * dt) wheelie = random(1, 2.5);
      const up = wheelie > 0 ? LIFT + 0.05 * Math.sin(7 * time) : 0;
      girl.lift += (up - girl.lift) * Math.min(1, 4 * dt);
      ride(girl, aim, RIDE, dt);

      // The sister after her, stopping when close.
      const [dx, dz] = [girl.x - sister.x, girl.z - sister.z];
      ride(sister, towards(dx, dz), Math.hypot(dx, dz) > NEAR ? TRIKE : 0, dt);
    },
  };
}
