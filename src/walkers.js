// Pedestrians on the loops of public/walks.bin (tools/walks.mjs), around the blocks and along the
// footways of the inner city: COUNT of them within RADIUS of the view's centre, spread by length
// (BUSY times as many on busy loops), none appearing within APART of another; each at its own
// pace, a little right of the loop, so those meeting pass each other; some with a child or a dog
// beside them. One further than RADIUS reappears near that edge (in the whole circle after a jump
// of the centre); all are hidden while the camera is further than SHOWN from the centre. They walk
// round the zones kept off (the Fasnacht clique's rows and members), stepping aside in a bow (BOW); where that
// is too far, as it crosses their way, they stop before it, watching it pass.
import * as THREE from "three";
import { createCrowd } from "./people.js";

const COUNT = 250;
const RADIUS = 250; // metres
const SHOWN = 700; // metres
const BUSY = 3;
const APART = 4; // metres
const PACE = [1.1, 1.6]; // metres per second, slowest and fastest
const RIGHT = [0.6, 1.2]; // metres right of the loop, least and most
const STRIDE = 4.5; // radians of the walk per metre
const TURN = 6; // per second, how fast one turns to where it walks
const CELL = 10; // metres per cell of the grid of the loops' stretches
const SAMPLE = 5; // metres between the points of a stretch noted in the grid
const CHILD = 0.6; // of an adult's size
// Beside an adult: [metres right, ahead]; and how many of them have one.
const BESIDE = { child: [-0.6, 0], dog: [0.6, 0.5] };
const EVERY = { child: 7, dog: 9 };
// Walking round zones: metres kept off them (a child or dog beside too), looked ahead, at most
// stepped aside, per second stepped aside; metres from a zone's back beyond which it is not
// looked at; seconds one waiting stands still before it looks again.
const BOW = { margin: 1.2, look: 4, most: 5, speed: 1.2, near: 40, hold: 2 };

// buffer: walks.bin; x0, z0: the scene point of the area's north-west corner; people: looks in
// turn (bodies "man" and "woman"), the children's too; dogs: theirs in turn; ground(x, z, y): the
// height walked on there, from near y, the highest there for y = Infinity, where one appears;
// zones: those kept off, each back x, z, way x, z (unit), length and half width.
export function createWalkers(buffer, x0, z0, { people, dogs }, ground, zones) {
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
  const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
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

  // The walkers, each with its figure and maybe a child or dog beside: [crowd body, index].
  const counts = new Map();
  const figure = (body) => [body, counts.set(body, (counts.get(body) ?? 0) + 1).get(body) - 1];
  const walkers = Array.from({ length: COUNT }, (_, i) => ({
    look: people[i % people.length],
    me: figure(people[i % people.length].body),
    child: i % EVERY.child === 3 && people[(i + 1) % people.length],
    dog: i % EVERY.dog === 5 && dogs[i % dogs.length],
  }));
  for (const w of walkers) {
    if (w.child) w.child = { look: w.child, me: figure(w.child.body) };
    if (w.dog) w.dog = { look: w.dog, me: figure("dog") };
  }
  const crowds = new Map([...counts].map(([body, count]) => [body, createCrowd(body, count)]));
  for (const crowd of crowds.values()) crowd.mesh.frustumCulled = false; // they move
  const dress = ({ look, me: [body, i] }, pose = "walk") => crowds.get(body).dress(i, look, pose);
  const hide = ({ me: [body, i] }) => crowds.get(body).hide(i);
  const dodging = (one) => one && crowds.get(one.me[0]).away(one.me[1]);
  walkers.forEach((w, i) => {
    Object.assign(w, { loop: null, at: 0, step: 1, along: 0, right: 0, pace: 0, phase: i });
    Object.assign(w, {
      x: 0,
      y: 0,
      z: 0,
      heading: 0,
      bow: 0,
      hold: 0,
      watch: [0, 0],
      pose: "walk",
    });
    for (const one of [w, w.child, w.dog]) if (one) dress(one);
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
  // How far right (-: left) of its way, from where it is and BOW.look ahead, a walker must step to
  // be off all zones by BOW.margin: on the side it already is, else the nearer one; null if that
  // is more than BOW.most (then it watches the zone it waits for, w.watch).
  const spans = []; // per zone in the way: where across it begins and ends
  function aside(w) {
    spans.length = 0;
    const m = BOW.margin;
    for (const ahead of [0, BOW.look]) {
      const [x, z, dx, dz] = spot(w, w.right, ahead);
      const length = Math.hypot(dx, dz);
      const [nx, nz] = [-dz / length, dx / length];
      for (const zone of zones) {
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
        spans.push(t0, t1);
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
        pace: random(...PACE),
        x,
        z,
        bow: 0,
        hold: 0,
      });
      w.y = ground(x, z, Infinity);
      w.heading = Math.atan2(...spot(w, w.right, 0).slice(2));
      return true;
    }
    return false;
  }

  return {
    meshes: [...crowds.values()].map((crowd) => crowd.mesh),
    stretches,
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
            for (const one of [w, w.child, w.dog]) if (one) hide(one);
            return;
          }
        }
        // It waits while it, its child or dog is off its way, fleeing from traffic (dodge), or
        // before a zone it cannot step round, standing still for BOW.hold before it looks again.
        const fleeing = dodging(w) || dodging(w.child) || dodging(w.dog);
        const target = (w.hold -= dt) > 0 ? null : aside(w);
        if (target === null && w.hold <= 0) w.hold = BOW.hold;
        const waits = target === null;
        const sideways = THREE.MathUtils.clamp(
          waits ? 0 : target - w.bow,
          -BOW.speed * dt,
          BOW.speed * dt,
        );
        w.bow += sideways;
        const walks = !fleeing && !waits;
        if (walks) w.along += w.pace * dt;
        w.phase += ((walks ? w.pace * dt : 0) + Math.abs(sideways)) * STRIDE;
        const pose = walks || sideways ? "walk" : "stand";
        if (pose !== w.pose && !fleeing) {
          w.pose = pose;
          for (const one of [w, w.child, w.dog]) if (one) dress(one, pose);
        }
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
        const [x, z, dx, dz] = spot(w, w.right + w.bow, 0);
        // Towards where it goes, or waiting, towards the zone it watches.
        const ahead = walks ? w.pace * dt : 0;
        const turn =
          (ahead || sideways
            ? Math.atan2(dx * ahead - dz * sideways, dz * ahead + dx * sideways)
            : waits
              ? Math.atan2(w.watch[0] - x, w.watch[1] - z)
              : Math.atan2(dx, dz)) - w.heading;
        w.heading += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * TURN);
        Object.assign(w, { x, z, y: ground(x, z, w.y) });
        const [crowd, i] = [crowds.get(w.me[0]), w.me[1]];
        crowd.place(i, x, w.y, z, w.heading, w.phase);
        for (const [kind, size, stride] of [
          ["child", CHILD, 1 / CHILD],
          ["dog", 1, 1.6],
        ]) {
          if (!w[kind]) continue;
          const [right, ahead] = BESIDE[kind];
          const [bx, bz] = spot(w, w.right + w.bow + right, ahead);
          const [body, j] = w[kind].me;
          crowds.get(body).place(j, bx, ground(bx, bz, w.y), bz, w.heading, w.phase * stride, size);
        }
      });
    },
  };
}
