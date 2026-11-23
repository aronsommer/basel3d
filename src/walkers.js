// Pedestrians on the loops of public/walks.bin (tools/walks.mjs), around the blocks and along the
// footways of the inner city (or other loops as given): COUNT of them (unless given) within RADIUS
// (unless given) of the view's centre, spread by length
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
import { PATIENCE } from "./space.js";

const COUNT = 250;
const RADIUS = 250; // metres
const SHOWN = 700; // metres
const BUSY = 3;
const APART = 4; // metres
const PACE = [1.1, 1.6]; // metres per second, slowest and fastest
const RIGHT = [0.45, 0.9]; // metres right of the loop, least and most, of a party's leftmost
// Within GAP[1] metres ahead of a party's front, in its width and WIDE beside it, another party
// going its way (turned at most SAME_WAY radians off it) slows it to its speed, within GAP[0] it
// stops, but not for more than PATIENCE seconds on end (src/space.js); looked for within NEAR
// metres.
const GAP = [1, 2.5];
const SAME_WAY = Math.PI / 4;
const STANDS = 0.2; // metres a second, below which a party ahead is stepped round, not followed
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
// stride (times PACE and STRIDE), poses walking and standing and how far it roams round its place
// [metres ahead and back, right and left] (dogs and children, roam); the SHARES of the walkers of
// each kind, the rest alone. Side by side 0.9 metres apart, an adult with its arms 0.7 wide.
const ROLL = 1 / (WHEEL * STRIDE); // a wheelchair's stride: its wheels' radians per radian
const PARTIES = {
  alone: [{}],
  two: [{}, { look: 1, at: [0.9, 0.3] }],
  three: [{}, { look: 1, at: [0.9, -0.2] }, { look: 2, at: [0.45, 1.1] }],
  child: [{}, { look: 1, at: [0.75, 0], size: CHILD, stride: 1 / CHILD, play: [0.5, 0.25] }],
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
  dog: [{}, { look: "dog", at: [0.75, 0.5], stride: 1.6, play: [1.2, 0.25] }],
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
// Metres round a body none else comes within (src/space.js), else ROOM.other times its size.
const ROOM = { chair: 0.4, pram: 0.35, buggy: 0.35, other: 0.3 };
// Each of a party steps aside on its own (shift: metres right of its place), so a party splits
// round those it meets: the nearest within AHEAD metres ahead of it, coming the other way or
// standing, not beside it by their rooms and CLEAR more, it passes on the side away from it (the
// right if straight ahead), SIDESTEP metres a second, at most SHIFT; clear, it steps back.
const [AHEAD, CLEAR, SIDESTEP, SHIFT] = [4, 0.25, 1.2, 1.5];
// Parties meeting (their first within MEET metres) stop and talk, facing each other, CHAT seconds,
// with CHAT_CHANCE; one alone catching up with a party going its way (within SAME_WAY), all
// walking as most do (free), joins it on its right with JOIN_CHANCE; either way they meet again
// only after MET seconds. Each second, one of a party walking as most do leaves it with LEAVE
// chance, walking on alone at its own pace, as SPARE walkers kept empty allow; MOST in a party.
// One joining or leaving glides to its new place, DRIFT metres a second.
const MEET = 2.5;
const [CHAT_CHANCE, JOIN_CHANCE, LEAVE] = [0.08, 0.3, 1 / 120];
const CHAT = [8, 20];
const [MET, SPARE, MOST, DRIFT] = [40, 30, 4, 1];

// buffer: walks.bin; x0, z0: the scene point of the area's north-west corner; people: looks in
// turn (bodies "man" and "woman"), the children's too; dogs: theirs in turn; ground(x, z, y): the
// height walked on there, from near y, the highest there for y = Infinity, where one appears;
// zones: lists of those kept off, each back x, z, way x, z (unit), length and half width;
// obstacles(near): [x, z, radius] of the round ones standing where near(x, z) (trees, fountains);
// space: src/space.js's, where they are and keep room; count, radius: instead of COUNT and RADIUS;
// every: whether the parties are of each kind in turn (PARTIES), not by their SHARES.
export function createWalkers(
  buffer,
  x0,
  z0,
  { people, dogs },
  ground,
  zones,
  obstacles,
  space,
  { count = COUNT, radius = RADIUS, every = false } = {},
) {
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
  const kinds = Object.keys(PARTIES);
  const walkers = Array.from({ length: count + SPARE }, (_, i) => {
    if (i >= count) return shape({ party: [], slow: 1 }); // spare, for those leaving a party
    let r = Math.random();
    const kind = every
      ? kinds[i % kinds.length]
      : (Object.keys(SHARES).find((k) => (r -= SHARES[k]) < 0) ?? "alone");
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
        play = [0, 0],
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
          shift: 0, // metres right of its place, stepping aside (aim)
          play,
          roam: [0, 0], // metres ahead and right of its place, roaming now (roam)
          drift: [0, 0], // and gliding to it, after joining or leaving a party
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
    return shape({ party, slow: PARTIES[kind][0].pace ?? 1 });
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
      held: 0, // seconds blocked by others on end (space)
      behind: 0,
      chat: 0, // seconds left talking with another party (talking)
      talking: null,
      met: Math.random() * MET, // seconds till it may meet another
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
  // Its width (right of the first) and how far it reaches ahead and back; the party itself.
  function shape(w) {
    const [rights, aheads] = [w.party.map((m) => m.right), w.party.map((m) => m.ahead)];
    return Object.assign(w, {
      width: Math.max(0, ...rights),
      front: Math.max(0, ...aheads),
      back: Math.min(0, ...aheads),
    });
  }
  // Metres right and ahead of a walker's place where one of its party (m) is: its place in the
  // party, roaming and gliding, and stepped aside by shift.
  const offsets = (m, shift = m.shift) => [
    m.right + m.roam[1] + m.drift[1] + shift,
    m.ahead + m.roam[0] + m.drift[0],
  ];
  // Whether one of a party walks as most do: an adult on foot (not a child, a dog, in a
  // wheelchair, pushing or on crutches), who may join or leave a party.
  const free = (m) =>
    m.size === 1 && m.poses[0] === "walk" && (m.me[0] === "man" || m.me[0] === "woman");
  // Puts one of a party (m), where it is, at a place in walker w's party (right, ahead), gliding
  // there from where it is (drift).
  function move(m, w, right, ahead) {
    const [x, z, dx, dz] = spot(w, w.right + w.bow + right, ahead);
    const length = Math.hypot(dx, dz);
    const [ox, oz] = [(m.x - x) / length, (m.z - z) / length];
    Object.assign(m, { group: w, right, ahead, shift: 0 });
    m.drift = Number.isFinite(m.x) ? [ox * dx + oz * dz, oz * dx - ox * dz] : [0, 0];
    w.party.push(m);
    shape(w);
  }
  // Walker w meets another party nearby, if any: they talk, or one alone joins the other.
  function meet(w) {
    for (const o of walkers) {
      if (o === w || !o.loop || o.met > 0 || o.chat > 0) continue;
      if (Math.abs(o.x - w.x) + Math.abs(o.z - w.z) > MEET) continue;
      w.met = o.met = MET;
      const same = Math.cos(o.heading - w.heading) > Math.cos(SAME_WAY);
      const [one, other] = w.party.length === 1 ? [w, o] : [o, w];
      if (
        same &&
        one.party.length === 1 &&
        other.party.length < MOST &&
        [...one.party, ...other.party].every(free) &&
        Math.random() < JOIN_CHANCE
      ) {
        move(one.party.pop(), other, other.width + 0.9, 0);
        one.loop = null; // spare now
      } else if (Math.random() < CHAT_CHANCE) {
        w.chat = o.chat = random(...CHAT);
        [w.talking, o.talking] = [o, w];
      }
      return;
    }
  }
  // The last of walker w's party, if it walks as most do, leaves it for a spare walker, if any,
  // going on alone from where it is, in its lane, at its own pace.
  function leave(w) {
    const m = w.party.at(-1);
    const spare = walkers.find((o) => !o.party.length);
    if (w.party.length < 2 || !free(m) || !spare) return;
    w.party.pop();
    shape(w);
    const { loop, at, step, along, bow, heading, x, z, y } = w;
    Object.assign(spare, { loop, at, step, along, bow, heading, x, z, y, phase: w.phase });
    Object.assign(spare, { right: w.right + m.right, pace: random(...PACE), slow: 1, speed: 0 });
    Object.assign(spare, { hold: 0, waited: 0, held: 0, behind: 0, chat: 0, met: MET });
    move(m, spare, 0, 0);
  }
  // Where one of a party (m) roams now round its place (play): ahead and back, unevenly, and right
  // and left, each in its own time (its phase), seconds on.
  const roam = (m, seconds) => {
    const [a, r, p] = [...m.play, m.phase];
    const ahead = 0.6 * Math.sin(0.7 * seconds + p) + 0.4 * Math.sin(1.9 * seconds + 2 * p);
    [m.roam[0], m.roam[1]] = [a * ahead, r * Math.sin(0.9 * seconds + 3 * p)];
  };
  let clock = 0; // seconds, for roaming
  // Where right of its place one of a walker's party (m) would step aside to (see SHIFT).
  function aim(w, m) {
    const [right, ahead] = offsets(m, 0);
    const [x, z, dx, dz] = spot(w, w.right + w.bow + right, ahead);
    const length = Math.hypot(dx, dz);
    const [ux, uz] = [dx / length, dz / length];
    let [nearest, want] = [AHEAD, 0];
    space.each(x + (ux * AHEAD) / 2, z + (uz * AHEAD) / 2, AHEAD / 2 + 1, (b) => {
      if (b.group === w || b.gone) return;
      if (b.speed > STANDS && Math.sin(b.heading) * ux + Math.cos(b.heading) * uz > 0.5) return;
      const [ox, oz] = [b.x - x, b.z - z];
      const along = ox * ux + oz * uz;
      const across = oz * ux - ox * uz; // its right of the place
      const room = m.radius + b.radius + CLEAR;
      if (along < 0 || along >= nearest || Math.abs(across - m.shift) >= room) return;
      nearest = along;
      want = across > m.shift + 0.1 ? across - room : across + room;
    });
    return THREE.MathUtils.clamp(want, -SHIFT, SHIFT);
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
      if (Math.sin(o.heading) * hx + Math.cos(o.heading) * hz < Math.cos(SAME_WAY)) continue;
      if (o.speed < STANDS) continue; // stepped round (aim), not followed
      for (const { x, z } of o.party) {
        const [dx, dz] = [x - w.x, z - w.z];
        const [ahead, right] = [dx * hx + dz * hz - w.front, dz * hx - dx * hz];
        if (ahead > 0 && ahead < GAP[1] && right > -WIDE && right < w.width + WIDE)
          speed = Math.min(speed, ahead < GAP[0] ? 0 : o.speed);
      }
    }
    return speed;
  }
  // Puts a walker on a loop near (cx, cz), from `from` to radius away and not within APART of
  // another; false if no such place was found.
  function appear(w, cx, cz, from) {
    for (let tries = 0; tries < 20; tries++) {
      const angle = random(0, 2 * Math.PI);
      const r = radius * Math.sqrt(random(from, 1));
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
      clock += dt;
      walkers.forEach((w) => {
        if (!w.party.length) return; // spare
        const away = Math.hypot(w.x - centre.x, w.z - centre.z);
        if (!w.loop || away > radius) {
          const from = w.loop && away < 2 * radius ? 0.8 : 0; // near the edge, unless it jumped
          if (!appear(w, centre.x, centre.z, from)) {
            w.loop = null;
            for (const one of w.party) hide(one);
            return;
          }
        }
        // Talking, meeting another, leaving its party (see MEET); its party gliding to their places.
        w.met -= dt;
        if (w.chat > 0) w.chat -= dt;
        else if (w.met <= 0) meet(w);
        if (!w.party.length) return; // joined another
        if (w.chat <= 0 && Math.random() < LEAVE * dt) leave(w);
        for (const m of w.party)
          for (const k of [0, 1])
            m.drift[k] -= THREE.MathUtils.clamp(m.drift[k], -DRIFT * dt, DRIFT * dt);
        const talks = w.chat > 0;
        // It waits while one of its party is off its way, fleeing from traffic (dodge), or
        // before a zone it cannot step round, standing still for BOW.hold before it looks again.
        const fleeing = w.party.some(dodging);
        const target = (w.hold -= dt) > 0 ? null : aside(w);
        if (target === null && w.hold <= 0) w.hold = BOW.hold;
        const waits = target === null;
        // Turning back: the other way along its stretch, where it stands (its bow mirrored).
        w.waited = waits && !fleeing ? w.waited + dt : 0;
        if (w.waited > BOW.back) {
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
        if (talks) sideways = 0;
        const behind = fleeing || waits || talks ? 0 : follow(w);
        w.behind = behind < w.pace / 10 && !talks ? w.behind + dt : 0; // seconds stopped behind
        let forward = fleeing || waits || talks ? 0 : (w.behind > PATIENCE ? w.pace : behind) * dt;
        // Not where one of its party would come into another (space): standing instead, but
        // squeezing past after PATIENCE seconds so.
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
        for (const m of w.party) if (m.play[0]) roam(m, clock);
        const step = SIDESTEP * dt;
        const shifts = w.party.map(
          (m) => m.shift + THREE.MathUtils.clamp(aim(w, m) - m.shift, -step, step),
        );
        const blocked =
          (forward > 0 || sideways !== 0 || w.party.some((m, k) => shifts[k] !== m.shift)) &&
          w.party.some((m, k) => {
            const [right, ahead] = offsets(m, shifts[k]);
            const [nx, nz] = spot(w, w.right + w.bow + right, ahead);
            return space.blocked(w, m.radius, m.x, m.z, nx, nz);
          });
        w.held = blocked ? w.held + dt : 0;
        if (blocked && w.held < PATIENCE) {
          [w.along, w.at, w.bow] = before;
          forward = sideways = 0;
        } else w.party.forEach((m, k) => (m.shift = shifts[k]));
        w.speed = dt && forward / dt;
        w.phase += (forward + Math.abs(sideways)) * STRIDE;
        const moving = forward > 0 || sideways !== 0;
        if (moving !== w.moving && !fleeing) {
          w.moving = moving;
          for (const one of w.party) dress(one, moving);
        }
        const [x, z, dx, dz] = spot(w, w.right + w.bow, 0);
        // Towards where it goes, talking, towards the other, or waiting, towards the zone it watches.
        const turn =
          (forward || sideways
            ? Math.atan2(dx * forward - dz * sideways, dz * forward + dx * sideways)
            : talks
              ? Math.atan2(w.talking.x - x, w.talking.z - z)
              : waits
                ? Math.atan2(w.watch[0] - x, w.watch[1] - z)
                : Math.atan2(dx, dz)) - w.heading;
        w.heading += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * TURN);
        Object.assign(w, { x, z, y: ground(x, z, w.y) });
        for (const m of w.party) {
          const { me, up, size, stride, phase } = m;
          [m.heading, m.speed] = [w.heading, w.speed];
          const [across, on] = offsets(m);
          const off = across || on;
          [m.x, m.z] = off ? spot(w, w.right + w.bow + across, on) : [x, z];
          const y = (off ? ground(m.x, m.z, w.y) : w.y) + up;
          crowds.get(me[0]).place(me[1], m.x, y, m.z, w.heading, w.phase * stride + phase, size);
        }
      });
    },
  };
}
