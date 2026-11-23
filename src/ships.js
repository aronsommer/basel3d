import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { glow, part } from "./parts.js";
import { checkLines } from "./lines.js";
import { riders } from "./riders.js";

// Ships on their round course on the Rhine (tools/ships.mjs), which keeps clear of the bridge
// piers and the sea monster: SHIPS tankers, container ships, passenger ships and speedboats in
// turn, evenly spaced and all at the same speed. Each is at most 11 m wide (the course keeps 10 m
// clear around its middle) and 6 m high, to pass under the bridges. Whale families swim among
// them. Each keeps GAP behind the one ahead, and stops before a ferry's line (src/ferries.js)
// unless the ferry stays out of its lane until it is past, and the one ahead lets it pass.
export function createShips(course, ferries, boost, bridgeDecks) {
  const SPEED = 5; // metres per second
  const SHIPS = 20; // about one every 650 m of the course
  const GAP = 20; // metres
  const ZONE = 30; // metres along the course each side of a ferry's line: its hull and rope
  const LANE = 12; // metres the ferry is off the course there at least: half a ship and a ferry
  // Cumulative distance along the course (x, y, z per point).
  const n = course.length / 3;
  const distance = new Float32Array(n);
  for (let i = 1; i < n; i++)
    distance[i] =
      distance[i - 1] +
      Math.hypot(course[3 * i] - course[3 * i - 3], course[3 * i + 2] - course[3 * i - 1]);
  const total = distance[n - 1];
  const mod = (d) => ((d % total) + total) % total;
  const at = (d, out) => {
    d = mod(d);
    let [lo, hi] = [0, n - 1];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (distance[mid] <= d) lo = mid;
      else hi = mid;
    }
    const t = (d - distance[lo]) / (distance[hi] - distance[lo] || 1);
    return out.set(
      course[3 * lo] + (course[3 * hi] - course[3 * lo]) * t,
      course[3 * lo + 1] + (course[3 * hi + 1] - course[3 * lo + 1]) * t,
      course[3 * lo + 2] + (course[3 * hi + 2] - course[3 * lo + 2]) * t,
    );
  };

  // Where the course crosses each ferry's line: { ferry, distance along the course, across:
  // metres along the ferry's line }.
  const crossings = [];
  for (const ferry of ferries) {
    const [ex, ez] = [ferry.r.x * ferry.length, ferry.r.z * ferry.length];
    for (let i = 1; i < n; i++) {
      const [px, pz] = [course[3 * i - 3], course[3 * i - 1]];
      const [dx, dz] = [course[3 * i] - px, course[3 * i + 2] - pz];
      const [wx, wz] = [ferry.a.x - px, ferry.a.z - pz];
      const cross = dx * ez - dz * ex;
      const t = (wx * ez - wz * ex) / cross; // along the course's piece
      const u = (wx * dz - wz * dx) / cross; // along the ferry's line
      if (t >= 0 && t < 1 && u >= 0 && u <= 1)
        crossings.push({
          ferry,
          distance: distance[i - 1] + (distance[i] - distance[i - 1]) * t,
          across: u * ferry.length,
        });
    }
  }
  // Whether a ship may go on by step metres seconds in: GAP behind the one ahead, and if it would
  // come within ZONE of a ferry's line, only if the ferry keeps LANE away until its back is ZONE
  // past and the one ahead is far enough on to let it get there.
  const mayGo = (ship, step, seconds) => {
    const ahead = mod(ship.ahead.d - ship.d) - (ship.length + ship.ahead.length) / 2;
    if (ahead - step < GAP) return false;
    const front = ship.d + ship.length / 2;
    for (const { ferry, distance, across } of crossings) {
      const before = mod(distance - ZONE - front);
      if (before >= step) continue; // not reached, or in or past it already
      const past = before + 2 * ZONE + ship.length; // metres until its back is past
      if (ahead < past + GAP) return false;
      for (let t = 0; t <= past / SPEED; t += 0.25)
        if (Math.abs(ferry.at(seconds + t) - across) < LANE) return false;
    }
    return true;
  };

  // Ships along +z, the waterline at y = 0, built from coloured parts.
  const colored = (geometry, color) => {
    const g = geometry.toNonIndexed();
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    const c = new THREE.Color(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  };
  // A box of [width, height, length] centred at [x, y, z].
  const box = (size, color, [x, y, z]) =>
    colored(new THREE.BoxGeometry(...size).translate(x, y, z), color);
  // A hull 3 m high (1 m under water): a box with a triangular bow in front (+z), 8 m long or a
  // third of a short boat.
  const hull = (width, length, color) => {
    const bowLength = Math.min(8, length / 3);
    const r = width / Math.sqrt(3); // a triangle of this radius is width wide at its back
    const bow = new THREE.CylinderGeometry(r, r, 3, 3); // its first corner points along +z
    bow.scale(1, 1, bowLength / (1.5 * r)); // from its back edge (-r / 2) to the tip (r)
    bow.translate(0, 0.5, length / 2 - (bowLength / 3) * 2); // back edge where the box ends
    return [
      box([width, 3, length - bowLength], color, [0, 0.5, -bowLength / 2]),
      colored(bow, color),
    ];
  };
  const WINDOWS = 0x1f2a30;
  const WHITE = 0xf2f2f0;
  const wheelhouse = (z) => [
    box([8, 3, 5], WHITE, [0, 3.5, z]),
    box([8.1, 0.9, 5.1], WINDOWS, [0, 4.4, z]),
  ];
  const tanker = [
    ...hull(11, 90, 0x7a1f1f),
    box([10, 0.4, 70], 0x3a3f46, [0, 2.2, 2]), // deck
    box([0.8, 0.8, 66], 0xc9a227, [0, 2.8, 2]), // pipeline
    ...wheelhouse(-38),
    box([1.4, 1.4, 1.4], 0x111111, [0, 5.7, -40]), // funnel
  ];
  const containerColors = [0xb3413a, 0x2f6db5, 0xe0b52b, 0x3b8c4a];
  const container = [
    ...hull(10, 70, 0x24324a),
    ...[...Array(8)].map((_, i) =>
      box([8.6, 2.5, 5.8], containerColors[i % 4], [0, 3.25, 22 - i * 6.2]),
    ),
    ...wheelhouse(-29),
  ];
  const passenger = [
    ...hull(9, 50, WHITE),
    box([9.05, 0.5, 42.1], 0x2f6db5, [0, 1.6, -4]), // blue stripe
    box([8, 2.2, 34], WHITE, [0, 3.1, -6]),
    box([8.1, 1.0, 34.1], WINDOWS, [0, 3.2, -6]),
    box([6, 1.5, 18], WHITE, [0, 4.95, -10]),
    box([6.1, 0.7, 18.1], WINDOWS, [0, 5.0, -10]),
  ];
  const speedboat = [
    ...hull(3.5, 11, WHITE),
    box([3.55, 0.4, 7.5], 0xc8282d, [0, 1.3, -1.5]), // red stripe
    box([2.6, 1.0, 2.0], WINDOWS, [0, 2.5, 0.5]), // windscreen and cockpit
  ];
  // A whale, 32 m long and 10.5 m wide across its flukes, its head along +z; its flukes apart.
  const WHALE = 0x46566a;
  const whale = mergeGeometries([
    part(
      new THREE.LatheGeometry(
        [
          [0, -16],
          [0.75, -13.75],
          [1.6, -10],
          [2.9, -5],
          [3.75, 0],
          [4.1, 5],
          [3.9, 10],
          [3, 13.75],
          [1.6, 15.75],
          [0, 16],
        ].map(([r, z]) => new THREE.Vector2(r, z)),
        12,
      )
        .rotateX(Math.PI / 2)
        .scale(1, 0.8, 1),
      WHALE,
      [0, 1.2, 0],
    ),
    ...[-1, 1].map((side) =>
      part(new THREE.BoxGeometry(3.2, 0.3, 1.75).rotateZ(-side * 0.35), WHALE, [
        side * 3.9,
        0.2,
        6,
      ]),
    ), // flippers
    part(new THREE.ConeGeometry(0.6, 1.1, 4).scale(0.5, 1, 2), WHALE, [0, 3.3, -7.5]), // dorsal fin
    ...[-1, 1].map((side) =>
      part(new THREE.BoxGeometry(0.4, 0.4, 0.4), 0x111111, [side * 3.25, 1.5, 12.5]),
    ), // eyes
  ]);
  // Its flukes, turning up and down about where they meet its tail (their origin).
  const flukes = part(
    new THREE.ExtrudeGeometry(
      new THREE.Shape(
        [
          [0, 0.6],
          [1.9, -0.6],
          [5.25, -2.75],
          [4.5, -3.75],
          [1.5, -2.75],
          [0, -3.25],
          [-1.5, -2.75],
          [-4.5, -3.75],
          [-5.25, -2.75],
          [-1.9, -0.6],
        ].map(([x, z]) => new THREE.Vector2(x, z)),
      ),
      { depth: 0.4, bevelEnabled: false },
    ).rotateX(Math.PI / 2),
    WHALE,
    [0, 0.2, 0],
  );
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // eye: where one rides along, above the wheelhouse, the upper deck or the cockpit.
  const types = [
    { geometry: mergeGeometries(tanker), length: 90, eye: [0, 7, -35] },
    { geometry: mergeGeometries(container), length: 70, eye: [0, 7, -26] },
    { geometry: mergeGeometries(passenger), length: 50, eye: [0, 7, -4] },
    { geometry: mergeGeometries(speedboat), length: 11, eye: [0, 3.5, -1.5] },
  ];
  // Each ship a little different: its colours tinted by one of these.
  const tints = [0xffffff, 0xcfe0ff, 0xffe2c4, 0xd6f5d0, 0xffd2d2, 0xe6d6ff, 0xfff3b0];
  const fleet = [...Array(SHIPS)].map((_, i) => {
    const { geometry, length, eye } = types[i % types.length];
    const tinted = material.clone();
    tinted.color.set(tints[(i * 3) % tints.length]);
    const mesh = new THREE.Mesh(geometry, tinted);
    mesh.matrixAutoUpdate = false; // placed by update()
    return { mesh, length, eye, start: (total * i) / SHIPS }; // evenly spaced on the course
  });
  // Whale families among the ships, each halfway between two: a large one ahead, a smaller one and
  // a calf behind, FOLLOW metres apart, so each leaps where the one ahead did. A whale swims at the
  // surface, dives DEEP metres, comes up and leaps out at LEAP metres per second, falls back and
  // dips in, then blows a spout (its rise above its course: height, c seconds after it fell back).
  const [FAMILIES, FOLLOW, DEEP, LEAP, GRAVITY] = [2, 60, 12, 12, 9.8];
  const RISE = (DEEP * Math.PI) / 2 / LEAP; // seconds up from the depth
  const CYCLE = 12 + RISE + (2 * LEAP) / GRAVITY; // seconds
  const height = (c) => {
    if (c < 2) return -2 * Math.sin((Math.PI * c) / 2); // dipping in
    if (c < 8) return 0;
    if (c < 12) return -DEEP * Math.sin((Math.PI * (c - 8)) / 8); // diving
    if (c < 12 + RISE) return -DEEP * Math.cos((Math.PI * (c - 12)) / 2 / RISE); // coming up
    c -= 12 + RISE;
    return LEAP * c - (GRAVITY / 2) * c * c; // leaping
  };
  // Whether a whale leaps in its cycle n (from falling back): not while it waits, nor if a bridge
  // spans the course from FREE metres before its dive to FREE metres past its spout, reckoned from
  // where it is now (w.d, w.t: its time), as if it went on; if it waits, it leaps short of there.
  // bridged: by 5 m of the course.
  const FREE = 20;
  const bridged = [];
  const spot = new THREE.Vector3();
  const spans = (i) => {
    const { x, z } = at(i * 5, spot);
    return bridgeDecks().heights(x, z).length > 0;
  };
  const leaps = (w, n) => {
    if (n in w.leaps) return w.leaps[n];
    if (w.waiting) return (w.leaps[n] = false);
    const from = w.d + (n * CYCLE + 8 - w.t) * SPEED - FREE;
    for (let d = from; d < from + (CYCLE - 1) * SPEED + 2 * FREE; d += 5) {
      const i = Math.floor(mod(d) / 5);
      if ((bridged[i] ??= spans(i))) return (w.leaps[n] = false);
    }
    return (w.leaps[n] = true);
  };
  // A whale's rise above its course t seconds after its start, if it leaps then.
  const rise = (w, t) => {
    const n = Math.floor(t / CYCLE);
    const c = t - n * CYCLE;
    return leaps(w, c < 8 ? n - 1 : n) ? w.size * height(c) : 0;
  };
  // Its spout: DROPS droplets thrown up from its blowhole (HOLE), one after another for BURST
  // seconds once it has dipped in; each is shown until it falls below its back, else hidden
  // inside it.
  const [BURST, DROPS] = [2, 400];
  const HOLE = new THREE.Vector3(0, 4.3, 9);
  const throws = [...Array(DROPS)].map(
    () =>
      new THREE.Vector3(
        Math.random() * 2.4 - 1.2,
        9 + Math.random() * 3,
        Math.random() * 2.4 - 2.7, // a little backwards, as it swims on
      ),
  );
  const spray = new THREE.PointsMaterial({
    map: glow(0xffffff).map, // a soft round dot
    size: 0.6,
    transparent: true,
    depthWrite: false,
  });
  const whales = [...Array(FAMILIES)].flatMap((_, f) =>
    [1, 0.8, 0.5].map((size, k) => {
      const mesh = new THREE.Mesh(whale, material.clone());
      mesh.matrixAutoUpdate = false;
      const tail = new THREE.Mesh(flukes, mesh.material);
      tail.position.set(0, 1.2, -15.6);
      const drops = new THREE.BufferAttribute(new Float32Array(DROPS * 3), 3);
      const spout = new THREE.Points(
        new THREE.BufferGeometry().setAttribute("position", drops),
        spray,
      );
      spout.frustumCulled = false; // its bounds are never computed
      spout.raycast = () => {}; // not clicked
      mesh.add(tail, spout);
      const start = (total * (f * (SHIPS / FAMILIES) + 0.5)) / SHIPS - k * FOLLOW;
      const delay = (k * FOLLOW) / SPEED;
      const [length, eye] = [32 * size, [0, 6.5, 3]];
      return { mesh, tail, drops, size, delay, blowing: false, start, leaps: {}, length, eye };
    }),
  );
  fleet.push(...whales);
  // Each with its distance along the course (d) and the one ahead of it.
  const ring = fleet.toSorted((a, b) => mod(a.start) - mod(b.start));
  ring.forEach((ship, k) => {
    ship.d = ship.start;
    ship.ahead = ring[(k + 1) % ring.length];
  });
  const [drop, scale] = [new THREE.Vector3(), new THREE.Vector3()];
  const tilt = new THREE.Matrix4();

  const [front, back, forward, right, up] = [...Array(5)].map(() => new THREE.Vector3());
  const yAxis = new THREE.Vector3(0, 1, 0);
  const update = (seconds, dt) => {
    for (const ship of fleet) {
      ship.waiting = !mayGo(ship, SPEED * dt, seconds);
      if (!ship.waiting) ship.d += SPEED * dt;
      const d = ship.d;
      at(d + ship.length / 2, front);
      at(d - ship.length / 2, back);
      forward.subVectors(front, back).setY(0).normalize();
      right.crossVectors(yAxis, forward).normalize();
      up.crossVectors(forward, right);
      const b = boost(at(d, front));
      ship.mesh.matrix
        .makeBasis(right.multiplyScalar(b), up.multiplyScalar(b), forward)
        .setPosition(front);
    }
    // The whales, raised or lowered by height, nose up while rising, flukes beating.
    for (const w of whales) {
      const t = (w.t = seconds - w.delay);
      const climb = rise(w, t + 0.5) - rise(w, t - 0.5); // metres in the second around t
      w.mesh.matrix.multiply(
        tilt.makeRotationX(-Math.atan2(climb, SPEED)).scale(scale.setScalar(w.size)),
      );
      w.mesh.matrix.elements[13] += rise(w, t);
      w.tail.rotation.x = 0.35 * Math.sin(1.6 * seconds + w.delay);
      const n = Math.floor(t / CYCLE);
      const blow = t - n * CYCLE - 2;
      const on = blow >= 0 && blow < BURST + 3 && leaps(w, n - 1);
      if (!on && !w.blowing) continue; // all hidden already
      w.blowing = on;
      throws.forEach((velocity, i) => {
        const age = blow - (i / DROPS) * BURST;
        drop.copy(HOLE).addScaledVector(velocity, age).y -= (GRAVITY / 2) * age * age;
        if (!on || age < 0 || drop.y < HOLE.y - 1) drop.set(0, 0, 0);
        w.drops.setXYZ(i, drop.x, drop.y, drop.z);
      });
      w.drops.needsUpdate = true;
    }
  };
  // The course 3 m above the water, one line segment per pair of points.
  const vertices = [];
  for (let i = 1; i < n; i++)
    for (const j of [i - 1, i])
      vertices.push(course[3 * j], course[3 * j + 1] + 3, course[3 * j + 2]);
  const route = checkLines(vertices);
  route.visible = false;
  const ride = riders(
    fleet.map(({ mesh, eye }) => ({
      object: mesh,
      materials: [mesh.material],
      eye,
      ahead: [0, 4, 200],
    })),
  );
  return { meshes: fleet.map((ship) => ship.mesh), route, update, ride };
}
