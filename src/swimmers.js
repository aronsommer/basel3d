// Rheinschwimmen: passers-by and joggers on a round (src/rheinweg.js), walking or running up the
// bank with a bright dry bag on the back, changing where it goes into the Rhine, their clothes
// into the bag, drifting down it upright, arms on the bag ahead, turning a little to each other as
// they talk, and dressing again where it comes out. Every NAKED-th has no bag: in swimwear all the
// way, it swims down crawling. Men swim in trunks, women in swimsuits. Some drift in groups of
// friends side by side (on land one behind the other), one behind catching up.
// In the water each keeps one of LANES lanes, LANE metres apart from the line towards the river; on
// land the passers-by keep a little left of the path's middle and the joggers a little right, so
// joggers pass them; going in or out of the water they go in single file. None comes nearer than
// GAP metres behind another in its lane. Before a ferry's line none swims into the band its hull sweeps while
// the ferry is near, any in it hurries out, any with a hull near swims on faster, and none swims
// with its hands against one.
import * as THREE from "three";
import { createCrowd, mix } from "./people.js";

// Passers-by and joggers, each half men, half women.
const [WALKERS, JOGGERS] = [64, 40];
const NAKED = 8;
// The sizes of the groups, in turn, among those with a bag of a kind; one behind the first of its
// group by more than BESIDE metres swims CATCH times as fast; side by side in lanes next to each
// other.
const GROUPS = [1, 2, 3, 1, 2, 4];
const [BESIDE, CATCH] = [0.3, 1.25];
const SWIM = 1.7; // metres per second, with the current
const [WALK, RUN] = [1.3, 2.8]; // metres per second
const [STRIDE, RUN_STRIDE] = [4.5, 2.6]; // radians of the walk, of the run, per metre
const [LANES, LANE] = [5, 1.5]; // lanes in the water, metres apart
const SHORE = [0.35, -0.35]; // metres left of the path's middle: the passers-by's, the joggers'
// Metres across within which two keep to one lane: less than LANE, so a group stays side by side,
// more than its drift and its bag's swaying let others come.
const APART = 1.3;
const GAP = 2.5; // metres
const DRESS = 6; // seconds changing clothes, standing on the way, those behind waiting
// A ferry's hull sweeps BAND metres along the swimmers' way either side of its line (or its way
// on, EXTEND beyond its landings): while the ferry is within FERRY metres of where they cross, one
// waits up to WAIT metres before the band, and one in it hurries out. A segment running within
// ON_WAY metres of a ferry's line (as along it to its landing) one enters only while the ferry is
// FAR or more from it, waiting up to WAIT before it; one on it hurries.
const [BAND, WAIT, FERRY, EXTEND, ON_WAY, FAR] = [11, 16, 30, 20, 10, 60];
// Within NEAR metres of a hull one swims HURRY times as fast; none swims on with its hands within
// CLEAR metres of a hull. The hull: STERN to BOW metres along its middle, HALF metres either side
// (src/ferries.js).
const [NEAR, HURRY, CLEAR] = [10, 1.8, 2];
const [STERN, BOW, HALF] = [-7, 8, 1.7];
// Drifting upright: FLOAT metres under the water's surface (its shoulders just out), its arms
// stretched ahead lying on the bag, whose middle is HOLD metres ahead and BAG metres over the
// surface, half in the water; turning up to SWAY radians either way. Crawling: lying TILT radians forward, its
// feet SINK metres under, its hands REACH metres from its feet.
const [FLOAT, HOLD, BAG, SWAY] = [1.3, 0.95, 0.08, 0.35];
const DRIFT = 0.3; // metres one drifts slowly left and right of its lane, with its group
const [TILT, SINK, REACH] = [1.4, 0.15, 2.3];
const LEAN = 0.12; // radians a jogger leans forward
const SHALLOW = 0.6; // metres over the Rhine's surface the bank's lowest steps are swum from
// Bright, to be seen on the Rhine: mostly red, orange and pink, some yellow, green, a dark blue.
const BAGS = [0xff1744, 0xff6d00, 0xff00a8, 0x00e676, 0xff4081, 0xffea00, 0xff9100, 0x1a237e];
const SKIN = [0xf1c7a5, 0xe8b996, 0xd9a27a, 0xc58c5c, 0x8a5634, 0x6b4128];
const HAIR = [0x2a1d14, 0x111111, 0xe2c46e, 0x7a3a1a];
const SWIMWEAR = [0xff1744, 0xff00a8, 0x00e5ff, 0x76ff03, 0xffea00, 0xff6d00, 0x2979ff, 0xd500f9];

// Metres from x, z to a ferry's hull.
export function fromHull({ position, rotation }, x, z) {
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
// { meshes, update(dt) }.
export function createSwimmers(loop, ground, water, ferries) {
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

  // Where each ferry's line, EXTEND beyond its landings, crosses the segments in the water or
  // wading: [distance along the loop, x, z].
  const crossings = ferries.map(({ a: start, r, length }) => {
    const a = { x: start.x - r.x * EXTEND, z: start.z - r.z * EXTEND };
    const [rx, rz] = [r.x * (length + 2 * EXTEND), r.z * (length + 2 * EXTEND)];
    for (let i = 0; i < points.length; i++) {
      if (!bathing[i]) continue;
      const [p, q] = [points[i], points[(i + 1) % points.length]];
      const [ex, ez] = [q.x - p.x, q.z - p.z];
      const d = ex * rz - ez * rx;
      if (!d) continue;
      const t = ((a.x - p.x) * rz - (a.z - p.z) * rx) / d; // along p → q
      const u = ((a.x - p.x) * ez - (a.z - p.z) * ex) / d; // along the ferry's line
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1)
        return [along[i] + t * (along[i + 1] - along[i]), p.x + t * ex, p.z + t * ez];
    }
    return null;
  });

  // Metres from x, z to the segment from p to q.
  const fromSegment = (x, z, p, q) => {
    const [ex, ez] = [q.x - p.x, q.z - p.z];
    const t = THREE.MathUtils.clamp(((x - p.x) * ex + (z - p.z) * ez) / (ex * ex + ez * ez), 0, 1);
    return Math.hypot(p.x + t * ex - x, p.z + t * ez - z);
  };
  // Per segment in the water or wading, the ferries whose line runs within ON_WAY metres of it.
  const onWay = points.map((p, i) => {
    const q = points[(i + 1) % points.length];
    if (!bathing[i]) return [];
    const steps = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z));
    return ferries.filter(({ a, r, length }) => {
      const end = { x: a.x + r.x * length, z: a.z + r.z * length };
      for (let k = 0; k <= steps; k++) {
        const [x, z] = [p.x + ((q.x - p.x) * k) / steps, p.z + ((q.z - p.z) * k) / steps];
        if (fromSegment(x, z, a, end) < ON_WAY) return true;
      }
      return false;
    });
  });
  // Whether a ferry on segment i's way is within FAR of it.
  const busy = (i) =>
    onWay[i].some(
      ({ mesh }) =>
        fromSegment(mesh.position.x, mesh.position.z, points[i], points[(i + 1) % points.length]) <
        FAR,
    );

  // Men in shorts and joggers in sports kit with the body "player" (hat: its sleeves and socks,
  // here bare), women passers-by with theirs (some in a dress); each [clothes, swimwear].
  const trunks = (look) => ({ top: look.skin, bottom: look.wear, hat: look.skin });
  const kinds = [
    [
      "player",
      "walk",
      WALKERS / 2,
      looks(
        {
          top: [0xffffff, 0x1e88e5, 0xc0392b, 0x6b6b6b, 0xf2c94c, 0x1e7d4a, 0xff6f00],
          bottom: [0xc2a878, 0x3b4d6b, 0x6b6b6b, 0x222222],
          shoes: [0xffffff, 0x111111, 0x6b4a2a],
          head: ["hair", "hair", "cap", "hair"],
        },
        WALKERS / 2,
        trunks,
      ).map(([clothes, wear]) => [{ ...clothes, hat: clothes.skin }, wear]),
    ],
    [
      "woman",
      "walk",
      WALKERS / 2,
      looks(
        {
          top: [0xffffff, 0xe91e63, 0x1e88e5, 0xf2c94c, 0x111111, 0x8e44ad],
          bottom: [0x3b4d6b, 0x222222, 0xc2a878, 0xe91e63, 0x4a5d7a],
          shoes: [0xffffff, 0x111111, 0x6b4a2a],
          head: ["long", "long", "hair", "long"],
          dress: [false, true, false],
          face: [null, "shades", null],
        },
        WALKERS / 2,
        (look) => ({ top: look.wear, bottom: look.skin }),
        true,
      ),
    ],
    [
      "player",
      "run",
      JOGGERS,
      looks(
        {
          top: [0xff6f00, 0x1e88e5, 0xe91e63, 0x76ff03, 0xffffff, 0x111111, 0xffd600, 0x00bcd4],
          bottom: [0x111111, 0x1b2333, 0x3a3a3a, 0x1e3a8a, 0x6b6b6b],
          shoes: [0xffffff, 0xff5722, 0x111111, 0x00e5ff, 0xc6ff00],
          head: ["hair", "long"],
        },
        JOGGERS,
        (look) =>
          look.head === "long"
            ? { top: look.wear, bottom: look.wear, hat: look.skin }
            : trunks(look),
      ).map(([clothes, wear]) => [{ ...clothes, hat: clothes.skin }, wear]),
    ],
  ];
  const crowds = {
    player: createCrowd("player", WALKERS / 2 + JOGGERS, false),
    woman: createCrowd("woman", WALKERS / 2, false),
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
    [m.k, m.first, m.rank] = [k, m, 0]; // alone: its own group's first
  });
  // The groups, each of passers-by or joggers with a bag: in lanes side by side behind the first.
  for (const gait of ["walk", "run"]) {
    const list = people.filter((m) => m.gait === gait && m.bag);
    for (let n = 0, g = 0; n < list.length; n += GROUPS[g++ % GROUPS.length])
      list
        .slice(n, n + GROUPS[g % GROUPS.length])
        .forEach((m, rank, group) => Object.assign(m, { first: group[0], rank }));
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
      phase: k * 1.7,
      bathing: null, // whether it was in swimwear
      dressing: 0, // seconds left changing clothes
      pose: "",
      side: 0, // metres, its way's left of the loop where it is (offset)
      x: 0,
      z: 0,
    });
  });
  const [matrix, place] = [new THREE.Matrix4(), new THREE.Vector3()];
  const upright = new THREE.Matrix4().makeRotationX(Math.PI / 2); // the bag, carried
  let clock = 0; // seconds, for the swaying

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
      let step = m.dressing ? 0 : (wet ? SWIM : m.pace) * dt;
      m.dressing = Math.max(0, m.dressing - dt);
      // Going in or out: a segment with one end on the bank.
      const shore = bathing[i] && !(points[i].wet && points[(i + 1) % points.length].wet);
      if (bathing[i]) {
        let [waiting, hurry] = [false, false];
        if (along[i + 1] - m.s < WAIT && busy((i + 1) % points.length)) waiting = true;
        if (busy(i)) hurry = true;
        crossings.forEach((c, f) => {
          if (!c) return;
          const { x, z } = ferries[f].mesh.position;
          if (Math.hypot(x - c[1], z - c[2]) >= FERRY) return;
          if (m.s >= c[0] - BAND - WAIT && m.s < c[0] - BAND) waiting = true;
          else if (Math.abs(m.s - c[0]) <= BAND) hurry = true;
        });
        const [p, q] = [points[i], points[(i + 1) % points.length]];
        const length = along[i + 1] - along[i];
        const [ux, uz] = [(q.x - p.x) / length, (q.z - p.z) / length];
        const reach = m.bag ? HOLD : REACH;
        for (const { mesh } of ferries) {
          if (fromHull(mesh, m.x, m.z) >= NEAR) continue;
          if (fromHull(mesh, m.x + ux * reach, m.z + uz * reach) < CLEAR) waiting = true;
          else hurry = true;
        }
        if (waiting) step = 0;
        else if (hurry) step *= HURRY;
        else if (wet && m.first !== m) {
          const behind = (m.first.s - m.s + total) % total;
          if (behind > BESIDE && behind < total / 2) step *= CATCH;
        }
      }
      for (let k = 1; k < order.length && step; k++) {
        const other = order[(n + k) % order.length];
        const gap = (other.s - m.s + total) % total;
        if (gap - GAP > step) break;
        if (shore || Math.abs(other.side - m.side) < APART) step = Math.max(0, gap - GAP);
      }
      m.s = (m.s + step) % total;
      if (!wet) m.phase += step * m.stride;
      dress(m, wet, m.bathing);

      // Its place: on the loop, its way to the left; heading along the loop.
      const j = segment(m.s);
      const [p, q] = [points[j], points[(j + 1) % points.length]];
      const length = along[j + 1] - along[j];
      const t = (m.s - along[j]) / length;
      const [dx, dz] = [(q.x - p.x) / length, (q.z - p.z) / length];
      m.side = offset(m, m.s);
      const [x, z] = [p.x + (q.x - p.x) * t + dz * m.side, p.z + (q.z - p.z) * t - dx * m.side];
      let heading = Math.atan2(dx, dz);
      if (swum[j] && !m.dressing) {
        const y = p.y + (q.y - p.y) * t; // the water's surface
        if (m.bag) {
          heading += SWAY * Math.sin(clock * 0.25 + m.phase);
          m.crowd.place(m.i, x, y - FLOAT, z, heading, m.phase, 1, 0);
          place.set(x + Math.sin(heading) * HOLD, y + BAG, z + Math.cos(heading) * HOLD);
        } else m.crowd.place(m.i, x, y - SINK, z, heading, m.phase, 1, TILT);
      } else {
        const y = ground(x, z);
        m.crowd.place(m.i, x, y, z, heading, m.phase, 1, m.dressing ? 0 : m.lean);
        // On the back, upright, like a rucksack.
        place.set(x - Math.sin(heading) * 0.36, y + 1.2, z - Math.cos(heading) * 0.36);
      }
      [m.x, m.z] = [x, z];
      if (!m.bag) place.y = -1000; // none
      matrix.makeRotationY(heading);
      if (!swum[j] || m.dressing) matrix.multiply(upright);
      bags.setMatrixAt(m.k, matrix.setPosition(place));
    }
    bags.instanceMatrix.needsUpdate = true;
  }
  update(0);
  const meshes = [...Object.values(crowds).map(({ mesh }) => mesh), bags];
  for (const mesh of meshes) mesh.frustumCulled = false; // they move
  return { meshes, update };
}
