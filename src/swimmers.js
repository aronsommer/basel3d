// Rheinschwimmen: passers-by and joggers on a round (src/rheinweg.js), walking or running up the
// bank with a bright dry bag on the back, changing where it goes into the Rhine, their clothes
// into the bag, drifting down it upright, arms on the bag ahead, turning a little to each other as
// they talk, and dressing again where it comes out. Every NAKED-th has no bag: in swimwear all the
// way, it swims down crawling. Men swim in trunks, women in swimsuits. Some drift in groups of
// friends side by side (on land in twos side by side, PAIR metres apart), one behind catching up.
// They flee from traffic as all people do (src/people.js, dodge), in the water running up on it,
// the bag held up over the head, and swimming back fast once calm.
// In the water each keeps one of LANES lanes, LANE metres apart from the line towards the river; on
// land the passers-by keep a little left of the path's middle and the joggers a little right, so
// joggers pass them; going in or out of the water they go in single file. None comes nearer than
// GAP metres behind another in its lane. The ferries (src/ferries.js) keep off where they will
// be; none swims on with its hands against a hull.
// Beside them families of swans swim down with the current and back up against it, further out
// (SWAN), the ferries keeping off them as off the swimmers, fleeing from traffic as they do: up on
// the water running on their legs (on land walking), swimming back once calm.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  HAND_Y,
  PIVOTS,
  REACH_ARMS,
  UP_ARM,
  createCrowd,
  createFlight,
  mix,
  SWIM_FLEE,
  turnArm,
} from "./people.js";
import { PATIENCE } from "./space.js";
import { STEP as LEG_STEP, SWAN_LEG, SWING as LEG_SWING, swan, swanLeg } from "./zoo.js";

// Passers-by and joggers (unless given), each half men, half women.
const [WALKERS, JOGGERS] = [64, 40];
const NAKED = 8;
// The sizes of the groups, in turn, among those with a bag of a kind; one behind the first of its
// group by more than BESIDE metres swims CATCH times as fast; side by side in lanes next to each
// other.
const GROUPS = [1, 2, 3, 1, 2, 4];
const [BESIDE, CATCH] = [0.3, 1.25];
const PAIR = 0.8; // metres
const ROOM = 0.3; // metres round one on land none else comes within (src/space.js)
const SWIM = 1.7; // metres per second, with the current
const [WALK, RUN] = [1.3, 2.8]; // metres per second
const [STRIDE, RUN_STRIDE] = [4.5, 2.6]; // radians of the walk, of the run, per metre
const [LANES, LANE] = [5, 1.5]; // lanes in the water, metres apart
const SHORE = [0.45, -0.45]; // metres left of the path's middle: the passers-by's, the joggers'
// Metres across within which two keep to one lane: in the water less than LANE, so a group stays
// side by side, more than its drift and its bag's swaying let others come; on land less than
// between the passers-by's and the joggers' sides, so joggers pass them.
const [APART, APART_LAND] = [1.3, 0.8];
const GAP = 2.5; // metres
const DRESS = 6; // seconds changing clothes, standing on the way, those behind waiting
// None swims on with its hands (or beak) within CLEAR metres of a hull: STERN to BOW metres along
// its middle, HALF metres either side (src/ferries.js). The ferries keep KEEP metres off where one
// in the water will be, from where it is on, every STEP metres of its way, as long as LOOK
// metres ahead or beside a ferry's line, up to LONGEST.
const CLEAR = 2;
const [STERN, BOW, HALF] = [-7, 8, 1.7];
const [KEEP, STEP, LOOK, LONGEST] = [3, 2, 14, 60];
// Drifting upright: FLOAT metres under the water's surface (its shoulders just out), its arms
// stretched ahead lying on the bag, whose middle is HOLD metres ahead (0.11 beyond its hands,
// src/people.js) and BAG metres over the surface, half in the water; turning up to SWAY radians
// either way. Crawling: lying TILT radians forward, its feet SINK metres under, its hands REACH
// metres from its feet.
const [FLOAT, BAG, SWAY] = [1.3, 0.08, 0.35];
const HOLD = (PIVOTS[1] - HAND_Y) * REACH_ARMS + 0.11;
const DRIFT = 0.3; // metres one drifts slowly left and right of its lane, with its group
const [TILT, SINK, REACH] = [1.4, 0.15, 2.3];
// Metres the bag's middle is up and ahead of one fleeing on the water: 0.19 over its hands (lifted
// up over its head, src/people.js).
const LIFT = (([y, z]) => [y + 0.19, z])(turnArm(-UP_ARM, HAND_Y));
const LEAN = 0.12; // radians a jogger leans forward
const CARRY = [1.2, 0.34]; // metres the bag's middle is up and behind one on land, leaning with it
const SHALLOW = 0.6; // metres over the Rhine's surface the bank's lowest steps are swum from
// Bright, to be seen on the Rhine: mostly red, orange and pink, some yellow, green, a dark blue.
const BAGS = [0xff1744, 0xff6d00, 0xff00a8, 0x00e676, 0xff4081, 0xffea00, 0xff9100, 0x1a237e];
const SKIN = [0xf1c7a5, 0xe8b996, 0xd9a27a, 0xc58c5c, 0x8a5634, 0x6b4128];
const HAIR = [0x2a1d14, 0x111111, 0xe2c46e, 0x7a3a1a];
const SWIMWEAR = [0xff1744, 0xff00a8, 0x00e5ff, 0x76ff03, 0xffea00, 0xff6d00, 0x2979ff, 0xd500f9];
// Families of swans (sizes; under 1 a grey cygnet), one behind the other FILE metres apart, on a
// round in the swum stretch, AWAY metres (at most a quarter of it) from its ends (off the steps
// and the St. Johann ferry's line): down at SWIM in a lane SWAN[0] metres left of the loop, beside
// the swimmers' lanes, in a half circle out to SWAN[1] and back up at UPSTREAM, as slow in the
// turns (bridge piers and the ships' course well clear). Going down a family drifts beside the
// first of a group of swimmers within JOIN metres of it, waiting for one at the top, at most CATCH
// times as fast to keep up. One family for each SWAN_ROOM metres of the round's straights (at
// least one). Each keeps SWAN_GAP behind the one ahead, its beak BILL metres ahead (before its
// size); a family drifts SWAN_DRIFT metres left and right.
const FAMILIES = [
  [1.5, 1.4],
  [1.5, 0.8, 0.8, 1.4],
  [1.4, 1.5],
  [1.5, 0.9, 0.8, 0.9, 1.4],
  [1.5, 1.5],
  [1.4, 0.8, 1.5],
];
const [FILE, AWAY, SWAN, UPSTREAM] = [2.2, 60, [7.8, 9.8], 0.6];
const [SWAN_GAP, BILL, SWAN_DRIFT] = [2, 0.6, 0.2];
const [JOIN, SWAN_ROOM] = [5, 400];

// Metres from x, z to a ferry's hull.
function fromHull({ position, rotation }, x, z) {
  const [fx, fz] = [Math.sin(rotation.y), Math.cos(rotation.y)];
  const [dx, dz] = [x - position.x, z - position.z];
  const t = THREE.MathUtils.clamp(dx * fx + dz * fz, STERN, BOW);
  const [ax, az] = [dx - t * fx, dz - t * fz];
  return Math.hypot(ax, az) - HALF;
}

// Looks for count of one kind, from lists per key (as people.js's mix), each [clothes, swimwear]:
// barefoot in swimwear (swimwear(look) its colours), some with a bright swimming cap if caps (its
// hat colour, which on the body "player" is also its sleeves' and socks').
function looks(lists, count, swimwear, caps = false) {
  return mix({ skin: SKIN, hair: HAIR, wear: SWIMWEAR, ...lists }, count).map((look, k) => [
    look,
    {
      ...look,
      ...swimwear(look),
      shoes: look.skin,
      dress: false,
      ...(caps && !(k % 3) ? { head: "beanie", hat: SWIMWEAR[(k + 3) % SWIMWEAR.length] } : {}),
    },
  ]);
}

// loop: [x, z] points round, in the water where the ground is at most SHALLOW over water;
// ground(x, z): the height there; ferries: src/ferries.js's (their line from a along r for length, mesh).
// space: src/space.js's, where they are and keep room on land; danger: what the swans flee from
// (src/people.js, createFlight); walkers (even), joggers: how many.
// { meshes, update(dt), people: each with x, z, heading, speed and whether gone (in the water) }.
export function createSwimmers(
  loop,
  ground,
  water,
  ferries,
  space,
  danger,
  { walkers = WALKERS, joggers = JOGGERS } = {},
) {
  // Per point its height and whether it is in the water; the distances along the loop.
  const points = loop.map(([x, z]) => ({ x, z, y: ground(x, z) }));
  points.forEach((p) => (p.wet = p.y <= water + SHALLOW));
  const along = [0];
  for (let i = 1; i <= points.length; i++) {
    const [a, b] = [points[i - 1], points[i % points.length]];
    along.push(along[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const total = along.at(-1);
  // A segment is swum from a point in the water (out of it, up to the bank), walked in swimwear if
  // only its end is (wading in), so one changes clothes on the bank.
  const swum = points.map((p) => p.wet);
  const bathing = points.map((p, i) => p.wet || points[(i + 1) % points.length].wet);
  // The segment at distance s along the loop.
  const segment = (s) => {
    let [low, high] = [0, points.length - 1];
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (along[mid] <= s) low = mid;
      else high = mid - 1;
    }
    return low;
  };

  // Whether one at x, z may swim on along ux, uz, its front reach metres ahead: not against a hull.
  const clear = (x, z, ux, uz, reach) =>
    ferries.every(({ mesh }) => fromHull(mesh, x + ux * reach, z + uz * reach) >= CLEAR);
  // The ferries keeping off where one will be, ahead(k) where it will be k metres on (null out of
  // the water).
  function keepOff(ahead) {
    for (const ferry of ferries)
      for (let k = 0; k <= LONGEST; k += STEP) {
        const spot = ahead(k);
        if (!spot) break;
        const out = ferry.keep(spot.x, spot.z, KEEP);
        if (k ? out && k >= LOOK : out > LOOK) break;
      }
  }
  // At distance s along the loop, side metres left of it: its segment, the place, the loop's
  // height there (where swum, the water's surface) and its heading.
  function at(s, side) {
    const j = segment(s);
    const [p, q] = [points[j], points[(j + 1) % points.length]];
    const length = along[j + 1] - along[j];
    const t = (s - along[j]) / length;
    const [dx, dz] = [(q.x - p.x) / length, (q.z - p.z) / length];
    return {
      j,
      x: p.x + (q.x - p.x) * t + dz * side,
      y: p.y + (q.y - p.y) * t,
      z: p.z + (q.z - p.z) * t - dx * side,
      heading: Math.atan2(dx, dz),
    };
  }

  // Men in shorts and joggers in sports kit with the body "player" (hat: its sleeves and socks,
  // here bare), women passers-by with theirs (some in a dress); each [clothes, swimwear].
  const trunks = (look) => ({ top: look.skin, bottom: look.wear, hat: look.skin });
  const kinds = [
    [
      "player",
      "walk",
      walkers / 2,
      looks(
        {
          top: [0xffffff, 0x1e88e5, 0xc0392b, 0x6b6b6b, 0xf2c94c, 0x1e7d4a, 0xff6f00],
          bottom: [0xc2a878, 0x3b4d6b, 0x6b6b6b, 0x222222],
          shoes: [0xffffff, 0x111111, 0x6b4a2a],
          head: ["hair", "hair", "cap", "hair"],
        },
        walkers / 2,
        trunks,
      ).map(([clothes, wear]) => [{ ...clothes, hat: clothes.skin }, wear]),
    ],
    [
      "woman",
      "walk",
      walkers / 2,
      looks(
        {
          top: [0xffffff, 0xe91e63, 0x1e88e5, 0xf2c94c, 0x111111, 0x8e44ad],
          bottom: [0x3b4d6b, 0x222222, 0xc2a878, 0xe91e63, 0x4a5d7a],
          shoes: [0xffffff, 0x111111, 0x6b4a2a],
          head: ["long", "long", "hair", "long"],
          dress: [false, true, false],
          face: [null, "shades", null],
        },
        walkers / 2,
        (look) => ({ top: look.wear, bottom: look.skin }),
        true,
      ),
    ],
    [
      "player",
      "run",
      joggers,
      looks(
        {
          top: [0xff6f00, 0x1e88e5, 0xe91e63, 0x76ff03, 0xffffff, 0x111111, 0xffd600, 0x00bcd4],
          bottom: [0x111111, 0x1b2333, 0x3a3a3a, 0x1e3a8a, 0x6b6b6b],
          shoes: [0xffffff, 0xff5722, 0x111111, 0x00e5ff, 0xc6ff00],
          head: ["hair", "long"],
        },
        joggers,
        (look) =>
          look.head === "long"
            ? { top: look.wear, bottom: look.wear, hat: look.skin }
            : trunks(look),
      ).map(([clothes, wear]) => [{ ...clothes, hat: clothes.skin }, wear]),
    ],
  ];
  const crowds = {
    player: createCrowd("player", walkers / 2 + joggers),
    woman: createCrowd("woman", walkers / 2),
  };
  const filled = { player: 0, woman: 0 };
  const people = kinds.flatMap(([body, gait, , list]) =>
    list.map((pair) => ({
      crowd: crowds[body],
      i: filled[body]++,
      looks: pair,
      gait,
      pace: gait === "run" ? RUN : WALK,
      stride: gait === "run" ? RUN_STRIDE : STRIDE,
      shore: gait === "run" ? SHORE[1] : SHORE[0],
      lean: gait === "run" ? LEAN : 0,
    })),
  );
  // A full dry bag: a thick roll, lying along the way.
  const bags = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.23, 0.23, 0.62, 12).rotateX(Math.PI / 2),
    new THREE.MeshLambertMaterial(),
    people.length,
  );
  bags.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const colour = new THREE.Color();
  people.forEach((m, k) => {
    bags.setColorAt(k, colour.set(BAGS[k % BAGS.length]));
    m.bag = k % NAKED !== NAKED - 1;
    if (!m.bag) m.looks = [m.looks[1], m.looks[1]];
    [m.k, m.first, m.rank, m.partner] = [k, m, 0, null]; // alone: its own group's first
  });
  // The groups, each of passers-by or joggers with a bag: in lanes side by side behind the first.
  for (const gait of ["walk", "run"]) {
    const list = people.filter((m) => m.gait === gait && m.bag);
    for (let n = 0, g = 0; n < list.length; n += GROUPS[g++ % GROUPS.length])
      list
        .slice(n, n + GROUPS[g % GROUPS.length])
        .forEach((m, rank, group) =>
          Object.assign(m, { first: group[0], rank, partner: rank % 2 ? group[rank - 1] : null }),
        );
  }
  const sizes = new Map();
  for (const { first } of people) sizes.set(first, (sizes.get(first) ?? 0) + 1);
  people.forEach((m) => {
    const { k, first, rank } = m;
    const size = sizes.get(first);
    // Spread round the loop, passers-by and joggers between each other; a group together.
    Object.assign(m, {
      s: ((((first.k * 11) % people.length) * total) / people.length - rank * GAP + total) % total,
      lane: ((first.k * 3) % (LANES - size + 1)) + rank, // the group's lanes side by side
      // On land, beside its partner: further from the joggers' or walkers' side.
      shore: m.shore + (rank % 2) * PAIR * (m.gait === "run" ? -1 : 1),
      phase: k * 1.7,
      bathing: null, // whether it was in swimwear
      dressing: 0, // seconds left changing clothes
      pose: "",
      side: 0, // metres, its way's left of the loop where it is (offset)
      held: 0, // seconds blocked on land on end (space)
      x: 0,
      z: 0,
    });
  });
  const [matrix, place] = [new THREE.Matrix4(), new THREE.Vector3()];
  const upright = new THREE.Matrix4().makeRotationX(Math.PI / 2); // the bag, carried
  const leaning = new THREE.Matrix4();
  let clock = 0; // seconds, for the swaying

  // The swans' round: two straights of reach metres, from away into the swum stretch (start),
  // joined by half circles; the families evenly spaced round it, each with the first of the group
  // it drifts beside (with) and whether it waits for one.
  const begin = swum.findIndex((w, i) => w && !swum.at(i - 1));
  let stretch = 0;
  for (let i = begin; swum[i % points.length]; i++)
    stretch += along[(i % points.length) + 1] - along[i % points.length];
  const RADIUS = (SWAN[1] - SWAN[0]) / 2;
  const away = Math.min(AWAY, stretch / 4);
  const reach = stretch - 2 * away;
  const half = reach + Math.PI * RADIUS;
  const start = along[begin] + away;
  const families = FAMILIES.slice(0, Math.max(1, Math.floor(reach / SWAN_ROOM))).map((sizes) => ({
    sizes,
    with: null,
    waiting: false,
  }));
  const swans = families.flatMap(({ sizes }, f) =>
    sizes.map((size, k) => ({
      f,
      size,
      lead: !k,
      u: ((f * 2 * half) / families.length - k * FILE + 2 * half) % (2 * half),
    })),
  );
  // Metres the first of a group in the water is down the round's straight from its top.
  const down = (m) => (m.s - start + total) % total;
  // At u round the round: distance along the loop, metres left of it, its heading's turn from the
  // loop's and its speed.
  function round(u) {
    const back = u >= half;
    const dir = back ? -1 : 1;
    const v = back ? u - half : u;
    const turn = Math.max(0, (v - reach) / RADIUS); // radians into the turn
    return {
      s:
        (along[begin] +
          away +
          (back ? reach : 0) +
          dir * (Math.min(v, reach) + RADIUS * Math.sin(turn))) %
        total,
      side: (SWAN[0] + SWAN[1]) / 2 - dir * RADIUS * Math.cos(turn),
      turn: turn + (back ? Math.PI : 0),
      speed: back || turn ? UPSTREAM : SWIM,
    };
  }
  const flee = createFlight(swans.length, danger, SWIM_FLEE);
  // The swans (src/zoo.js), and the cygnets (sizes under 1), each a mesh if any, each swan its
  // slot in its own.
  const swanMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const flocks = [false, true].flatMap((young) => {
    const flock = swans.filter(({ size }) => size < 1 === young);
    if (!flock.length) return [];
    const mesh = new THREE.InstancedMesh(mergeGeometries(swan(young)), swanMaterial, flock.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    flock.forEach((w, slot) => Object.assign(w, { flock: mesh, slot }));
    return [mesh];
  });
  // Their legs (src/zoo.js), left and right, shown only while they run; where each was last and its
  // legs' phase.
  const legs = new THREE.InstancedMesh(swanLeg(), swanMaterial, 2 * swans.length);
  legs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const [, H, X, AT] = SWAN_LEG;
  const [hip, none] = [new THREE.Matrix4(), new THREE.Matrix4().makeScale(0, 0, 0)];
  swans.forEach((w, k) =>
    Object.assign(w, { k, x: 0, z: 0, heading: 0, lastX: 0, lastZ: 0, phase: 0 }),
  );
  // Each in order round the round on as far as the one ahead lets it, then placed, off it while
  // it flees.
  function paddle(dt) {
    swans.sort((a, b) => a.u - b.u);
    swans.forEach((w, n) => {
      const { speed } = round(w.u);
      const [ux, uz] = [Math.sin(w.heading), Math.cos(w.heading)];
      let step = clear(w.x, w.z, ux, uz, BILL * w.size) ? speed * dt : 0;
      const family = families[w.f];
      if (w.lead && w.u < reach) {
        family.with ??= people.find(
          (m) =>
            m.first === m &&
            swum[segment(m.s)] &&
            Math.abs(down(m) - w.u) < JOIN &&
            !families.some((other) => other.with === m),
        );
        if (family.with) step = Math.min(step * CATCH, Math.max(0, down(family.with) - w.u));
        else if (family.waiting) step = 0;
      }
      const gap = (swans[(n + 1) % swans.length].u - w.u + 2 * half) % (2 * half);
      step = Math.min(step, Math.max(0, gap - SWAN_GAP));
      const before = w.u;
      w.u = (w.u + step) % (2 * half);
      if (w.lead && w.u < before) Object.assign(family, { with: null, waiting: true }); // at the top
      const now = round(w.u);
      const spot = at(now.s, now.side + SWAN_DRIFT * Math.sin(clock * 0.2 + w.f));
      [w.x, w.z, w.heading] = [spot.x, spot.z, spot.heading + now.turn];
      keepOff((k) => {
        const on = round((w.u + k) % (2 * half));
        return at(on.s, on.side);
      });
      const off = flee(w.k, w.x, spot.y, w.z, dt);
      matrix.makeRotationY(off ? off[2] : w.heading).scale(place.setScalar(w.size));
      if (off) [spot.x, spot.z] = [w.x + off[0], w.z + off[1]];
      // Fleeing, out of the water on its legs, its feet on the water or the ground; calm in the
      // water, swimming back.
      const g = off ? ground(spot.x, spot.z) : -Infinity;
      const running = off && (!off[4] || g > water);
      if (running) {
        spot.y = Math.max(g, water) - AT * w.size;
        w.phase += (LEG_STEP * Math.hypot(spot.x - w.lastX, spot.z - w.lastZ)) / w.size;
      }
      [w.lastX, w.lastZ] = [spot.x, spot.z];
      w.flock.setMatrixAt(w.slot, matrix.setPosition(spot.x, spot.y, spot.z));
      for (const side of [0, 1]) {
        const swing = (side ? LEG_SWING : -LEG_SWING) * Math.sin(w.phase);
        hip.makeRotationX(swing).setPosition((2 * side - 1) * X, AT + H, 0);
        legs.setMatrixAt(2 * w.k + side, running ? hip.premultiply(matrix) : none);
      }
    });
    for (const flock of flocks) flock.instanceMatrix.needsUpdate = true;
    legs.instanceMatrix.needsUpdate = true;
  }

  // One's way at distance s, metres left of the loop: its lane in the water, its side of the path
  // on land, eased between them where it goes in and out.
  function offset(m, s) {
    const i = segment(s);
    const t = (s - along[i]) / (along[i + 1] - along[i]);
    const at = (j) => (points[j % points.length].wet ? m.lane * LANE : m.shore);
    const drift = swum[i] ? DRIFT * Math.sin(clock * 0.15 + m.first.k) : 0;
    return (swum[i] ? m.lane * LANE : at(i) + (at(i + 1) - at(i)) * t) + drift;
  }
  // In swimwear or clothes (bathing), standing while it changes, else swimming (drifting with the
  // bag or crawling) or on its way.
  function dress(m, swimming, bathing) {
    const pose = m.dressing ? "stand" : swimming ? (m.bag ? "swim" : "crawl") : m.gait;
    if (pose !== m.pose) m.crowd.dress(m.i, m.looks[bathing ? 1 : 0], (m.pose = pose));
  }

  function update(dt) {
    clock += dt;
    for (const m of people) m.side = offset(m, m.s);
    // How far each moves on: faster near a hull or behind its group, none into a ferry's band while
    // it is near, none changing clothes, and then none too near the one ahead in its lane.
    const order = [...people].sort((a, b) => a.s - b.s);
    for (const [n, m] of order.entries()) {
      const i = segment(m.s);
      const wet = swum[i];
      if (m.bag && m.bathing !== null && bathing[i] !== m.bathing) m.dressing = DRESS;
      m.bathing = bathing[i];
      // Fleeing from traffic (src/people.js, dodge), it waits on its way; its figure runs.
      const fleeing = m.crowd.away(m.i);
      let step = m.dressing || fleeing ? 0 : (wet ? SWIM : m.pace) * dt;
      m.dressing = Math.max(0, m.dressing - dt);
      // Going in or out: a segment with one end on the bank.
      const shore = bathing[i] && !(points[i].wet && points[(i + 1) % points.length].wet);
      if (bathing[i]) {
        const [p, q] = [points[i], points[(i + 1) % points.length]];
        const length = along[i + 1] - along[i];
        const [ux, uz] = [(q.x - p.x) / length, (q.z - p.z) / length];
        if (!clear(m.x, m.z, ux, uz, m.bag ? HOLD : REACH)) step = 0;
        else if (wet && m.first !== m) {
          const behind = (m.first.s - m.s + total) % total;
          if (behind > BESIDE && behind < total / 2) step *= CATCH;
        }
      }
      // On land beside its partner: catching up with it, or slowing for it.
      if (!wet && !shore && m.partner && step) {
        const lag = ((m.partner.s - m.s + 1.5 * total) % total) - total / 2;
        if (lag > BESIDE) step *= CATCH;
        else if (lag < -BESIDE) step /= CATCH;
      }
      for (let k = 1; k < order.length && step; k++) {
        const other = order[(n + k) % order.length];
        const gap = (other.s - m.s + total) % total;
        if (gap - GAP > step) break;
        if (!shore && other.first === m.first && (other.rank - m.rank) % 2) continue; // a pair
        const lane = wet ? APART : APART_LAND;
        if (shore || Math.abs(other.side - m.side) < lane) step = Math.max(0, gap - GAP);
      }
      // On land not into another (space): standing instead, but squeezing past after PATIENCE
      // seconds so.
      if (step && !wet) {
        const on = (m.s + step) % total;
        const { x, z } = at(on, offset(m, on));
        m.held = space.blocked(m, ROOM, m.x, m.z, x, z) ? m.held + dt : 0;
        if (m.held && m.held < PATIENCE) step = 0;
      }
      m.s = (m.s + step) % total;
      if (!wet) m.phase += step * m.stride;
      dress(m, wet, m.bathing);

      // Its place: on the loop, its way to the left; heading along the loop.
      m.side = offset(m, m.s);
      const spot = at(m.s, m.side);
      const { j, x, z } = spot;
      let heading = spot.heading;
      const lean = m.dressing ? 0 : m.lean; // on land
      const afloat = swum[j] && !m.dressing;
      // For the cyclists (src/runners.js) and space (src/space.js): gone while in the water or
      // fleeing.
      Object.assign(m, { heading, speed: dt && step / dt, gone: fleeing || afloat });
      if (afloat) {
        const { y } = spot; // the water's surface
        if (m.bag) {
          heading += SWAY * Math.sin(clock * 0.25 + m.phase);
          m.crowd.place(m.i, x, y - FLOAT, z, heading, m.phase, 1, 0);
          // Fleeing (src/people.js, dodge): running on the water, its bag up across its hands over
          // its head; calm, swimming back with it ahead, or walking back on land, it hidden.
          const [ox, oz, h, , calm] = fleeing ? m.crowd.offset(m.i) : [0, 0, heading, 0, 1];
          const [fx, fz] = [x + ox, z + oz];
          const g = fleeing ? ground(fx, fz) : -Infinity;
          const [up, ahead] = calm ? [y + BAG, HOLD] : [Math.max(g, water) + LIFT[0], LIFT[1]];
          place.set(
            fx + Math.sin(h) * ahead,
            calm && g > water ? -1000 : up,
            fz + Math.cos(h) * ahead,
          );
          heading = calm ? h : h + Math.PI / 2;
        } else m.crowd.place(m.i, x, y - SINK, z, heading, m.phase, 1, TILT);
      } else {
        const y = ground(x, z);
        if (!fleeing) m.crowd.place(m.i, x, y, z, heading, m.phase, 1, lean);
        // On the back, upright, like a rucksack, leaning forward with it.
        const [up, ahead] = [Math.cos(lean), Math.sin(lean)];
        const along = CARRY[0] * ahead - CARRY[1] * up;
        place.set(
          x + Math.sin(heading) * along,
          y + CARRY[0] * up + CARRY[1] * ahead,
          z + Math.cos(heading) * along,
        );
      }
      [m.x, m.z] = [x, z];
      if (bathing[j])
        keepOff((k) => {
          const on = (m.s + k) % total;
          return bathing[segment(on)] ? at(on, offset(m, on)) : null;
        });
      if (!m.bag || (fleeing && !afloat)) place.y = -1000; // none, or hidden while it runs
      matrix.makeRotationY(heading);
      if (!afloat) matrix.multiply(leaning.makeRotationX(lean)).multiply(upright);
      bags.setMatrixAt(m.k, matrix.setPosition(place));
    }
    bags.instanceMatrix.needsUpdate = true;
    paddle(dt);
  }
  update(0);
  const meshes = [...Object.values(crowds).map(({ mesh }) => mesh), bags, ...flocks, legs];
  for (const mesh of meshes) mesh.frustumCulled = false; // they move
  for (const m of people) Object.assign(m, { radius: ROOM, group: m });
  space.add(people);
  return { meshes, update, people };
}
