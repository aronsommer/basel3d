import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { glow, part } from "./parts.js";
import { checkLines } from "./lines.js";
import { riders } from "./riders.js";

// Ships on their round course on the Rhine (tools/ships.mjs), which keeps clear of the bridge
// piers and the sea monster: SHIPS tankers, container ships, passenger ships and speedboats in
// turn, evenly spaced and all at the same speed. Each is at most 11 m wide (the course keeps 10 m
// clear around its middle) and 6 m high, to pass under the bridges. Whale families swim among
// them, diving out of traffic's way (danger, src/main.js). Each keeps GAP behind the one ahead.
// The ferries (src/ferries.js) keep out of its lane while it comes and passes, and before a
// ferry's line it stops only while the ferry is in it still.
export function createShips(course, ferries, boost, bridgeDecks, danger) {
  const SPEED = 5; // metres per second
  const SHIPS = 12; // about one every 1.1 km of the course
  const GAP = 20; // metres
  const ZONE = 30; // metres along the course each side of a ferry's line: its hull and rope
  const LANE = 12; // metres the ferry is off the course there at least: half a ship and a ferry
  const SEE = 40; // metres before ZONE from where the ferry keeps out of a ship's lane
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
  // Whether a ship may go on by step metres: GAP behind the one ahead, and into ZONE of a ferry's
  // line only while the ferry is LANE or more off the course there.
  const mayGo = (ship, step) => {
    const ahead = mod(ship.ahead.d - ship.d) - (ship.length + ship.ahead.length) / 2;
    const front = ship.d + ship.length / 2;
    return (
      ahead - step >= GAP &&
      crossings.every(
        ({ ferry, distance, across }) =>
          mod(distance - ZONE - front) >= step || Math.abs(ferry.p - across) >= LANE,
      )
    );
  };
  // The ferries keep LANE off the course from SEE before ZONE of their line until its back is ZONE
  // past.
  const keepOff = (ship) => {
    for (const { ferry, distance, across } of crossings) {
      const before = mod(distance - ZONE - ship.d - ship.length / 2);
      if (before < SEE || total - before < 2 * ZONE + ship.length)
        ferry.keepOff(across - LANE, across + LANE);
    }
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
  // A whale, 32 m long and 10.5 m wide across its flukes, its head along +z; its flukes apart. Its
  // flippers flap about their roots (FLIPPER: x, y; the left one's x negative), marked by flap: ±1
  // which side, 0 for the rest.
  const WHALE = 0x46566a;
  const FLIPPER = [2.4, 0.75];
  const flapping = (side, g) =>
    g.setAttribute(
      "flap",
      new THREE.Float32BufferAttribute(Array(g.attributes.position.count).fill(side), 1),
    );
  const whale = mergeGeometries(
    [
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
        flapping(
          side,
          part(new THREE.BoxGeometry(3.2, 0.3, 1.75).rotateZ(-side * 0.35), WHALE, [
            side * 3.9,
            0.2,
            6,
          ]),
        ),
      ), // flippers
      part(new THREE.ConeGeometry(0.6, 1.1, 4).scale(0.5, 1, 2), WHALE, [0, 3.3, -7.5]), // dorsal fin
      ...[-1, 1].map((side) =>
        part(new THREE.BoxGeometry(0.4, 0.4, 0.4), 0x111111, [side * 3.25, 1.5, 12.5]),
      ), // eyes
    ].map((g) => (g.attributes.flap ? g : flapping(0, g))),
  );
  // A whale's material, its flippers turned about their roots by its own flap (radians, down
  // negative).
  const flapped = (material) => {
    const flap = { value: 0 };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.flapAngle = flap;
      shader.vertexShader = shader.vertexShader
        .replace("void main() {", "attribute float flap;\nuniform float flapAngle;\nvoid main() {")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          if (flap != 0.0) {
            vec2 root = vec2(flap * ${FLIPPER[0].toFixed(2)}, ${FLIPPER[1].toFixed(2)});
            float a = flap * flapAngle;
            transformed.xy = root + mat2(cos(a), sin(a), -sin(a), cos(a)) * (transformed.xy - root);
          }`,
        );
    };
    material.customProgramCacheKey = () => "whale";
    return flap;
  };
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
  // surface, dives DEEP metres steeply, stays down, comes up and leaps out at LEAP metres per
  // second, rolling, falls back and dips in, then blows a spout (its rise above its course:
  // height, c seconds after it fell back). Its flukes beat and its flippers flap, the harder the
  // steeper it goes. In traffic it dives DEEP metres, coming up again CALM seconds after.
  const [FAMILIES, FOLLOW, DEEP, LEAP, GRAVITY] = [2, 60, 12, 12, 9.8];
  // Seconds calm before it comes up from traffic, metres a second it dives and comes up; its
  // flukes beat BEAT radians a second, more by HARD at its steepest, ROLL radians it turns over at
  // the top of its leap, to one side or the other by leap and whale.
  const [CALM, DUCK, BEAT, HARD, ROLL] = [2.5, 4, 1.6, 4, 0.9];
  const TOP = (LEAP * LEAP) / 2 / GRAVITY; // metres up a leap goes
  const RISE = (DEEP * Math.PI) / 2 / LEAP; // seconds up from the depth
  const CYCLE = 12 + RISE + (2 * LEAP) / GRAVITY; // seconds
  const height = (c) => {
    if (c < 2) return -2 * Math.sin((Math.PI * c) / 2); // dipping in
    if (c < 8) return 0;
    if (c < 10) return -DEEP * Math.sin((Math.PI * (c - 8)) / 4); // diving
    if (c < 12) return -DEEP; // down
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
      const flap = flapped(mesh.material);
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
      // Its flukes' and flippers' phase; metres it is down out of traffic, seconds calm since; a
      // number for the side it rolls to.
      const beat = { beat: delay, flap, duck: 0, calm: CALM, seed: f + k };
      return {
        mesh,
        tail,
        drops,
        size,
        delay,
        blowing: false,
        start,
        leaps: {},
        length,
        eye,
        ...beat,
      };
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
  const [tilt, roll] = [new THREE.Matrix4(), new THREE.Matrix4()];

  const [front, back, forward, right, up] = [...Array(5)].map(() => new THREE.Vector3());
  const yAxis = new THREE.Vector3(0, 1, 0);
  const update = (seconds, dt) => {
    for (const ship of fleet) {
      ship.waiting = !mayGo(ship, SPEED * dt);
      if (!ship.waiting) ship.d += SPEED * dt;
      keepOff(ship);
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
    // The whales, raised or lowered by height (and out of traffic), nose up while rising, rolling
    // at the top of a leap, flukes beating and flippers flapping.
    for (const w of whales) {
      const t = (w.t = seconds - w.delay);
      const climb = rise(w, t + 0.5) - rise(w, t - 0.5); // metres in the second around t
      const m = w.mesh.matrix.elements;
      const inDanger = dt && danger(m[12], m[13], m[14], 0, false, 0, 0, w.length / 2);
      w.calm = inDanger ? 0 : w.calm + dt;
      const down = w.calm < CALM ? DEEP * w.size : 0;
      w.duck += THREE.MathUtils.clamp(down - w.duck, -DUCK * dt, DUCK * dt);
      const up = rise(w, t);
      const n = Math.floor(t / CYCLE);
      const side = (n + w.seed) % 2 ? 1 : -1; // which way it rolls, by leap and whale
      w.mesh.matrix.multiply(
        tilt
          .makeRotationX(-Math.atan2(climb, SPEED))
          .multiply(roll.makeRotationZ((side * ROLL * Math.max(0, up)) / (TOP * w.size)))
          .scale(scale.setScalar(w.size)),
      );
      m[13] += up - w.duck;
      const hard = Math.min(1, Math.abs(climb) / SPEED);
      w.beat += (BEAT + HARD * hard) * dt;
      w.tail.rotation.x = (0.3 + 0.3 * hard) * Math.sin(w.beat);
      w.flap.value = (0.15 + 0.25 * hard) * Math.sin(0.5 * w.beat + 1);
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
