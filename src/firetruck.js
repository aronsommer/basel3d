// Basel's turntable ladder, a Mercedes Econic with a Rosenbauer L32A-XS: red, a yellow band low
// along the sides and under the windscreen, silver roller shutters, 118 on the back, the ladder
// lying forward over the cab with its basket in front, a firefighter in it; blue lights flash in
// turn. Driven as in src/drive.js; switched to its ladder (input.stop), it stops, puts out its
// outriggers, raises the ladder and extends it, the camera drawing back to see it all; then the
// steering turns the ladder and extends it, and fire sprays water from the basket. Switched back, it
// takes all in before it drives on.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { glow, part, profile } from "./parts.js";
import { createDriving } from "./drive.js";

const WIDTH = 2.5; // metres
const HALF = 5; // metres from the middle to the front
const BACK = 4; // metres from the middle to the back
const CAB = 2.35; // metres from the middle to the cab's back
const CAB_TOP = 2.95; // metres up
const BODY_TOP = 2.3; // metres up
const WHEEL = 0.5; // radius in metres
const AXLES = [3.6, -1]; // metres from the middle, front and back
const SPEC = {
  max: 25,
  back: 6,
  accelerate: 7,
  brake: 35,
  roll: 4,
  steer: 0.6,
  grip: 250,
  spin: 0,
  react: 8,
  axles: AXLES[0] - AXLES[1],
  half: HALF,
  width: WIDTH,
};
// The ladder: on the turntable at TURNTABLE (z), SECTIONS sections LENGTH metres long, each
// reaching OVERLAP metres into the one below, from its heel at PIVOT ([y, z]) raised to ELEVATION,
// out to START of all at first, then taken in or out by REACH of all a second, turned by TURN radians a
// second; turned back HOME times as fast.
const TURNTABLE = -2.9;
const SECTIONS = 4;
const LENGTH = 7.7;
const OVERLAP = 1;
const PIVOT = [3, -3.6];
const ELEVATION = 1.13; // radians, 65°
const [START, REACH, TURN, HOME] = [0.35, 0.25, 0.5, 10];
// Seconds to put it all up, and to take it in.
const [UP, DOWN] = [1.5, 1];
// The camera's eye and where it looks driving, in the truck's frame; with the ladder all up, it
// looks at TARGET in the turntable's frame from ORBIT (turned from behind to its right, tilted
// down, metres away; orbit, which the rider changes within TILTS and DISTANCES), taken back to
// ORBIT at HOMING (radians, radians, metres a second) when the ladder comes in.
const DRIVING = { eye: [0, 5, -14], ahead: [0, 2, 12] };
const TARGET = [0, 12, 6];
const ORBIT = { turn: 0.61, tilt: 0.25, distance: 30 }; // 35° to the right, 14° down
const [TILTS, DISTANCES] = [
  [0.05, 1.4],
  [15, 80],
];
const HOMING = { turn: 3, tilt: 1, distance: 40 };
// The water: at most DROPS drops in the air, RATE a second, leaving the nozzle at SPEED metres a
// second.
const [DROPS, RATE, SPEED] = [300, 150, 20];
const HOLD = { climb: 0, turn: 0 }; // the input that keeps it still
const RED = 0xd8231f;
const YELLOW = 0xf4d000;
const SILVER = 0xb8bec4;
const LIGHT = 0xdcdfe2; // the ladder
const DARK = 0x2a2d32;
const GLASS = 0x141a22;
const NAVY = 0x1c2a44;

// A wheel arch of this radius around [z, y], from its back to its front.
const arch = (z, y, radius) =>
  Array.from({ length: 7 }, (_, k) => [
    z - radius * Math.cos((k * Math.PI) / 6),
    y + radius * Math.sin((k * Math.PI) / 6),
  ]);
const ARCH = 0.62; // radius in metres
const box = (x, y, z, color, at) => part(new THREE.BoxGeometry(x, y, z), color, at);
// A part on both sides, at side · x.
const sides = (make) => mergeGeometries([-1, 1].map(make));
const clamp01 = (t) => THREE.MathUtils.clamp(t, 0, 1);
const ease = (t) => THREE.MathUtils.smoothstep(t, 0, 1);
const toward = (value, target, step) => value + THREE.MathUtils.clamp(target - value, -step, step);

// One turntable ladder per place ({ x, y, z, heading }), each { group, material, update, zone, eye,
// ahead, orbit, half, width } (zone: where walkers keep off, src/walkers.js; eye, ahead: the
// camera's, in its frame; orbit: as ORBIT); they share their geometries and all materials but the one of the body, ladder and
// basket (so one is highlighted alone). boost(position): how much larger to draw one far away;
// world: as for createDriving (src/drive.js).
export function createFireTrucks(places, boost, world) {
  const band = (from, to, y0, y1, color) =>
    box(WIDTH + 0.02, y1 - y0, to - from, color, [0, (y0 + y1) / 2, (from + to) / 2]);
  const body = mergeGeometries([
    // The cab, low and flat-fronted, and the body behind it.
    part(
      profile(
        [
          [CAB, 0.55],
          ...arch(AXLES[0], WHEEL, ARCH),
          [HALF, 0.5],
          [HALF + 0.03, 1.3],
          [HALF - 0.12, 2.85],
          [HALF - 0.3, CAB_TOP],
          [CAB, CAB_TOP],
        ],
        WIDTH,
      ),
      RED,
      [0, 0, 0],
    ),
    part(
      profile(
        [
          [-BACK, 0.6],
          ...arch(AXLES[1], WHEEL, ARCH),
          [CAB, 0.55],
          [CAB, BODY_TOP],
          [-BACK, BODY_TOP],
        ],
        WIDTH,
      ),
      RED,
      [0, 0, 0],
    ),
    // The windscreen, and the side windows as a slab a little wider than the cab.
    part(new THREE.BoxGeometry(2.2, 1.5, 0.04).rotateX(-0.096), GLASS, [0, 2.08, 4.97]),
    part(
      profile(
        [
          [3.1, 1.45],
          [4.86, 1.45],
          [4.76, 2.75],
          [3.1, 2.75],
        ],
        WIDTH + 0.02,
      ),
      GLASS,
      [0, 0, 0],
    ),
    // The yellow band, cut at the wheel arches, and under the windscreen.
    band(AXLES[0] + ARCH, HALF, 0.62, 0.86, YELLOW),
    band(AXLES[1] + ARCH, AXLES[0] - ARCH, 0.62, 0.86, YELLOW),
    band(-BACK, AXLES[1] - ARCH, 0.62, 0.86, YELLOW),
    box(WIDTH - 0.1, 0.25, 0.04, YELLOW, [0, 1.15, HALF + 0.04]),
    // The roller shutters, the one over the back wheels shorter.
    band(-0.3, 2.2, 0.95, 2.15, SILVER),
    band(-1.55, -0.45, 1.22, 2.15, SILVER),
    band(-BACK + 0.15, -1.7, 0.95, 2.15, SILVER),
    // The bumpers, white, over the back one a dark bar for the tail lights; the mirrors, dark.
    box(WIDTH, 0.35, 0.15, 0xf2f2f2, [0, 0.68, HALF + 0.02]),
    box(WIDTH, 0.2, 0.3, 0xf2f2f2, [0, 0.55, -BACK - 0.1]),
    box(WIDTH, 0.35, 0.02, DARK, [0, 0.825, -BACK - 0.01]),
    sides((side) => box(0.1, 0.45, 0.2, DARK, [side * 1.35, 2.3, 4.7])),
    // The turntable.
    part(new THREE.CylinderGeometry(0.95, 0.95, 0.25, 16), DARK, [0, BODY_TOP + 0.125, TURNTABLE]),
  ]);
  // On the turntable: the ladder's foot in its middle, the ladder's heel at its back; the
  // operator's stand beside it.
  const foot = mergeGeometries([
    box(1.5, 0.45, 1.4, RED, [0, BODY_TOP + 0.47, 0]),
    box(0.5, 0.9, 0.5, SILVER, [-0.95, BODY_TOP + 0.7, 0.5]),
  ]);
  // Head and tail lights, unlit so they glow.
  const lamps = mergeGeometries(
    [-1, 1].flatMap((side) => [
      box(0.4, 0.16, 0.04, 0xffffff, [side * 0.85, 1.0, HALF + 0.04]),
      box(0.4, 0.2, 0.04, 0xff1a1a, [side * 0.85, 0.825, -BACK - 0.02]),
    ]),
  );
  const lampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  // 118, the fire brigade's number, white on the back, drawn here, so nothing is loaded.
  const canvas = Object.assign(document.createElement("canvas"), { width: 128, height: 64 });
  const brush = canvas.getContext("2d");
  brush.fillStyle = "#fff";
  brush.font = "bold 60px Helvetica, Arial, sans-serif";
  brush.textAlign = "center";
  brush.fillText("118", 64, 54, 124);
  const number = new THREE.PlaneGeometry(1.1, 0.55)
    .rotateY(Math.PI)
    .translate(0, 1.65, -BACK - 0.005);
  const numberMaterial = new THREE.MeshLambertMaterial({
    map: Object.assign(new THREE.CanvasTexture(canvas), { colorSpace: THREE.SRGBColorSpace }),
    alphaTest: 0.5,
  });
  // Each ladder section from its heel (z = 0) forward, the lower ones wider: a chord at the foot
  // and a handrail on each side, posts between them, rungs.
  const sections = Array.from({ length: SECTIONS }, (_, k) => {
    const width = 1.3 - 0.15 * k;
    const high = 0.42 - 0.04 * k;
    return mergeGeometries([
      sides((side) =>
        mergeGeometries([
          box(0.08, 0.12, LENGTH, LIGHT, [(side * width) / 2, 0.06, LENGTH / 2]),
          box(0.06, 0.06, LENGTH, LIGHT, [(side * width) / 2, high, LENGTH / 2]),
          ...Array.from({ length: Math.floor(LENGTH - 0.2) + 1 }, (_, n) =>
            box(0.05, high, 0.05, LIGHT, [(side * width) / 2, high / 2, 0.2 + n * 1]),
          ),
        ]),
      ),
      ...Array.from({ length: Math.floor((LENGTH - 0.2) / 0.42) + 1 }, (_, n) =>
        box(width, 0.05, 0.05, SILVER, [0, 0.08, 0.2 + n * 0.42]),
      ),
    ]);
  });
  // The basket, its floor at 0, from its back (z = 0) forward: silver with red panels; in it the
  // firefighter in navy with a yellow stripe and helmet, holding the nozzle at NOZZLE ([y, z]).
  const NOZZLE = [1.38, 1.15];
  const basket = mergeGeometries([
    box(0.34, 0.9, 0.24, NAVY, [0, 0.53, 0.35]),
    box(0.46, 0.6, 0.3, NAVY, [0, 1.28, 0.35]),
    box(0.47, 0.07, 0.31, YELLOW, [0, 1.12, 0.35]),
    box(0.22, 0.24, 0.22, 0xe8b996, [0, 1.72, 0.37]),
    box(0.3, 0.14, 0.32, YELLOW, [0, 1.88, 0.35]),
    sides((side) => box(0.1, 0.1, 0.5, NAVY, [side * 0.2, NOZZLE[0], 0.62])),
    part(new THREE.CylinderGeometry(0.05, 0.07, 0.45, 8).rotateX(Math.PI / 2), SILVER, [
      0,
      NOZZLE[0],
      NOZZLE[1] - 0.22,
    ]),
    box(1.8, 0.08, 0.9, SILVER, [0, 0.04, 0.45]),
    box(1.8, 0.55, 0.04, RED, [0, 0.35, 0.88]),
    sides((side) => box(0.04, 0.55, 0.9, RED, [side * 0.88, 0.35, 0.45])),
    box(1.84, 0.05, 0.05, SILVER, [0, 1.05, 0.88]),
    sides((side) =>
      mergeGeometries([
        box(0.05, 0.05, 0.9, SILVER, [side * 0.9, 1.05, 0.45]),
        box(0.05, 1.05, 0.05, SILVER, [side * 0.9, 0.52, 0.88]),
      ]),
    ),
  ]);
  // Each outrigger (front, back) at x = 0, retracted: its beam across, out at side, the leg and
  // its pad at its end; slid out OUT metres and lowered DROP metres.
  const [OUT, DROP] = [1, 0.5];
  const outrigger = (side) =>
    mergeGeometries([
      box(1.3, 0.18, 0.25, SILVER, [side * 0.6, 0.75, 0]),
      box(0.22, 0.6, 0.22, SILVER, [side * 1.15, 0.85, 0]),
      box(0.4, 0.06, 0.4, DARK, [side * 1.15, 0.58, 0]),
    ]);
  const outriggers = [-1, 1].map(outrigger);
  // The flashing lights, lit: a bright core in a blue glow added onto what is behind it; else blue
  // as their covers. Over the cab's front corners and at the body's back corners; each [x, y, z].
  const on = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3060ff).multiplyScalar(3) });
  const off = new THREE.MeshBasicMaterial({ color: 0x1a3a8a });
  const lens = new THREE.BoxGeometry(0.3, 0.14, 0.24);
  const glowMaterial = glow(0x1848ff);
  const LIGHTS = [-1, 1].flatMap((side) => [
    [side * 0.95, CAB_TOP + 0.07, HALF - 0.45],
    [side * 1.05, BODY_TOP + 0.07, -BACK + 0.15],
  ]);
  // Single wheels front and back, the back ones doubled.
  const waterMaterial = new THREE.PointsMaterial({
    color: 0xd8ecff,
    size: 0.4, // metres
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const tyres = [0.32, 0.55].map((width) =>
    mergeGeometries([
      part(
        new THREE.CylinderGeometry(WHEEL, WHEEL, width, 12).rotateZ(Math.PI / 2),
        DARK,
        [0, 0, 0],
      ),
      part(
        new THREE.CylinderGeometry(0.28, 0.28, width + 0.01, 12).rotateZ(Math.PI / 2),
        0xb8bcc2,
        [0, 0, 0],
      ),
    ]),
  );
  return places.map((place, k) => createFireTruck(place, k * 0.23));

  function createFireTruck(place, late) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const group = new THREE.Group();
    group.rotation.order = "YXZ"; // heading first, then pitch
    group.add(
      new THREE.Mesh(body, material),
      new THREE.Mesh(lamps, lampMaterial),
      new THREE.Mesh(number, numberMaterial),
    );
    const flashers = LIGHTS.map((at) => {
      const core = new THREE.Mesh(lens, off);
      core.position.set(...at);
      const glow = new THREE.Sprite(glowMaterial);
      glow.position.copy(core.position);
      glow.scale.setScalar(1.8); // metres across
      group.add(core, glow);
      return { core, glow };
    });
    // Front left, front right, back left, back right.
    const wheels = AXLES.flatMap((z, end) =>
      [1, -1].map((side) => {
        const wheel = new THREE.Mesh(tyres[end], material);
        wheel.position.set(side * (end ? 0.95 : 1.05), WHEEL, z);
        wheel.rotation.order = "YXZ"; // steered, then turning
        group.add(wheel);
        return wheel;
      }),
    );
    // Front left, front right, back left, back right.
    const legs = [2, -BACK + 0.8].flatMap((z) =>
      [1, -1].map((side) => {
        const leg = new THREE.Mesh(outriggers[(side + 1) / 2], material);
        leg.position.z = z;
        group.add(leg);
        return leg;
      }),
    );
    // On the turntable the ladder from its heel, each section a little above the one below, the
    // basket at the top one's end kept level.
    const turntable = new THREE.Group();
    turntable.position.z = TURNTABLE;
    const ladder = new THREE.Group();
    ladder.position.set(0, PIVOT[0], PIVOT[1] - TURNTABLE);
    const parts = sections.map((geometry, n) => {
      const section = new THREE.Mesh(geometry, material);
      section.position.y = 0.06 * n;
      ladder.add(section);
      return section;
    });
    const cage = new THREE.Mesh(basket, material);
    cage.position.z = LENGTH;
    parts.at(-1).add(cage);
    const nozzle = new THREE.Object3D();
    nozzle.position.set(0, ...NOZZLE);
    cage.add(nozzle);
    turntable.add(new THREE.Mesh(foot, material), ladder);
    group.add(turntable);
    // The drops, in the truck's frame (it stands while it sprays), each its place and velocity;
    // those not in the air far below.
    const drops = new Float32Array(3 * DROPS).fill(-1e4);
    const velocities = new Float32Array(3 * DROPS);
    const water = new THREE.Points(new THREE.BufferGeometry(), waterMaterial);
    water.geometry.setAttribute("position", new THREE.BufferAttribute(drops, 3));
    water.frustumCulled = false;
    group.add(water);
    let [nextDrop, due, sprayed] = [0, 0, -Infinity]; // the drop to send next, how many, when last
    const from = new THREE.Vector3();
    const driving = createDriving(place, SPEC, world);
    const s = driving.state;
    let setup = 0; // 0 all in, to 1 all up
    let [yaw, reach] = [0, START]; // the ladder's, all up: turned, and how far out (0 to 1)
    // Where walkers keep off: back x, z, way x, z, length, half width with the outriggers out.
    const zone = new Float64Array(6);
    const eye = [...DRIVING.eye];
    const ahead = [...DRIVING.ahead];
    const orbit = { ...ORBIT };

    // Driven by input (createDriving), else in its place; its lights flashing. With input.stop
    // it brakes hard and the ladder goes up, then input turns it and takes it in or out,
    // input.fire sprays; without, all comes in, the ladder turned back before it is laid down,
    // before it drives.
    function update(seconds, dt, input) {
      if (!input) {
        [setup, yaw, reach] = [0, 0, START];
        Object.assign(orbit, ORBIT);
      } else if (input.stop) {
        s.speed = toward(s.speed, 0, SPEC.brake * dt);
        if (!s.speed) setup = Math.min(1, setup + dt / UP);
        if (setup === 1) {
          yaw += input.turn * TURN * dt;
          yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
          reach = clamp01(reach + input.climb * REACH * dt);
        }
      } else {
        yaw = toward(yaw, 0, HOME * TURN * dt);
        setup = Math.max(yaw ? Math.min(setup, 0.6) : 0, setup - dt / DOWN);
        if (!setup) reach = START;
      }
      driving.step(dt, input && (input.stop || setup) ? HOLD : input);
      group.position.set(s.x, s.y, s.z);
      group.rotation.set(s.pitch, s.heading, 0);
      const scale = boost(group.position);
      group.scale.setScalar(scale);
      const [ux, uz] = [Math.sin(s.heading), Math.cos(s.heading)];
      zone.set([
        s.x - ux * BACK * scale,
        s.z - uz * BACK * scale,
        ux,
        uz,
        (HALF + BACK) * scale,
        (WIDTH / 2 + OUT) * scale,
      ]);
      wheels.forEach((wheel, k) => {
        wheel.rotation.x = s.rolled / WHEEL;
        if (k < 2) wheel.rotation.y = s.steer;
      });
      // Outriggers in the first quarter, raising up to 0.6, extending to the end.
      const out = clamp01(setup * 4);
      legs.forEach((leg, k) => {
        const side = k % 2 ? -1 : 1;
        leg.position.x = side * OUT * clamp01(out * 2);
        leg.position.y = -DROP * clamp01(out * 2 - 1);
      });
      turntable.rotation.y = yaw;
      const raised = ELEVATION * ease(clamp01((setup - 0.25) / 0.35));
      ladder.rotation.x = -raised;
      cage.rotation.x = raised;
      const extend = ease(clamp01((setup - 0.6) / 0.4)) * reach * (LENGTH - OVERLAP);
      parts.forEach((section, n) => (section.position.z = n * extend));
      // The camera from behind the truck to its orbit around the ladder as the ladder goes up,
      // the orbit taken back home when switched back.
      orbit.turn = Math.atan2(Math.sin(orbit.turn), Math.cos(orbit.turn));
      for (const key of input?.stop ? [] : ["turn", "tilt", "distance"])
        orbit[key] = toward(orbit[key], ORBIT[key], HOMING[key] * dt);
      orbit.tilt = THREE.MathUtils.clamp(orbit.tilt, ...TILTS);
      orbit.distance = THREE.MathUtils.clamp(orbit.distance, ...DISTANCES);
      const { turn, tilt, distance } = orbit;
      const orbiting = [
        TARGET[0] - Math.sin(turn) * Math.cos(tilt) * distance,
        TARGET[1] + Math.sin(tilt) * distance,
        TARGET[2] - Math.cos(turn) * Math.cos(tilt) * distance,
      ];
      const u = ease(setup);
      const [c, sn] = [Math.cos(yaw), Math.sin(yaw)];
      for (const [view, driven, up] of [
        [eye, DRIVING.eye, orbiting],
        [ahead, DRIVING.ahead, TARGET],
      ]) {
        const [x, y, z] = up;
        view[0] = THREE.MathUtils.lerp(driven[0], x * c + z * sn, u);
        view[1] = THREE.MathUtils.lerp(driven[1], y, u);
        view[2] = THREE.MathUtils.lerp(driven[2], TURNTABLE - x * sn + z * c, u);
      }
      spray(seconds, dt, input?.stop && input.fire && setup === 1);
      // The left lights flash twice, then the right ones, 0.6 s in all.
      const t = (seconds + late) % 0.6;
      const flash = t % 0.3 < 0.07 || (t % 0.3 > 0.12 && t % 0.3 < 0.19);
      flashers.forEach(({ core, glow }, k) => {
        glow.visible = flash && t < 0.3 === k < 2;
        core.material = glow.visible ? on : off;
      });
    }
    // Sends drops from the nozzle the way the ladder turns, a little up, while on; moves those in
    // the air, those below the ground out of the way; nothing once all have fallen.
    function spray(seconds, dt, on) {
      if (on) sprayed = seconds;
      else if (seconds - sprayed > (2 * SPEED) / 9.81) return;
      if (on) {
        group.updateMatrixWorld();
        group.worldToLocal(nozzle.getWorldPosition(from));
        for (due += RATE * dt; due >= 1; due--) {
          const i = 3 * nextDrop;
          nextDrop = (nextDrop + 1) % DROPS;
          from.toArray(drops, i);
          const [spread, turn] = [Math.random() - 0.5, yaw + (Math.random() - 0.5) * 0.04];
          velocities[i] = SPEED * Math.sin(turn);
          velocities[i + 1] = SPEED * (0.15 + 0.04 * spread);
          velocities[i + 2] = SPEED * Math.cos(turn);
        }
      }
      for (let i = 0; i < drops.length; i += 3) {
        if (drops[i + 1] < 0) continue;
        velocities[i + 1] -= 9.81 * dt;
        for (let d = 0; d < 3; d++) drops[i + d] += velocities[i + d] * dt;
        if (drops[i + 1] < 0) drops[i + 1] = -1e4;
      }
      water.geometry.attributes.position.needsUpdate = true;
    }
    update(0, 0, null); // in place before the first frame

    return { group, material, update, zone, eye, ahead, orbit, half: SPEC.half, width: SPEC.width };
  }
}
