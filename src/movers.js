import * as THREE from "three";
import { highlightShader } from "./highlight.js";
import { night } from "./daylight.js";
import { ROAD, trainCar, tramCar } from "./vehicles.js";
import { checkLines } from "./lines.js";

export const CELL = 20; // metres of the grids of the traffic's car points
export const cell = (x, z) => (Math.floor(x / CELL) + 1000) * 4096 + Math.floor(z / CELL) + 1000;
export const WARN = 1.2; // seconds of a vehicle's way ahead that people flee from (traffic, danger)
export const STRETCH = 15; // metres, at most, of a stretch of the way ahead (traffic)
export const CELLS = 512; // cells each way of the grid of the cars noted, the scene's origin in its middle
export const carCell = (x, z) =>
  (Math.floor(x / CELL) + CELLS / 2) * CELLS + Math.floor(z / CELL) + CELLS / 2;

// What moves along paths (tools/paths.mjs): trams, trains and cars, all called vehicles below;
// boost, camera, heightAt: src/main.js's.
// A vehicle has CARS cars (one for road vehicles); each car follows the path on its
// own, so long vehicles bend in curves. Its variant (say a goods train or a lorry) sets the model,
// length, height and colour of its cars.
// Also returns the paths as lines to check them (checkLines), one per line named by its ref (a
// loop of two lines has two), in a group hidden at first.
// A vehicle waits while a car of another one is on its own path just ahead: within ALONG of any
// point every ALONG up to LOOK ahead and at most SIDE beside it, so nothing that joins its path
// (at a switch or crossing) is missed.
// Those on the parallel way of the other direction pass; those ahead and at crossings block.
// Trams and trains go first: they wait only for each other, cars for all. Every path is a closed
// loop that its vehicles run round forever, about SPACING apart (round trips of cars by their
// share of the roads, so shared roads are not more crowded); on a route marked every, its VARIANTS
// in turn (at least one of each: tram colours, kinds of train, models of ROAD), not by chance.
export function createMovers({ routes }, points, kind, traffic, { boost, camera, heightAt }) {
  const pick = (r, list) => list[Math.floor(r * list.length) % list.length];
  const KINDS = {
    tram: {
      CARS: 4,
      GAP: 0.6, // metres between cars
      SPACING: 1500, // metres
      SPEED: 10, // metres per second
      LOOK: 25, // metres
      ALONG: 8, // metres; at least half the distance between a car's front, centre and back
      SIDE: 2, // metres; less than the distance to the track of the other direction (3.5 m)
      HALF: 1.15, // metres, half the width (tramCar)
      EYE: 2.4, // metres above the path, when riding
      models: () => [tramCar()],
      // BLT yellow, BVB green (on a route marked every, in turn).
      VARIANTS: 2,
      variant: ({ operator, every }, _, k) => ({
        length: 8,
        height: 3,
        color: (every ? k % 2 : operator === "BLT") ? 0xf2c400 : 0x2e8b3a,
      }),
    },
    train: {
      CARS: 5,
      GAP: 1,
      SPACING: 5000,
      SPEED: 22,
      LOOK: 60,
      ALONG: 15,
      SIDE: 2, // tracks of the other direction are about 4.5 m away
      HALF: 1.5,
      EYE: 2.6,
      models: () => [trainCar(false), trainCar(true)],
      // White passenger trains, a quarter blue goods trains (green and yellow only for trams; on
      // a route marked every, in turn).
      VARIANTS: 2,
      variant: ({ every }, r, k) =>
        (every ? k % 2 : r < 0.25)
          ? { model: 1, length: 20, height: 3.6, color: 0x2f4f7f }
          : { length: 25, height: 4, color: 0xf2f2f0 },
    },
    car: {
      CARS: 1,
      GAP: 0,
      SPACING: 100,
      SPEED: 12,
      LOOK: 9,
      ALONG: 2.5,
      SIDE: 1.2, // the lane of the other direction is 3.6 m away
      HALF: 1, // of most (ROAD)
      EYE: 1.2,
      models: () => ROAD.map(({ shape }) => shape()),
      VARIANTS: ROAD.length,
      // A model of ROAD by its share (on a route marked every, the k-th in turn), in one of its
      // colours.
      variant: ({ every }, r, k) => {
        let model = every ? k % ROAD.length : 0;
        for (let below = ROAD[0].share; !every && r >= below && model < ROAD.length - 1;)
          below += ROAD[++model].share;
        const { length, colors } = ROAD[model];
        return { model, length, height: 1, color: pick((r * 7919) % 1, colors) };
      },
    },
  };
  const { CARS, GAP, SPACING, SPEED, LOOK, ALONG, SIDE, HALF, EYE, models, VARIANTS, variant } =
    KINDS[kind];
  // Far away the cars grow higher, but at most this much wider, so that cars on neighbouring tracks
  // and lanes never overlap.
  const MAX_WIDER = 1.4;

  const lines = routes.map(({ ref, start, count, length, share, operator, parts, every }) => ({
    start,
    count,
    operator,
    every,
    ref,
    length,
    share: share ?? length,
    step: length / count, // metres between points
    parts: parts ?? [{ ref, from: 0 }], // where each line runs (more than one: tools/paths.mjs)
  }));
  // The point d metres along a line, round and round its loop.
  function at(line, d, out) {
    const f = (((d % line.length) + line.length) % line.length) / line.step;
    const k = Math.min(Math.floor(f), line.count - 1);
    const t = f - k;
    const i = 3 * (line.start + k);
    const j = 3 * (line.start + ((k + 1) % line.count));
    return out.set(
      points[i] + (points[j] - points[i]) * t,
      points[i + 1] + (points[j + 1] - points[i + 1]) * t,
      points[i + 2] + (points[j + 2] - points[i + 2]) * t,
    );
  }

  // Vehicles start evenly about SPACING apart on each loop; d is how far each one's front is along
  // it. Where loops share a way, one that would start on or right behind another (of any kind) is
  // left out.
  const random = (i) => (Math.abs(Math.sin(i * 12.9898 + 78.233)) * 43758.5453) % 1;
  const { taken, blockers } = traffic;
  const spot = new THREE.Vector3();
  const vehicles = [];
  for (const line of lines) {
    const n = Math.max(line.every ? VARIANTS : 1, Math.round(line.share / SPACING));
    for (let k = 0; k < n; k++) {
      const {
        length,
        height,
        color,
        model = 0,
      } = variant(line, random(vehicles.length + k * 7919), k);
      const total = CARS * (length + GAP);
      const d = (k * line.length) / n;
      const body = [];
      for (let s = d - total; s <= d + LOOK; s += Math.min(2, length)) {
        at(line, s, spot);
        body.push(spot.x, spot.z);
      }
      let free = true;
      for (let b = 0; b < body.length && free; b += 2)
        for (let i = -1; i <= 1 && free; i++)
          for (let j = -1; j <= 1 && free; j++) {
            const list = taken.get(cell(body[b] + i * CELL, body[b + 1] + j * CELL)) ?? [];
            for (let q = 0; q < list.length && free; q += 2)
              free = Math.hypot(list[q] - body[b], list[q + 1] - body[b + 1]) > SIDE;
          }
      if (!free) continue;
      vehicles.push({ line, d, start: d, length, height, model, color: new THREE.Color(color) });
      for (let b = 0; b < body.length; b += 2) {
        const key = cell(body[b], body[b + 1]);
        if (!taken.has(key)) taken.set(key, []);
        taken.get(key).push(body[b], body[b + 1]);
      }
    }
  }
  // Per model (a geometry of length 1 along +z, scaled per car, white tinted per vehicle): its
  // vehicles (fleet; a vehicle's slot is its place there) and their cars as instances of one mesh,
  // in one draw call. Of each fleet's material, the uniforms that show the cars of the vehicle
  // under the mouse, instances highlightFrom to highlightTo - 1, and the shader that keeps the parts
  // of a car meant for the first or last one only (piece) and lights its lamps, the more at night.
  const geometries = models();
  const fleets = geometries.map(() => []);
  vehicles.forEach((vehicle, v) => {
    vehicle.slot = fleets[vehicle.model].length;
    fleets[vehicle.model].push(v);
  });
  const ranges = geometries.map(() => ({ highlightFrom: { value: 0 }, highlightTo: { value: 0 } }));
  const meshes = geometries.map((geometry, m) => {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    material.customProgramCacheKey = () => kind; // the shader depends on CARS
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, ranges[m], { lampNight: night });
      highlightShader(
        shader,
        "gl_InstanceID >= highlightFrom && gl_InstanceID < highlightTo",
        "uniform int highlightFrom, highlightTo;",
      );
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute float only;\nvarying float vLamp;",
        )
        .replace(
          "#include <color_vertex>",
          `#include <color_vertex>
          vLamp = only > 2.5 && only < 4.5 ? 1.0 : 0.0;
          if (only > 2.5) vColor.rgb = color.rgb;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          int part = int(only + 0.5) - (only > 2.5 ? 2 : 0), car = gl_InstanceID % ${CARS};
          if (part == 1 && car != 0 || part == 2 && car != ${CARS - 1}) transformed = vec3(0.0);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying float vLamp;\nuniform float lampNight;",
        )
        .replace(
          "#include <opaque_fragment>",
          // Lit, the more at night.
          "if (vLamp > 0.5) outgoingLight = diffuseColor.rgb * (1.0 + 2.0 * lampNight);\n#include <opaque_fragment>",
        );
    };
    const mesh = new THREE.InstancedMesh(geometry, material, fleets[m].length * CARS);
    mesh.frustumCulled = false; // the vehicles move all over the city
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity); // so any ray may meet one
    return mesh;
  });
  vehicles.forEach(({ model, slot, color }) => {
    for (let c = 0; c < CARS; c++) meshes[model].setColorAt(slot * CARS + c, color);
  });

  // The loops 3 m above the ground, one line segment per pair of points, each part of a loop on
  // its own (part.lines), for trams in the line's colour.
  const routeLines = new THREE.Group();
  for (const line of lines)
    line.parts.forEach((part, p) => {
      const next = line.parts[p + 1];
      const end = next ? Math.ceil(next.from / line.step) : line.count;
      const vertices = [];
      for (let k = Math.ceil(part.from / line.step); k < end; k++)
        for (const j of [line.start + k, line.start + ((k + 1) % line.count)])
          vertices.push(points[3 * j], points[3 * j + 1] + 3, points[3 * j + 2]);
      const color = kind === "tram" ? part.colour : undefined;
      part.lines = Object.assign(checkLines(vertices, color), { name: part.ref });
      routeLines.add(part.lines);
    });
  routeLines.visible = false;

  const [front, back, forward, right, up, ahead, behind] = [...Array(7)].map(
    () => new THREE.Vector3(),
  );
  const yAxis = new THREE.Vector3(0, 1, 0);

  // Gaps where a bridge was blown up (cut): per line, per point whether it lies on such a deck. A
  // vehicle with a car over one vanishes (vehicle.away: seconds left) for BACK seconds, then is
  // back at its start unless that is in a gap too. Meanwhile it is in nobody's way.
  const BACK = 20; // seconds
  const pointAt = (line, d) =>
    Math.floor((((d % line.length) + line.length) % line.length) / line.step) % line.count;
  const overGap = ({ line, length }, d) => {
    if (!line.gone) return false;
    for (let s = d - CARS * (length + GAP); s <= d; s += line.step)
      if (line.gone[pointAt(line, s)]) return true;
    return line.gone[pointAt(line, d)] === 1;
  };

  // Vehicles by their index in traffic.blockers.
  const first = blockers.length;
  blockers.push(...vehicles.map(() => -1));
  traffic.halves.push(...vehicles.map(() => HALF));
  const rail = kind === "car" ? 0 : 1;
  const stretches = Math.ceil((SPEED * WARN) / STRETCH);
  const stretch = (SPEED * WARN) / stretches; // metres
  // Room for the points of its cars and stretches ahead among the traffic's.
  const room = 3 * (CARS + stretches) * vehicles.length;
  traffic.xz = new Float64Array(traffic.xz.length + 2 * room);
  traffic.y = new Float32Array(traffic.y.length + room);
  traffic.of = new Int32Array(traffic.of.length + 3 * room);
  // Into the cars' grid (head, tail), or the stretches' (rail -1: ways, waysTail), so vehicles
  // looking ahead go through cars alone.
  const note = (p, v, r = rail) => {
    const { xz, y, of } = traffic;
    const head = r < 0 ? traffic.ways : traffic.head;
    const tail = r < 0 ? traffic.waysTail : traffic.tail;
    const n = traffic.noted++;
    const c = carCell(p.x, p.z);
    xz[2 * n] = p.x;
    xz[2 * n + 1] = p.z;
    y[n] = p.y;
    of[3 * n] = first + v;
    of[3 * n + 1] = r;
    of[3 * n + 2] = -1;
    if (head[c] < 0) head[c] = n;
    else of[3 * tail[c] + 2] = n;
    tail[c] = n;
  };
  // The vehicle other than self with a car at the point d metres along line that this kind waits
  // for, or -1.
  const occupied = (line, d, self) => {
    at(line, d, ahead);
    at(line, d - 1, behind);
    const length = Math.hypot(ahead.x - behind.x, ahead.z - behind.z) || 1;
    const fx = (ahead.x - behind.x) / length;
    const fz = (ahead.z - behind.z) / length;
    const { xz, of, head } = traffic;
    // The cell there and those round it: CELLS apart across (x), 1 along (z); first whether a
    // point counts at all (its rail, not self: most do not), then where it is.
    const centre = carCell(ahead.x, ahead.z);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let q = head[centre + i * CELLS + j]; q >= 0; q = of[3 * q + 2]) {
          if (of[3 * q + 1] < rail || of[3 * q] === self) continue;
          const dx = xz[2 * q] - ahead.x;
          const dz = xz[2 * q + 1] - ahead.z;
          if (Math.abs(dx * fx + dz * fz) < ALONG && Math.abs(dx * fz - dz * fx) < SIDE)
            return of[3 * q];
        }
    return -1;
  };
  // Vehicles further than FAR from the camera (their first car's middle) look ahead only every
  // SLOW-th frame and move on their last result in between, and are placed only every other frame
  // (place), each on its own frame; from afar nobody sees the difference.
  const FAR = 1500; // metres
  const SLOW = 6;
  let frame = 0;
  // Notes a point of the vehicle being placed (marking), and keeps it in its marks.
  let [marks, marking] = [[], -1];
  const last = new THREE.Vector3();
  const mark = (p, r = rail) => {
    note(p, marking, r);
    marks.push(p.x, p.y, p.z, r);
  };
  // Places the cars and notes their points and those of the stretches ahead; those of a vehicle
  // away are hidden.
  const place = () => {
    vehicles.forEach((vehicle, v) => {
      const { line, d, length, height, away, model, slot } = vehicle;
      // Far away, placed only every other frame (half of them in turn): in between, its points
      // noted where they were last, so the others still wait for it.
      if (vehicle.far && away === undefined && vehicle.marks && (v + frame) % 2) {
        const kept = vehicle.marks;
        for (let k = 0; k < kept.length; k += 4)
          note(last.set(kept[k], kept[k + 1], kept[k + 2]), v, kept[k + 3]);
        return;
      }
      marks = vehicle.marks ??= [];
      marks.length = 0;
      marking = v;
      const matrices = meshes[model].instanceMatrix.array;
      for (let s = 0; s < stretches && away === undefined; s++) {
        at(line, d + (s + 1) * stretch, front);
        at(line, d + s * stretch, back);
        mark(front, -1);
        mark(back, -1);
        mark(front.add(back).multiplyScalar(0.5), -1);
      }
      for (let c = 0; c < CARS; c++) {
        const m = 16 * (slot * CARS + c);
        if (away !== undefined) {
          matrices.fill(0, m, m + 15); // no size
          continue;
        }
        const end = d - c * (length + GAP);
        at(line, end, front);
        at(line, end - length, back);
        forward.subVectors(front, back).normalize();
        right.crossVectors(yAxis, forward).normalize();
        up.crossVectors(forward, right);
        mark(front);
        mark(back);
        const centre = front.add(back).multiplyScalar(0.5);
        mark(centre);
        if (c === 0) vehicle.far = camera.position.distanceTo(centre) > FAR;
        const b = boost(centre);
        right.multiplyScalar(Math.min(b, MAX_WIDER));
        up.multiplyScalar(b * height);
        forward.multiplyScalar(length);
        // Its axes and its place, column by column.
        matrices[m] = right.x;
        matrices[m + 1] = right.y;
        matrices[m + 2] = right.z;
        matrices[m + 4] = up.x;
        matrices[m + 5] = up.y;
        matrices[m + 6] = up.z;
        matrices[m + 8] = forward.x;
        matrices[m + 9] = forward.y;
        matrices[m + 10] = forward.z;
        matrices[m + 12] = centre.x;
        matrices[m + 13] = centre.y;
        matrices[m + 14] = centre.z;
      }
    });
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
    // The whole cars on their cars (none on one away, as its matrix has no size).
    for (const { mesh, on } of coats) {
      const out = mesh.instanceMatrix.array;
      for (let i = 0; i < on.length; i += 3) {
        const { model, slot } = vehicles[on[i]];
        car.fromArray(meshes[model].instanceMatrix.array, 16 * (slot * CARS + on[i + 1]));
        car.multiply(sides[on[i + 2] > 0 ? 0 : 1]).toArray(out, (16 * i) / 3);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  // Notes for each vehicle what it waits for.
  const look = () => {
    frame++;
    vehicles.forEach(({ line, d, far, away }, v) => {
      if (far && (v + frame) % SLOW) return;
      blockers[first + v] = -1;
      if (away !== undefined) return;
      for (let s = ALONG; s <= LOOK && blockers[first + v] < 0; s += ALONG)
        blockers[first + v] = occupied(line, d + s, first + v);
    });
  };
  // Moves each vehicle that waits for none, but those on the museum's round while held; one over a
  // gap, even a waiting one, vanishes.
  let held = false;
  const move = (dt) => {
    vehicles.forEach((vehicle, v) => {
      if (vehicle.away !== undefined) {
        vehicle.away -= dt;
        if (vehicle.away > 0 || overGap(vehicle, vehicle.start)) return;
        vehicle.away = undefined;
        vehicle.d = vehicle.start;
      } else if (overGap(vehicle, vehicle.d)) vehicle.away = BACK;
      else if (blockers[first + v] < 0 && !(held && vehicle.line.ref === "Museum"))
        vehicle.d = (vehicle.d + SPEED * dt) % vehicle.line.length;
    });
  };
  // Marks the points of the loops that lie on deck (from deckOf) as a gap, but only where they
  // are at least ABOVE over the terrain, not where the bridge's ends lie on the ground.
  const ABOVE = 2; // metres
  const cut = (deck) => {
    for (const line of lines)
      for (let k = 0; k < line.count; k++) {
        const [x, y, z] = points.subarray(3 * (line.start + k), 3 * (line.start + k) + 3);
        if (y - heightAt(x, z) >= ABOVE && deck.covers(x, y, z))
          (line.gone ??= new Uint8Array(line.count))[k] = 1;
      }
  };
  // The front of vehicle v: the camera just ahead of it at eye height, looking 40 m ahead.
  const cab = (v, view) => {
    const { line, d } = vehicles[v];
    at(line, d + 0.5, front);
    at(line, d + 40, ahead);
    view.position.set(front.x, front.y + EYE, front.z);
    view.lookAt(ahead.x, ahead.y + EYE * 0.8, ahead.z);
  };
  // The part of its loop vehicle v is on; in out the top of its first car's middle.
  const roof = (v, out) => {
    const { line, d, length, height } = vehicles[v];
    at(line, d - length / 2, out);
    out.y += 1.1 * height * boost(out);
    return line.parts.findLast((part) => part.from <= d);
  };
  // Whole cars: a plane with material over a car's body (BODY, of its height; tramCar, trainCar)
  // just off its side, its texture read from outside, on each car of on (per car its vehicle, its
  // number in it, 0 the first, and its side, 1 right of its way, -1 left); one mesh, its instances
  // these, in painted; returns that mesh.
  const BODY = [0.17, 1.03];
  const OUT = 0.04; // metres off its side, beyond its windows
  const sides = [1, -1].map((side) =>
    new THREE.Matrix4()
      .makeBasis(new THREE.Vector3(0, 0, -side), yAxis, new THREE.Vector3(side, 0, 0))
      .scale(new THREE.Vector3(1, BODY[1] - BODY[0], 1))
      .setPosition(side * (HALF + OUT), (BODY[0] + BODY[1]) / 2, 0),
  );
  const [PLANE, car, coats] = [new THREE.PlaneGeometry(1, 1), new THREE.Matrix4(), []];
  const painted = new THREE.Group();
  const coat = (material, on) => {
    const mesh = new THREE.InstancedMesh(PLANE, material, on.length / 3);
    mesh.frustumCulled = false; // the vehicles move all over the city
    coats.push({ mesh, on });
    painted.add(mesh);
    return mesh;
  };
  const vehicleOf = (hit) => fleets[meshes.indexOf(hit.object)][Math.floor(hit.instanceId / CARS)];
  // Shows vehicle v in HIGHLIGHT; -1: none.
  const highlight = (v) =>
    ranges.forEach((range, m) => {
      const on = v >= 0 && vehicles[v].model === m;
      range.highlightFrom.value = on ? vehicles[v].slot * CARS : 0;
      range.highlightTo.value = on ? (vehicles[v].slot + 1) * CARS : 0;
    });
  return {
    meshes,
    objects: meshes, // to click, as in riders
    routes: routeLines,
    count: vehicles.length,
    place,
    look,
    move,
    cab,
    roof,
    vehicleOf,
    highlight,
    cut,
    hold: (on) => (held = on), // the museum's round's vehicles standing or going
    away: (v) => vehicles[v].away !== undefined, // vanished at a gap, for a while
    cars: CARS,
    // The vehicles on the museum's round (src/main.js).
    museum: vehicles.flatMap(({ line }, v) => (line.ref === "Museum" ? [v] : [])),
    // A car's body of vehicle v: its length and height in metres.
    side: (v) => [vehicles[v].length, vehicles[v].height * (BODY[1] - BODY[0])],
    coat,
    painted,
  };
}
