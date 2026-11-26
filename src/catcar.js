// The cat car, measured from its Unity model (CatCar.fbx): a golden body on four wide black
// tyres, each with grey blocks across its tread and a grey hub outside, big yellow eyes with
// black pupils and a magenta nose, both unlit as there, two ears and a long tail that curls up
// and back every TAIL_LOOP seconds (its "Tail" clip); driven as in src/drive.js,
// low and nimble, the front wheels steering.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { MAGENTA } from "./lines.js";
import { TYRE, part } from "./parts.js";
import { createDriving } from "./drive.js";

const GOLD = 0xca982a; // the body texture's mean
const AXLES = 2; // metres between them
const WHEEL = { radius: 0.3, width: 0.4, x: 1.1, hub: 0.13 };
// Blocks across the tread, each LUG radians wide and LUG_HIGH metres out of the tyre, up to its
// radius.
const LUGS = 8;
const LUG = 0.3;
const LUG_HIGH = 0.04;
// Radians a wheel is shown turning per frame at most: 0.3 of the blocks' spacing, well short of
// half, where they would seem to stand or turn back, as wheels in films.
const SPIN = (0.6 * Math.PI) / LUGS;
// The body: an icosphere round its middle, each of its corners (in IcosahedronGeometry's order)
// RADII centimetres out, as far as the model's body there before it is stretched STRETCH times.
const BODY = [0, 0.65, 0];
const STRETCH = [1.762, 0.894, 3.134];
// prettier-ignore
const RADII = [
  47, 42, 46, 42, 47, 43, 48, 45, 49, 39, 40, 41, 38, 38, 38, 43, 40, 39, 38, 43, 40, 39, 43, 42,
  46, 49, 47, 47, 49, 52, 52, 52, 52, 52, 50, 51, 53, 53, 49, 54, 54, 50, 54, 52, 53, 51, 53, 54,
  51, 54, 53, 47, 42, 40, 38, 47, 43, 41, 48, 45, 50, 39, 39, 44, 49, 41, 43, 49, 46, 49, 52, 53,
  56, 56, 55, 60, 61, 61, 61, 61, 58, 53, 49, 46, 47, 51, 47, 46, 51, 48, 53, 49, 53, 53, 51, 50,
  54, 54, 52, 54, 53, 61, 57, 58, 60, 60, 56, 53, 49, 58, 56, 49, 56, 49, 55, 54, 57, 56, 53, 54,
  58, 55, 57, 57, 55, 55, 57, 58, 58, 58, 57, 57, 61, 61, 57, 51, 61, 58, 51, 55, 52, 61, 56, 54,
  56, 54, 53, 43, 44, 39, 60, 56, 56, 57, 61, 58, 49, 47, 46, 51, 53, 52,
];
// The tail: an ellipsoid of these half sizes, its middle at TAIL_AT, straight back; in three
// pieces at its joints (metres forward of its middle, its bones 27, 24 and 27 long), the first
// fixed in the body, each next bending up BENDS radians and back every TAIL_LOOP seconds.
const TAIL = [0.074, 0.1, 0.7];
const TAIL_AT = [0, 0.776, -1.77];
const JOINTS = [0.213, -0.22];
const BENDS = [0.82, 0.77];
const TAIL_LOOP = 2;
// In a turn, steering fully at speed, the body leans out ROLL radians and turns into it YAW
// radians, the tail swings out SWING radians (as far as its "Tailshake" clip wags); from FIRM
// metres per second down, the slower the less.
const ROLL = 0.07;
const YAW = 0.1;
const SWING = 0.56;
const FIRM = 8;
const SPEC = {
  max: 25,
  back: 8,
  accelerate: 16,
  brake: 45,
  roll: 5,
  steer: 0.5,
  grip: 350,
  spin: 0,
  react: 10,
  axles: AXLES,
  half: 1.45,
  width: 2 * WHEEL.x + WHEEL.width,
};

// The body's icosphere, each corner moved out to its radius.
const body = () => {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  const corners = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(4)).join();
    if (!corners.has(key)) corners.set(key, corners.size);
    const r = RADII[corners.get(key)] / 100;
    p.setXYZ(i, p.getX(i) * r, p.getY(i) * r, p.getZ(i) * r);
  }
  return g;
};
// The right ear's outline across (x, y), its foot deep in the body, 0.042 m thick, its tip
// leaning forward.
const EAR = [
  [0.068, 0.748],
  [0.138, 0.944],
  [0.23, 1.095],
  [0.368, 1.218],
  [0.503, 1.108],
  [0.592, 0.968],
  [0.679, 0.749],
];
const ear = (side) =>
  new THREE.ExtrudeGeometry(
    new THREE.Shape(EAR.map(([x, y]) => new THREE.Vector2(side * x, y - 0.75))),
    { depth: 0.042, bevelEnabled: false },
  )
    .rotateX(0.175)
    .translate(0, 0.75, 0.5);

// A part's normals: smooth across its shared corners (as in Unity) or flat.
const smooth = (g) => {
  const merged = mergeVertices(g);
  merged.computeVertexNormals();
  return merged.toNonIndexed();
};
const flat = (g) => {
  g.computeVertexNormals();
  return g;
};

// One per place ({ x, y, z, heading }), each { group, material, update, half, width }; they share
// their geometries and all materials but their own (so one is highlighted alone). boost(position):
// how much larger to draw one far away; world: as for createDriving (src/drive.js).
export function createCatCars(places, boost, world) {
  // The tail's piece from u to v (metres forward of its middle, along z) and a ball filling the
  // joint at u, round its middle.
  const [tx, ty, tz] = TAIL;
  const across = (u) => Math.sqrt(Math.max(0, 1 - (u / tz) ** 2)); // of the half sizes at u
  const piece = (u, v) =>
    smooth(
      part(
        new THREE.LatheGeometry(
          Array.from({ length: 9 }, (_, k) => {
            const w = u + ((v - u) * k) / 8;
            return new THREE.Vector2(ty * across(w), w);
          }),
          10,
        )
          .rotateX(Math.PI / 2)
          .scale(tx / ty, 1, 1),
        GOLD,
        [0, 0, 0],
      ),
    );
  const ball = (u) =>
    smooth(
      part(
        new THREE.SphereGeometry(1, 10, 8).scale(tx * across(u), ty * across(u), ty * across(u)),
        GOLD,
        [0, 0, u],
      ),
    );
  const [first, second] = JOINTS;
  const shell = mergeGeometries([
    smooth(part(body().scale(...STRETCH), GOLD, BODY)),
    ...[-1, 1].map((side) => flat(part(ear(side), GOLD, [0, 0, 0]))),
    mergeGeometries([piece(first, tz), ball(first)]).translate(...TAIL_AT),
  ]);
  // The second and third piece, each round its joint.
  const tail = [
    mergeGeometries([piece(second, first), ball(second)]).translate(0, 0, -first),
    piece(-tz, second).translate(0, 0, -second),
  ];
  const sphere = (r, color, at) => part(new THREE.SphereGeometry(r, 12, 8), color, at);
  const face = mergeGeometries([
    sphere(0.143, MAGENTA, [0, 0.684, 1.169]),
    ...[-1, 1].flatMap((x) => [
      sphere(0.245, 0xffff00, [x * 0.343, 0.736, 0.917]),
      sphere(0.136, 0x000000, [x * 0.378, 0.817, 1.068]),
    ]),
  ]);
  const faceMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  // A tyre on the side x (-1, 1), its axis along x, its hub outside.
  const { radius, width, hub } = WHEEL;
  const tyres = [-1, 1].map((x) =>
    flat(
      mergeGeometries([
        part(
          new THREE.CylinderGeometry(radius - LUG_HIGH, radius - LUG_HIGH, width, 24).rotateZ(
            Math.PI / 2,
          ),
          TYRE,
          [0, 0, 0],
        ),
        part(new THREE.CircleGeometry(hub, 18).rotateY((x * Math.PI) / 2), 0xb4b4b4, [
          (x * width) / 2 + x * 0.002,
          0,
          0,
        ]),
        // Each block reaching 0.01 into the tyre.
        ...[...Array(LUGS)].map((_, k) =>
          part(
            new THREE.BoxGeometry(width, LUG_HIGH + 0.01, 2 * radius * Math.sin(LUG / 2))
              .translate(0, radius - (LUG_HIGH + 0.01) / 2, 0)
              .rotateX((k * 2 * Math.PI) / LUGS),
            0x505050,
            [0, 0, 0],
          ),
        ),
      ]),
    ),
  );
  return places.map(createOne);

  function createOne(place) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    // group follows the ground (and the camera it), the body leans and turns in it.
    const group = new THREE.Group();
    group.rotation.order = "YXZ"; // heading first, then pitch
    const body = new THREE.Group();
    body.rotation.order = "YXZ";
    // The tail's second and third piece, each turning at its joint.
    const bends = tail.map((g) => new THREE.Mesh(g, material));
    bends[0].position.set(TAIL_AT[0], TAIL_AT[1], TAIL_AT[2] + first);
    bends[1].position.set(0, 0, second - first);
    bends[0].add(bends[1]);
    body.add(new THREE.Mesh(shell, material), new THREE.Mesh(face, faceMaterial), bends[0]);
    group.add(body);
    // Front left, front right, back left, back right.
    const wheels = [1, -1].flatMap((front) =>
      [1, -1].map((side) => {
        const wheel = new THREE.Mesh(tyres[(side + 1) / 2], material);
        wheel.position.set(side * WHEEL.x, radius, (front * AXLES) / 2);
        wheel.rotation.order = "YXZ"; // steered, then turning
        group.add(wheel);
        return wheel;
      }),
    );
    const driving = createDriving(place, SPEC, world);
    const s = driving.state;
    let rolled = 0; // s.rolled at the last frame

    // Driven by input (createDriving), else in its place; the tail rising and sinking.
    function update(seconds, dt, input) {
      driving.step(dt, input);
      const turning = s.turn * Math.min(1, Math.abs(s.speed) / FIRM); // positive to the left
      body.rotation.set(0, turning * YAW, turning * ROLL);
      const up = Math.abs(Math.sin((Math.PI * seconds) / TAIL_LOOP));
      bends[0].rotation.set(BENDS[0] * up, turning * SWING, 0);
      bends[1].rotation.x = BENDS[1] * up;
      group.position.set(s.x, s.y, s.z);
      group.rotation.set(s.pitch, s.heading, 0);
      group.scale.setScalar(boost(group.position));
      wheels.forEach((wheel, k) => {
        wheel.rotation.x += THREE.MathUtils.clamp((s.rolled - rolled) / radius, -SPIN, SPIN);
        if (k < 2) wheel.rotation.y = s.steer;
      });
      rolled = s.rolled;
    }
    update(0, 0, null); // in place before the first frame

    return { group, material, update, half: SPEC.half, width: SPEC.width };
  }
}
