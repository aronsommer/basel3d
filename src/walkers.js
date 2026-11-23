// Pedestrians on the loops of public/walks.bin (tools/walks.mjs), around the blocks and along the
// footways of the inner city: COUNT of them within RADIUS of the view's centre, spread by length
// (BUSY times as many on busy loops), none appearing within APART of another; each at its own
// pace, its party all a little right of the loop, so those meeting pass each other; some in twos
// or threes, with a child beside or on the shoulders, a pram, a buggy or a dog, in a wheelchair
// (some pushed) or on crutches (PARTIES); none walks into a party ahead going its way (GAP). One
// further than RADIUS reappears near that edge (in the whole circle after a jump of the centre);
// all are hidden while the camera is further than SHOWN from the centre. They walk round the zones
// kept off (the Fasnacht clique's rows and members, the fire truck, the vehicles above) and the
// obstacles (trees, fountains), stepping aside in a bow (BOW); where that is too far, as it
// crosses their way, they stop before it, watching it pass, and turn back after BOW.back seconds.
import * as THREE from "three";
import { PIVOTS, WHEEL, createCrowd } from "./people.js";

const COUNT = 250;
const RADIUS = 250; // metres
const SHOWN = 700; // metres
const BUSY = 3;
const APART = 4; // metres
const PACE = [1.1, 1.6]; // metres per second, slowest and fastest
const RIGHT = [0.45, 0.9]; // metres right of the loop, least and most, of a party's leftmost
// Within GAP[1] metres ahead of a party's front, in its width and WIDE beside it, another party
// going its way slows it to its speed, within GAP[0] it stops; looked for within NEAR metres.
const GAP = [1, 2.5];
const WIDE = 0.6;
const NEAR = 8;
const STRIDE = 4.5; // radians of the walk per metre
const TURN = 6; // per second, how fast one turns to where it walks
const CELL = 10; // metres per cell of the grid of the loops' stretches
const SAMPLE = 5; // metres between the points of a stretch noted in the grid
const CHILD = 0.6; // of an adult's size
const SLOW = 0.6; // of the pace, on crutches
// Who walks together, by kind, the first leading: per member its look (0: the walker's, 1 and 2:
// the next ones, "dog": a dog's) with what it wears more, its body (its look's unless given), where
// beside the first [metres right (none left of it), ahead], metres up, its size, its pace and
// stride (times PACE and STRIDE) and poses walking and standing; the SHARES of the walkers of each
// kind, the rest alone. Side by side 0.9 metres apart, an adult with its arms 0.7 wide.
const ROLL = 1 / (WHEEL * STRIDE); // a wheelchair's stride: its wheels' radians per radian
const PARTIES = {
  alone: [{}],
  two: [{}, { look: 1, at: [0.9, 0.3] }],
  three: [{}, { look: 1, at: [0.9, -0.2] }, { look: 2, at: [0.45, 1.1] }],
  child: [{}, { look: 1, at: [0.75, 0], size: CHILD, stride: 1 / CHILD }],
  // On the shoulders: its hips just over them (1.52 metres up), behind the head.
  shoulders: [
    {},
    {
      look: 1,
      wear: { dress: false },
      at: [0, -0.2],
      up: 1.65 - PIVOTS[0] * CHILD,
      size: CHILD,
      poses: ["shoulders", "shoulders"],
    },
  ],
  pram: [{ poses: ["push", "hold"] }, { look: 1, body: "pram", at: [0, 0.78] }],
  buggy: [{ poses: ["push", "hold"] }, { look: 1, body: "buggy", at: [0, 0.78] }],
  dog: [{}, { look: "dog", at: [0.75, 0.5], stride: 1.6 }],
  chair: [{ body: "chair", stride: ROLL }],
  pushed: [
    { body: "chair", stride: ROLL, poses: ["stand", "stand"] },
    { look: 1, at: [0, -0.6], poses: ["push", "hold"] },
  ],
  crutches: [
    {
      wear: { dress: false, crutches: true },
      pace: SLOW,
      stride: 1 / SLOW,
      poses: ["hobble", "prop"],
    },
  ],
};
const SHARES = {
  two: 0.25,
  three: 0.08,
  child: 0.1,
  shoulders: 0.03,
  pram: 0.02,
  buggy: 0.02,
  dog: 0.1,
  chair: 0.02,
  pushed: 0.02,
  crutches: 0.03,
};
// Walking round zones: metres kept off them (a child or dog beside too), looked ahead, at most
// stepped aside, per second stepped aside; metres from a zone's back beyond which it is not
// looked at; seconds one waiting stands still before it looks again, and before it turns back.
const BOW = { margin: 1.2, look: 4, most: 5, speed: 1.2, near: 40, hold: 2, back: 8 };
// Metres kept off obstacles (trees, fountains), instead of BOW.margin.
const OBSTACLE = 0.4;
// Metres round a body none else comes within (src/space.js), else ROOM.other times its size;
// seconds one blocked there stands before it turns back.
const ROOM = { chair: 0.4, pram: 0.35, buggy: 0.35, other: 0.3 };
const STUCK = 3;

// buffer: walks.bin; x0, z0: the scene point of the area's north-west corner; people: looks in
// turn (bodies "man" and "woman"), the children's too; dogs: theirs in turn; ground(x, z, y): the
// height walked on there, from near y, the highest there for y = Infinity, where one appears;
// zones: lists of those kept off, each back x, z, way x, z (unit), length and half width;
// obstacles(near): [x, z, radius] of the round ones standing where near(x, z) (trees, fountains);
// space: src/space.js's, where they are and keep room.
export function createWalkers(buffer, x0, z0, { people, dogs }, ground, zones, obstacles, space) {
  // Each loop's points as x, z, and the offset of each point to the right of the loop's way, so
  // that, scaled, the lines between them stay that far right of the loop's (mitred).
  const data = new Uint16Array(buffer);
  const loops = [];
  for (let i = 0; i < data.length; i += 1 + 2 * (data[i] & 0x7fff)) {
    const n = data[i] & 0x7fff;
    const points = Float32Array.from(
      data.subarray(i + 1, i + 1 + 2 * n),
      (v, k) => (k % 2 ? z0 : x0) + v / 8,
    );
    const right = new Float32Array(2 * n);
    for (let k = 0; k < n; k++) {
      const [a, b, c] = [k - 1 + n, k, k + 1].map((m) => 2 * (m % n));
      const rightOf = (p, q) => {
        const length = Math.hypot(points[q] - points[p], points[q + 1] - points[p + 1]);
        return [-(points[q + 1] - points[p + 1]) / length, (points[q] - points[p]) / length];
      };
      const [r1, r2] = [rightOf(a, b), rightOf(b, c)];
      const [mx, mz] = [r1[0] + r2[0], r1[1] + r2[1]];
      const along = Math.hypot(mx, mz);
      const mitre = along < 0.1 ? 1 : Math.min(3, along / (mx * r2[0] + mz * r2[1])) / along;
      right.set(along < 0.1 ? r2 : [mx * mitre, mz * mitre], 2 * k);
    }
    loops.push({ points, right, busy: data[i] >> 15 });
  }
  // Cell → [loop, point] of the stretches passing it, about once per SAMPLE metres (BUSY times as
  // often on busy loops), so one picked at random there is as likely as its length.
  const key = (x, z) => Math.floor(x / CELL) * 65536 + Math.floor(z / CELL);
  const grid = new Map();
  const stretches = []; // [x, z] pairs, for the layer
  loops.forEach(({ points, busy }, l) => {
    for (let i = 0; i < points.length; i += 2) {
      const j = (i + 2) % points.length;
      stretches.push([points[i], points[i + 1]], [points[j], points[j + 1]]);
      const [dx, dz] = [points[j] - points[i], points[j + 1] - points[i + 1]];
      const n = Math.ceil((Math.hypot(dx, dz) / SAMPLE) * (busy ? BUSY : 1));
      for (let s = 0; s < n; s++) {
        const k = key(points[i] + (dx * s) / n, points[i + 1] + (dz * s) / n);
        (grid.get(k) ?? grid.set(k, []).get(k)).push([l, i]);
      }
    }
  });

  // Cell → the obstacles by the loops as zones (kept off by OBSTACLE, not BOW.margin), in each cell
  // from which one may step into them: within BOW.most and a party's width more.
  const fixed = new Map();
  const reach = BOW.most + 2;
  const near = new Set(
    [...grid.keys()].flatMap((k) =>
      [-1, 0, 1].flatMap((i) => [-1, 0, 1].map((j) => k + i * 65536 + j)),
    ),
  );
  for (const [x, z, r] of obstacles((x, z) => near.has(key(x, z)))) {
    const s = r + OBSTACLE - BOW.margin;
    const zone = [x - s, z, 1, 0, 2 * s, s];
    const out = r + OBSTACLE + reach;
    for (let cx = Math.floor((x - out) / CELL); cx <= Math.floor((x + out) / CELL); cx++)
      for (let cz = Math.floor((z - out) / CELL); cz <= Math.floor((z + out) / CELL); cz++) {
        const k = cx * 65536 + cz;
        (fixed.get(k) ?? fixed.set(k, []).get(k)).push(zone);
      }
  }
  const none = [];

  // The walkers, each with its party (PARTIES), the first leading: per member its look, figure
  // [crowd body, index], [right, ahead], size, stride, poses and its phase beyond the walker's.
  const counts = new Map();
  const walkers = Array.from({ length: COUNT }, (_, i) => {
    let r = Math.random();
    const kind = Object.keys(SHARES).find((k) => (r -= SHARES[k]) < 0) ?? "alone";
    const party = PARTIES[kind].map(
      ({
        look: k = 0,
        wear,
        body,
        at = [0, 0],
        up = 0,
        size = 1,
        stride = 1,
        poses = ["walk", "stand"],
      }) => {
        const look = k === "dog" ? dogs[i % dogs.length] : people[(i + k) % people.length];
        body ??= k === "dog" ? "dog" : look.body;
        const me = [body, counts.set(body, (counts.get(body) ?? 0) + 1).get(body) - 1];
        return {
          look: wear ? { ...look, ...wear } : look,
          me,
          right: at[0],
          ahead: at[1],
          up,
          size,
          radius: ROOM[body] ?? ROOM.other * size,
          x: Infinity, // where it is
          z: 0,
          heading: 0,
          speed: 0, // metres per second
          stride,
          poses,
          phase: 6.3 * Math.random(),
        };
      },
    );
    // Its width (right of the first) and how far it reaches ahead and back.
    const [rights, aheads] = [party.map((m) => m.right), party.map((m) => m.ahead)];
    return {
      party,
      slow: PARTIES[kind][0].pace ?? 1,
      width: Math.max(...rights),
      front: Math.max(...aheads),
      back: Math.min(...aheads),
    };
  });
  const crowds = new Map([...counts].map(([body, count]) => [body, createCrowd(body, count)]));
  for (const crowd of crowds.values()) crowd.mesh.frustumCulled = false; // they move
  const dress = ({ look, me: [body, i], poses }, moving) =>
    crowds.get(body).dress(i, look, poses[moving ? 0 : 1]);
  const hide = (one) => {
    crowds.get(one.me[0]).hide(one.me[1]);
    one.x = Infinity; // nowhere, for the cyclists
  };
  const dodging = ({ me: [body, i] }) => crowds.get(body).away(i);
  walkers.forEach((w, i) => {
    Object.assign(w, { loop: null, at: 0, step: 1, along: 0, right: 0, pace: 0, phase: i });
    Object.assign(w, {
      x: 0,
      y: 0,
      z: 0,
      heading: 0,
      bow: 0,
      hold: 0,
      waited: 0,
      watch: [0, 0],
      moving: true,
      blocked: false, // by another (space)
      speed: 0, // metres per second along its way, this frame
    });
    for (const one of w.party) {
      dress(one, true);
      one.group = w; // for space
    }
  });

  const random = (a, b) => a + Math.random() * (b - a);
  const next = ({ loop, at, step }) => (at + 2 * step + loop.points.length) % loop.points.length;
  // Where a walker is, right metres right of its loop and ahead metres on: x, z and the way on.
  function spot(w, right, ahead) {
    const { points, right: out } = w.loop;
    const [a, b] = [w.at, next(w)];
    const [dx, dz] = [points[b] - points[a], points[b + 1] - points[a + 1]];
    const length = Math.hypot(dx, dz);
    const t = w.along / length;
    const r = right * w.step; // the loop's right is the walker's left when it goes back
    const x = points[a] + out[a] * r + (points[b] - points[a] + (out[b] - out[a]) * r) * t;
    const z =
      points[a + 1] +
      out[a + 1] * r +
      (points[b + 1] - points[a + 1] + (out[b + 1] - out[a + 1]) * r) * t;
    return [x + (dx / length) * ahead, z + (dz / length) * ahead, dx, dz];
  }
  // How far right (-: left) of its way, from where it is and BOW.look ahead, a walker must step for
  // its party to be off all zones by BOW.margin and obstacles by OBSTACLE: on the side it already
  // is, else the nearer one; null if that is more than BOW.most (then it watches the zone it waits
  // for, w.watch).
  const spans = []; // per zone in the way: where across it begins and ends
  function aside(w) {
    spans.length = 0;
    const m = BOW.margin;
    // Where its party's back, first, front are and BOW.look ahead.
    for (const ahead of [w.back, 0, w.front, BOW.look]) {
      const [x, z, dx, dz] = spot(w, w.right, ahead);
      const length = Math.hypot(dx, dz);
      const [nx, nz] = [-dz / length, dx / length];
      for (const list of [...zones, fixed.get(key(x, z)) ?? none])
        for (const zone of list) {
          const [ox, oz] = [x - zone[0], z - zone[1]];
          if (Math.abs(ox) + Math.abs(oz) > BOW.near) continue;
          let [t0, t1] = [-Infinity, Infinity];
          // Across, where it is along the zone and beside it.
          for (const [v, p, lo, hi] of [
            [ox * zone[2] + oz * zone[3], nx * zone[2] + nz * zone[3], -m, zone[4] + m],
            [ox * zone[3] - oz * zone[2], nx * zone[3] - nz * zone[2], -zone[5] - m, zone[5] + m],
          ]) {
            if (Math.abs(p) < 1e-9) {
              if (v < lo || v > hi) t0 = Infinity;
              continue;
            }
            const [a, b] = [(lo - v) / p, (hi - v) / p];
            [t0, t1] = [Math.max(t0, Math.min(a, b)), Math.min(t1, Math.max(a, b))];
          }
          if (t0 >= t1) continue;
          if (!spans.length) [w.watch[0], w.watch[1]] = [zone[0], zone[1]];
          spans.push(t0 - w.width, t1); // its party right of it off it too
        }
    }
    // The nearest place to that side free of all spans.
    const free = (side) => {
      let c = 0;
      for (let moved = true; moved;) {
        moved = false;
        for (let k = 0; k < spans.length; k += 2)
          if (spans[k] < c && c < spans[k + 1]) [c, moved] = [spans[k + (side > 0)], true];
      }
      return Math.abs(c) <= BOW.most ? c : null;
    };
    const [right, left] = [free(1), free(-1)];
    if (right === null || left === null) return right ?? left;
    if (w.bow) return w.bow > 0 ? right : left;
    return right < -left ? right : left;
  }
  // How fast a walker may go: its pace, but no faster than another party going its way, further
  // ahead, with one within GAP (see there) of its front; stopping within GAP[0].
  function follow(w) {
    const [hx, hz] = [Math.sin(w.heading), Math.cos(w.heading)];
    let speed = w.pace;
    for (const o of walkers) {
      const [ox, oz] = [o.x - w.x, o.z - w.z];
      if (o === w || !o.loop || Math.abs(ox) + Math.abs(oz) > NEAR || ox * hx + oz * hz <= 0)
        continue;
      if (Math.sin(o.heading) * hx + Math.cos(o.heading) * hz <= 0) continue; // meeting it
      for (const { x, z } of o.party) {
        const [dx, dz] = [x - w.x, z - w.z];
        const [ahead, right] = [dx * hx + dz * hz - w.front, dz * hx - dx * hz];
        if (ahead > 0 && ahead < GAP[1] && right > -WIDE && right < w.width + WIDE)
          speed = Math.min(speed, ahead < GAP[0] ? 0 : o.speed);
      }
    }
    return speed;
  }
  // Puts a walker on a loop near (cx, cz), from `from` to RADIUS away and not within APART of
  // another; false if no such place was found.
  function appear(w, cx, cz, from) {
    for (let tries = 0; tries < 20; tries++) {
      const angle = random(0, 2 * Math.PI);
      const r = RADIUS * Math.sqrt(random(from, 1));
      const near = grid.get(key(cx + r * Math.cos(angle), cz + r * Math.sin(angle)));
      if (!near) continue;
      const [l, i] = near[Math.floor(Math.random() * near.length)];
      const loop = loops[l];
      const j = (i + 2) % loop.points.length;
      const length = Math.hypot(
        loop.points[j] - loop.points[i],
        loop.points[j + 1] - loop.points[i + 1],
      );
      const along = random(0, length);
      const [x, z] = [
        loop.points[i] + ((loop.points[j] - loop.points[i]) * along) / length,
        loop.points[i + 1] + ((loop.points[j + 1] - loop.points[i + 1]) * along) / length,
      ];
      if (walkers.some((o) => o !== w && o.loop && Math.hypot(o.x - x, o.z - z) < APART)) continue;
      const step = Math.random() < 0.5 ? 1 : -1;
      // Going back, from the stretch's other end.
      Object.assign(w, step > 0 ? { at: i, along } : { at: j, along: length - along });
      Object.assign(w, {
        loop,
        step,
        right: random(...RIGHT),
        speed: 0,
        pace: random(...PACE) * w.slow,
        x,
        z,
        bow: 0,
        hold: 0,
        waited: 0,
      });
      w.y = ground(x, z, Infinity);
      w.heading = Math.atan2(...spot(w, w.right, 0).slice(2));
      return true;
    }
    return false;
  }

  const members = walkers.flatMap((w) => w.party); // each with x, z, heading, speed and radius
  space.add(members);
  return {
    meshes: [...crowds.values()].map((crowd) => crowd.mesh),
    stretches,
    members,
    // dt seconds on, around the view's centre { x, z }, seen from the camera's position.
    update(dt, centre, camera) {
      const shown = camera.distanceTo(centre) < SHOWN;
      for (const crowd of crowds.values()) crowd.mesh.visible = shown;
      if (!shown) return;
      walkers.forEach((w) => {
        const away = Math.hypot(w.x - centre.x, w.z - centre.z);
        if (!w.loop || away > RADIUS) {
          const from = w.loop && away < 2 * RADIUS ? 0.8 : 0; // near the edge, unless it jumped
          if (!appear(w, centre.x, centre.z, from)) {
            w.loop = null;
            for (const one of w.party) hide(one);
            return;
          }
        }
        // It waits while one of its party is off its way, fleeing from traffic (dodge), or
        // before a zone it cannot step round, standing still for BOW.hold before it looks again.
        const fleeing = w.party.some(dodging);
        const target = (w.hold -= dt) > 0 ? null : aside(w);
        if (target === null && w.hold <= 0) w.hold = BOW.hold;
        const waits = target === null;
        // Turning back: the other way along its stretch, where it stands (its bow mirrored).
        w.waited = (waits || w.blocked) && !fleeing ? w.waited + dt : 0;
        if (w.waited > (w.blocked ? STUCK : BOW.back)) {
          const { points } = w.loop;
          const [a, b] = [w.at, next(w)];
          const length = Math.hypot(points[b] - points[a], points[b + 1] - points[a + 1]);
          Object.assign(w, {
            at: b,
            along: length - w.along,
            step: -w.step,
            bow: -2 * w.right - w.bow,
            hold: 0,
            waited: 0,
          });
        }
        let sideways = THREE.MathUtils.clamp(
          waits ? 0 : target - w.bow,
          -BOW.speed * dt,
          BOW.speed * dt,
        );
        let forward = fleeing || waits ? 0 : follow(w) * dt;
        // Not where one of its party would come into another (space): standing instead.
        const before = [w.along, w.at, w.bow];
        w.bow += sideways;
        w.along += forward;
        const { points } = w.loop;
        let length;
        while (
          w.along >=
          (length = Math.hypot(
            points[next(w)] - points[w.at],
            points[next(w) + 1] - points[w.at + 1],
          ))
        ) {
          w.along -= length;
          w.at = next(w);
        }
        w.blocked =
          (forward > 0 || sideways !== 0) &&
          w.party.some((m) => {
            const [nx, nz] = spot(w, w.right + w.bow + m.right, m.ahead);
            return space.blocked(w, m.radius, m.x, m.z, nx, nz);
          });
        if (w.blocked) {
          [w.along, w.at, w.bow] = before;
          forward = sideways = 0;
        }
        w.speed = dt && forward / dt;
        w.phase += (forward + Math.abs(sideways)) * STRIDE;
        const moving = forward > 0 || sideways !== 0;
        if (moving !== w.moving && !fleeing) {
          w.moving = moving;
          for (const one of w.party) dress(one, moving);
        }
        const [x, z, dx, dz] = spot(w, w.right + w.bow, 0);
        // Towards where it goes, or waiting, towards the zone it watches.
        const turn =
          (forward || sideways
            ? Math.atan2(dx * forward - dz * sideways, dz * forward + dx * sideways)
            : waits
              ? Math.atan2(w.watch[0] - x, w.watch[1] - z)
              : Math.atan2(dx, dz)) - w.heading;
        w.heading += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * TURN);
        Object.assign(w, { x, z, y: ground(x, z, w.y) });
        for (const m of w.party) {
          const { me, right, ahead, up, size, stride, phase } = m;
          [m.heading, m.speed] = [w.heading, w.speed];
          [m.x, m.z] = right || ahead ? spot(w, w.right + w.bow + right, ahead) : [x, z];
          const y = (right || ahead ? ground(m.x, m.z, w.y) : w.y) + up;
          crowds.get(me[0]).place(me[1], m.x, y, m.z, w.heading, w.phase * stride + phase, size);
        }
      });
    },
  };
}
