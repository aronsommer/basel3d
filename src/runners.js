// Cyclists and e-scooter riders to and fro along routes on the Rhine's banks: men and women on
// bikes (src/bike.js) and e-scooters, some scooters in twos side by side (TWOS). Each keeps to the
// right and passes one slower ahead (or someone walking, people) on the left when that is clear,
// else keeps behind it; they brake for traffic and wait.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BIKE, bikeFrame, PEDAL } from "./bike.js";
import { part } from "./parts.js";
import { createCrowd, mix } from "./people.js";
import { PATIENCE } from "./space.js";

const TURN = 3; // radians a second they turn at most
const SIDE = 1.5; // metres a second they move across, to keep right or to pass
// Metres apart across the path they keep at least (SLACK more, and as far ahead as when moving
// out, to move back in after passing, so one at the edge does not make them sway), metres further
// left they pass on, metres ahead they look (and a second's way more), metres behind one ahead
// they stay (nearer, at half its speed); metres a second they slow down and speed up by each
// second.
const WIDTH = 0.9;
const SLACK = 0.5;
const PASS = 1.4;
const LOOK = 4;
const KEEP = 3.5;
const [BRAKE, START] = [5, 1.5];
// Out of traffic's way: metres across at most, metres a second they move across, seconds calm till
// they move back.
const [DODGE, DASH, CALM] = [6, 4, 2];
// Of the scooters, every TWOS-th pair rides side by side, the second TOGETHER metres left of the
// first.
const [TWOS, TOGETHER] = [3, 1];
// Metres around within which they look at people.
const NEAR = 15;
const APART = 6; // metres along the way, at least, between riders where they appear
// Metres round its rear and front wheel none else comes within (src/space.js); metres a second
// below which one held behind another waits (update).
const ROOM = 0.35;
const HELD = 0.1;
// Bikes SCALE times the girl's (her rider's body scaled with it).
const SCALE = 1.6;

const random = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const SKIN = [0xf1c7a5, 0xe8b996, 0xd9a27a, 0xc58c5c, 0x8a5634, 0x6b4128, 0x4a2c1a];
const HAIR = [0x2a1d14, 0x111111, 0xe2c46e, 0x7a3a1a, 0x8a8a8a];
// An e-scooter, facing +z, its rear on the ground at the origin: a deck, two small wheels, a stem
// with a handlebar; white where it takes its colour.
const DECK = 0.14; // metres, the deck's top
const scooter = mergeGeometries([
  part(new THREE.BoxGeometry(0.16, 0.06, 0.6), 0x2a2a2a, [0, DECK - 0.03, 0.32]), // deck
  ...[0, 0.68].map((z) =>
    part(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 10).rotateZ(Math.PI / 2), 0x111111, [
      0,
      0.1,
      z,
    ]),
  ), // wheels
  part(new THREE.BoxGeometry(0.045, 0.95, 0.045), 0xffffff, [0, 0.6, 0.66]), // stem
  part(new THREE.BoxGeometry(0.45, 0.03, 0.03), 0xffffff, [0, 1.06, 0.66]), // handlebar
  ...[-1, 1].map((s) =>
    part(new THREE.BoxGeometry(0.06, 0.04, 0.04), 0x111111, [s * 0.2, 1.06, 0.66]),
  ), // grips
]);
// The vehicles: how many (unless given, even), metres a second, metres right of the path's middle, the frame, its
// colours and size, metres to its front wheel, where its rider stands ([y, z] in the frame, were
// they standing), the rider's size and lean forward (radians) and pose.
const RIDES = {
  bike: {
    count: 20,
    speed: [4.5, 7],
    lane: [1.6, 2.6],
    frame: bikeFrame(0xffffff, false),
    colours: [0x111111, 0x1e3a8a, 0xc0392b, 0xb8b8b8, 0x2e7d32, 0xf5f5f5],
    size: SCALE,
    base: BIKE.wheels[1][2][2],
    seat: BIKE.seat,
    rider: BIKE.size,
    lean: BIKE.lean,
    pose: BIKE.pose,
  },
  scooter: {
    count: 12,
    speed: [3.5, 5.5],
    lane: [1.2, 2.2],
    frame: scooter,
    colours: [0xd0d0d0, 0x111111, 0x2e7d32, 0xff6f00, 0x1e88e5],
    size: 1,
    base: 0.68,
    seat: [DECK, 0.3],
    rider: 1,
    lean: 0.05,
    pose: "scoot",
  },
};

// A stretch of path through these points ([x, z] each): { points: [x, z, …], at: metres to each
// point, length }.
function stretchOf(route) {
  const at = route.map(() => 0);
  for (let i = 1; i < route.length; i++)
    at[i] = at[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
  return { points: route.flat(), at, length: at.at(-1) };
}

// Where on a stretch s metres along it is: x, z.
function spot({ points, at }, s) {
  let [lo, hi] = [0, at.length - 1];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (at[mid] <= s) lo = mid;
    else hi = mid;
  }
  const t = (s - at[lo]) / (at[hi] - at[lo] || 1);
  return [
    points[2 * lo] + (points[2 * hi] - points[2 * lo]) * t,
    points[2 * lo + 1] + (points[2 * hi + 1] - points[2 * lo + 1]) * t,
    points[2 * hi] - points[2 * lo],
    points[2 * hi + 1] - points[2 * lo + 1],
  ];
}

// Where a mover is: right metres right of its stretch's middle (along it), s metres along it;
// x, z and the stretch's way there.
function locate({ stretch, s, right }) {
  const [x, z, dx, dz] = spot(stretch, s);
  const length = Math.hypot(dx, dz) || 1;
  return [x - (dz / length) * right, z + (dx / length) * right, dx, dz];
}
// A mover on a stretch: { stretch, s, way: ±1 along it, top: metres a second it would go, pace:
// as it goes, keep: metres right of the middle as it goes, pass: metres further left while
// passing, right: as now, along the stretch, dodge: where right it goes out of traffic's way (null
// if not), calm: seconds since, rolled: metres it went, held: seconds blocked on end (move),
// waited: seconds held behind someone on end, x, y, z, heading; for space its rear wheel's room
// (radius, group: itself) and front: its front wheel's }, facing on.
function mover(stretch, s, way, top, keep, ground) {
  const m = { stretch, s: THREE.MathUtils.clamp(s, 0, stretch.length), way, top, pace: top, keep };
  Object.assign(m, { pass: 0, right: way * keep, dodge: null, calm: 0, rolled: 0, held: 0 });
  m.waited = 0;
  const [x, z, dx, dz] = locate(m);
  // Its front wheel's room: set as it first moves.
  Object.assign(m, {
    radius: ROOM,
    group: m,
    front: { x: Infinity, z: 0, radius: ROOM, group: m },
  });
  return Object.assign(m, { x, y: ground(x, z), z, heading: Math.atan2(way * dx, way * dz) });
}
// Metres o is ahead of m along m's way.
const ahead = (m, o) => (o.s - m.s) * m.way;
// Metres one of people (p: x, z) is ahead of m along its way on the stretch (not its heading,
// which turns as it moves across), and right of it; null if far.
function near(m, p) {
  const [dx, dz] = [p.x - m.x, p.z - m.z];
  if (p.gone || !(Math.abs(dx) + Math.abs(dz) < NEAR)) return null;
  const [, , sx, sz] = spot(m.stretch, m.s);
  const length = m.way * (Math.hypot(sx, sz) || 1);
  const [hx, hz] = [sx / length, sz / length];
  return [dx * hx + dz * hz, dz * hx - dx * hz];
}
// Whether none of others but m, nor of people, is within wide (WIDTH unless given) of right across
// and from to to metres ahead of m.
const clear = (m, others, people, right, from, to, wide = WIDTH) =>
  !others.some(
    (o) =>
      o !== m &&
      o.stretch === m.stretch &&
      Math.abs(o.right - right) < wide &&
      ahead(m, o) > from &&
      ahead(m, o) < to,
  ) &&
  !people.some((list) =>
    list.some((p) => {
      const at = near(m, p);
      return at && Math.abs(at[1] - (right - m.right) * m.way) < wide && at[0] > from && at[0] < to;
    }),
  );
// The metres a second m goes at most, wanting speed, among others and people (lists of { x, z,
// heading, speed, gone }; the gone not counted): behind the nearest in its way ahead and slower it
// moves out to pass when that is clear ahead, else keeps to its speed; it moves back in once clear
// there, or at once if that one comes the other way (and waits; but out round one walking).
function among(m, others, people, speed) {
  const look = LOOK + m.pace;
  // Metres to the nearest ahead, its speed along m's way, whether it is one of people.
  let [front, theirs, person] = [Infinity, 0, false];
  for (const o of others) {
    if (o === m || o.stretch !== m.stretch || Math.abs(o.right - m.right) >= WIDTH) continue;
    const d = ahead(m, o);
    if (d > 0 && d < look && d < front) [front, theirs] = [d, o.pace * o.way * m.way];
  }
  for (const list of people)
    for (const p of list) {
      const at = near(m, p);
      if (at && at[0] > 0 && at[0] < look && at[0] < front && Math.abs(at[1]) < WIDTH)
        [front, theirs, person] = [at[0], p.speed * Math.cos(p.heading - m.heading), true];
    }
  if (front < Infinity) {
    if (theirs >= speed) return speed;
    if (theirs <= 0 && !person)
      m.pass = 0; // one coming the other way: back in, not to meet it head on
    else if (!m.pass && clear(m, others, people, m.way * (m.keep - PASS), -2, 2 * look))
      m.pass = PASS;
    return Math.max(0, theirs) * (front < KEEP ? 0.5 : 1); // dropping back
  }
  if (m.pass && clear(m, others, people, m.way * m.keep, -3, 2 * look, WIDTH + SLACK)) m.pass = 0;
  return speed;
}
// On dt seconds towards wanted metres a second, round at the ends, moving across to keep right
// after turning round and to pass, or fast out of traffic's way; not where its rear or front wheel
// (reach metres ahead) would come into another (space): stopping instead, but squeezing past after
// PATIENCE seconds so.
function move(m, wanted, dt, ground, space, reach) {
  const { stretch } = m;
  const before = [m.s, m.way, m.right];
  m.pace += THREE.MathUtils.clamp(wanted - m.pace, -BRAKE * dt, START * dt);
  m.s += m.way * m.pace * dt;
  if (m.s < 0 || m.s > stretch.length) {
    m.way = -m.way;
    m.s = THREE.MathUtils.clamp(m.s, 0, stretch.length);
  }
  const right = m.dodge ?? m.way * (m.keep - m.pass);
  const side = (m.dodge === null ? SIDE : DASH) * dt;
  m.right += THREE.MathUtils.clamp(right - m.right, -side, side);
  let [x, z] = locate(m);
  const { front } = m;
  const [ux, uz] = [Math.sin(m.heading) * reach, Math.cos(m.heading) * reach];
  const blocked =
    space.blocked(m, ROOM, m.x, m.z, x, z) ||
    space.blocked(m, ROOM, front.x, front.z, x + ux, z + uz);
  m.held = blocked ? m.held + dt : 0;
  if (blocked && m.held < PATIENCE) {
    [m.s, m.way, m.right] = before;
    m.pace = 0;
    [x, z] = [m.x, m.z];
  } else m.rolled += m.pace * dt;
  if (x !== m.x || z !== m.z) {
    const turn = Math.atan2(x - m.x, z - m.z) - m.heading;
    const by = Math.atan2(Math.sin(turn), Math.cos(turn));
    m.heading += THREE.MathUtils.clamp(by, -TURN * dt, TURN * dt);
  }
  Object.assign(m, { x, y: ground(x, z), z });
  [front.x, front.z] = [x + Math.sin(m.heading) * reach, z + Math.cos(m.heading) * reach];
}

// The cyclists and e-scooter riders on these routes (each [x, z] points); ground(x, z):
// the height there; danger(x, y, z, reach): null if no traffic is there, else the shortest way out
// of it ([x, z]) within reach metres (src/main.js); space: src/space.js's; counts: how many of a
// kind ({ bike, scooter }, each even), if not as in RIDES. { meshes, update(dt, people) }: people as
// for among.
export function createRunners(routes, ground, danger, space, counts = {}) {
  const stretches = routes.map(stretchOf);
  const total = stretches.reduce((sum, { length }) => sum + length, 0);
  // A stretch, the longer the likelier, and a spot on it not within APART metres of one placed
  // (if one is found).
  const placed = [];
  const somewhere = () => {
    for (let tries = 0; ; tries++) {
      let r = Math.random() * total;
      const stretch = stretches.find(({ length }) => (r -= length) < 0) ?? stretches[0];
      const s = Math.random() * stretch.length;
      const free = placed.every(([t, u]) => t !== stretch || Math.abs(u - s) >= APART);
      if (free || tries === 20) return placed[placed.push([stretch, s]) - 1];
    }
  };

  // Riders, men and women in turn, on each kind of vehicle (RIDES); its frames in one mesh, for the
  // bikes their wheels in another.
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const color = new THREE.Color();
  const kinds = Object.entries(RIDES).map(([name, ride]) => {
    const { speed, lane, frame, colours, pose } = ride;
    const count = counts[name] ?? ride.count;
    const frames = new THREE.InstancedMesh(frame, material, count);
    const crowds = { man: createCrowd("man", count / 2, false) };
    crowds.woman = createCrowd("woman", count / 2, false);
    const looks = mix(
      {
        skin: SKIN,
        hair: HAIR,
        top: [0xffffff, 0x1e88e5, 0x111111, 0xc0392b, 0x6b6b6b, 0xf2c94c, 0x1e7d4a, 0xff6f00],
        bottom: [0x3b4d6b, 0x222222, 0xc2a878, 0x6b6b6b, 0x4a5d7a],
        shoes: [0xffffff, 0x111111, 0x6b4a2a],
        head: ["hair", "long", "cap", "long", "hair", "long", "backcap", "hair"],
        hat: [0x1b2333, 0xc0392b, 0x111111],
        face: [null, null, "shades", null, null],
      },
      count,
    );
    const riders = [];
    for (let k = 0; k < count; k++) {
      // The second of a pair of scooters beside the first.
      const first = pose === "scoot" && k % (2 * TWOS) === 1 && riders[k - 1];
      const [stretch, s] = first ? [first.stretch, first.s] : somewhere();
      // The mover itself, not a copy: its front wheel's room names it (group).
      const rider = Object.assign(
        first
          ? mover(stretch, s, first.way, first.top, first.keep - TOGETHER, ground)
          : mover(stretch, s, pick([-1, 1]), random(...speed), random(...lane), ground),
        { crowd: crowds[k % 2 ? "woman" : "man"], index: k >> 1 },
      );
      rider.crowd.dress(rider.index, looks[k], pose);
      frames.setColorAt(k, color.set(colours[k % colours.length]));
      riders.push(rider);
    }
    const wheels =
      ride === RIDES.bike && new THREE.InstancedMesh(BIKE.wheels[0][0], material, 2 * count);
    const meshes = [frames, crowds.man.mesh, crowds.woman.mesh, ...(wheels ? [wheels] : [])];
    return { ride, riders, frames, wheels, meshes };
  });
  const meshes = kinds.flatMap((kind) => kind.meshes);
  for (const mesh of meshes) mesh.frustumCulled = false; // they move
  const all = kinds.flatMap(({ riders }) => riders);
  space.add(all);
  space.add(all.map(({ front }) => front));

  const [matrix, wheel, spin] = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()];
  const [turn, seat, position, scale] = [
    new THREE.Euler(0, 0, 0, "YXZ"),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  const quaternion = new THREE.Quaternion();
  // People by cells NEAR wide (the gone left out, as near does), so each rider looks only at those
  // in the nine cells round it (around).
  const cells = new Map();
  const key = (x, z) => Math.floor(x / NEAR) * 65536 + Math.floor(z / NEAR);
  const around = [];
  return {
    meshes,
    update(dt, people) {
      for (const cell of cells.values()) cell.length = 0;
      for (const list of people)
        for (const p of list) {
          if (p.gone || !Number.isFinite(p.x)) continue;
          const k = key(p.x, p.z);
          (cells.get(k) ?? cells.set(k, []).get(k)).push(p);
        }
      for (const { ride, riders, frames, wheels } of kinds) {
        const { size, base, seat: at, rider, lean } = ride;
        scale.setScalar(size);
        riders.forEach((r, k) => {
          // Stopping before traffic ahead, on again once it is gone; in it, stopping and out of its
          // way across the path, back after CALM seconds calm.
          const out = danger(r.x, r.y, r.z, DODGE);
          if (out) {
            const [, , dx, dz] = locate(r);
            r.dodge = r.right + (out[1] * dx - out[0] * dz) / (Math.hypot(dx, dz) || 1);
            r.calm = 0;
          } else if (r.dodge !== null && (r.calm += dt) > CALM) r.dodge = null;
          const look = LOOK + r.pace;
          const [ax, az] = [r.x + Math.sin(r.heading) * look, r.z + Math.cos(r.heading) * look];
          const wanted = out || danger(ax, r.y, az, 0) ? 0 : r.top;
          // Held behind someone (among) PATIENCE seconds on end, it goes on anyway.
          around.length = 0;
          const c = key(r.x, r.z);
          for (let i = -1; i <= 1; i++)
            for (let j = -1; j <= 1; j++) around.push(cells.get(c + i * 65536 + j) ?? []);
          const may = among(r, all, around, wanted);
          r.waited = wanted && may < HELD ? r.waited + dt : 0;
          move(r, r.waited > PATIENCE ? wanted : may, dt, ground, space, base * size);
          // Pitched as the ground under its rear and front wheels.
          const reach = base * size;
          const front = ground(
            r.x + Math.sin(r.heading) * reach,
            r.z + Math.cos(r.heading) * reach,
          );
          turn.set(-Math.atan2(front - r.y, reach), r.heading, 0);
          quaternion.setFromEuler(turn);
          matrix.compose(position.set(r.x, r.y, r.z), quaternion, scale);
          frames.setMatrixAt(k, matrix);
          if (wheels)
            BIKE.wheels.forEach(([, radius, middle], w) => {
              spin.makeRotationX(r.rolled / (radius * size));
              wheel.makeTranslation(...middle).multiply(spin);
              wheels.setMatrixAt(2 * k + w, wheel.premultiply(matrix));
            });
          seat
            .set(0, ...at)
            .multiplyScalar(size)
            .applyEuler(turn)
            .add(position);
          const pedals = (r.rolled * PEDAL) / size;
          r.crowd.place(r.index, ...seat, r.heading, pedals, rider * size, lean + turn.x);
        });
        frames.instanceMatrix.needsUpdate = true;
        if (wheels) wheels.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
