// Explosions of buildings and bridges, by number (see buildings.js): the original vanishes and its
// faces (walls, roof planes), cut into pieces, fly apart, fall and sink into the ground, with a
// fireball, smoke and a bang. A building leaves scorched ground, where flames keep burning.
import * as THREE from "three";
import { audio, fade } from "./sound.js";
import { PAVILION_BLACK, PAVILION_CENTRE, PAVILION_RADIUS } from "./pavilion.js";

const GRAVITY = 30; // m/s², three times real, so the pieces are down within about a second
const SINK_AT = 2.5; // seconds after the bang, when the pieces start sinking into the ground
const GONE_AT = 5; // seconds after the bang, when the pieces are gone
const PIECE = 4; // metres, about the width of the pieces of small buildings
const PIECES = 300; // per building aimed at, above which the pieces grow; more result, most ending smaller
const KEEP = 0.2; // the chance that a piece up to 6 times the pieces' width splits no further
const SPECK = 1; // m², faces smaller give no pieces (railings, edges): few in area, many in number
const THICKNESS = 0.2; // of the pieces on average, in the pieces' width
const DARKER = 0.7; // the pieces' backs, of their colour; their sides shade from front to back

// The pieces' flight, on the GPU: each vertex relative to its piece's centre (position), turning
// about the axis until it lands, then lying at the height it landed at; all sinking from SINK_AT.
const DEBRIS = /* glsl */ `
uniform float debrisAge; // seconds since the bang
uniform float debrisSink; // metres per second
attribute vec4 debrisCentre; // at the bang; w: spin, radians per second
attribute vec4 debrisVelocity; // at the bang; w: seconds until it lands
attribute vec4 debrisAxis; // w: the height it lands at
`;
const DEBRIS_VERTEX = /* glsl */ `
{
float flight = min(debrisAge, debrisVelocity.w);
float angle = debrisCentre.w * flight;
vec3 k = debrisAxis.xyz;
transformed = transformed * cos(angle) + cross(k, transformed) * sin(angle)
  + k * dot(k, transformed) * (1.0 - cos(angle));
vec3 at = debrisCentre.xyz + debrisVelocity.xyz * flight;
at.y = debrisAge < debrisVelocity.w ? at.y - ${(GRAVITY / 2).toFixed(1)} * flight * flight : debrisAxis.w;
at.y -= debrisSink * max(debrisAge - ${SINK_AT.toFixed(1)}, 0.0);
transformed += at;
}
`;
const MAX_FLAMES = 10; // per building
const FIRES = 2000; // fire particles at most
// Flames burning for good at most; beyond, the oldest go out, so new ruins burn too and the rest
// of FIRES is left for fireballs.
const BURNING = 1500;

// heightAt(x, z): the terrain height; camera: where the bang is heard.
export function createExplosions(scene, structures, heightAt, camera) {
  const running = new Set(); // per frame: step(dt), false when done
  const fire = createParticles(scene, camera, true, FIRES);
  const burning = []; // the flames burning for good, oldest first
  const smoke = createParticles(scene, camera, false, 4000);

  // All scorched ground in one mesh, growing with each building burnt down.
  const scorch = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({
      color: 0x15120f,
      side: THREE.DoubleSide,
      polygonOffset: true, // over the terrain
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  scorch.frustumCulled = false;
  scene.add(scorch);
  function addScorch(triangles) {
    const old = scorch.geometry.attributes.position?.array ?? new Float32Array(0);
    const all = new Float32Array(old.length + triangles.length);
    all.set(old);
    all.set(triangles, old.length);
    scorch.geometry.dispose();
    scorch.geometry = new THREE.BufferGeometry();
    scorch.geometry.setAttribute("position", new THREE.BufferAttribute(all, 3));
  }

  // Smoke rising by p.velocity, growing to p.size and fading out.
  const stepPuff = (p, f, dt) => {
    p.position.addScaledVector(p.velocity, dt);
    p.width = p.height = p.size * (0.3 + 0.7 * Math.sqrt(f));
    p.opacity = 0.8 * Math.min(p.age / 0.3, 1) * (1 - f);
  };
  // A smoke puff at a point, rising and growing to size metres, fading out.
  function puff(at, size, rise, life, delay = 0) {
    smoke.add({
      position: at.clone(),
      velocity: new THREE.Vector3((Math.random() - 0.5) * 3, rise, (Math.random() - 0.5) * 3),
      size,
      lift: 0,
      color: new THREE.Color().setScalar(0.12 + Math.random() * 0.2),
      age: -delay,
      life,
      step: stepPuff,
    });
  }
  // Part of a fireball, rising by p.rise, growing to p.size and fading out fast.
  const stepBall = (p, f, dt) => {
    p.position.y += p.rise * dt;
    p.width = p.height = p.size * (0.3 + 0.7 * Math.sqrt(f));
    p.opacity = (1 - f) ** 2;
  };
  // A flame of p.size flickering for good, sending up a smoke puff now and then.
  const stepFlame = (p) => {
    const flicker =
      0.85 + 0.15 * Math.sin(p.age * 17 + p.phase) + 0.1 * Math.sin(p.age * 29 + p.phase);
    p.width = p.size * flicker * 0.8;
    p.height = p.size * flicker * 1.3;
    p.opacity = 0.9 * Math.min(p.age / 0.5, 1);
    if (p.age > p.nextPuff) {
      p.nextPuff = p.age + 1.5 + Math.random();
      const top = new THREE.Vector3(p.position.x, p.position.y + p.size, p.position.z);
      puff(top, p.size * 2, 3 + Math.random() * 3, 5 + Math.random() * 3);
    }
  };

  // Random point inside a box.
  const inside = (box) =>
    new THREE.Vector3(
      THREE.MathUtils.lerp(box.min.x, box.max.x, Math.random()),
      THREE.MathUtils.lerp(box.min.y, box.max.y, Math.random()),
      THREE.MathUtils.lerp(box.min.z, box.max.z, Math.random()),
    );

  // The faces, cut into pieces, fly apart from the middle, spinning, and come to rest on the
  // terrain. The Novartis Pavillon's are black (src/pavilion.js), not in the model's colours.
  const pavilionBlack = new THREE.Color().setRGB(...PAVILION_BLACK);
  function debris(parts, middle, scale) {
    const pavilion =
      Math.hypot(middle.x - PAVILION_CENTRE[0], middle.z - PAVILION_CENTRE[1]) < PAVILION_RADIUS;
    const triangle = new THREE.Triangle();
    let area = 0;
    for (const { positions } of parts)
      for (let t = 0; t < positions.length; t += 9) {
        triangle.a.fromArray(positions, t);
        triangle.b.fromArray(positions, t + 3);
        triangle.c.fromArray(positions, t + 6);
        area += triangle.getArea();
      }
    const size = Math.max(PIECE, Math.sqrt(area / PIECES));
    const depth = size * THICKNESS;
    const shards = []; // { color, polygon, inward } per piece
    let corners = 0;
    for (const { color, positions, vertices } of parts)
      for (const face of faces(positions, vertices)) {
        if (face.area < SPECK) continue;
        const { normal } = face;
        const outward =
          dot(normal, corner(positions, 9 * face.triangles[0])) > dot(normal, middle.toArray());
        const inward = outward ? normal.map((x) => -x) : normal;
        for (const polygon of shatter(positions, vertices, face, size)) {
          shards.push({ color: pavilion ? pavilionBlack : color, polygon, inward });
          corners += polygon.length;
        }
      }

    // Each piece's corners twice, its front then its back (each corner between 0.4 and 1.6 times
    // depth behind), relative to its centre; n - 2 triangles in front, as many behind, two per side.
    const count = 2 * corners;
    const local = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const centres = new Float32Array(count * 4);
    const velocities = new Float32Array(count * 4);
    const axes = new Float32Array(count * 4);
    const index = new (count > 65535 ? Uint32Array : Uint16Array)(12 * (corners - shards.length));
    let [v, i] = [0, 0];
    const triangleOf = (a, b, c) => {
      index[i++] = a;
      index[i++] = b;
      index[i++] = c;
    };
    const centre = new THREE.Vector3();
    const velocity = new THREE.Vector3();
    const axis = new THREE.Vector3();
    for (const { color, polygon, inward } of shards) {
      const n = polygon.length;
      const [cx, cy, cz] = middleOf(polygon).map((x, d) => x + inward[d] * depth * 0.5);
      centre.set(cx, cy, cz);
      velocity.set(cx - middle.x, 0, cz - middle.z);
      if (velocity.lengthSq() < 0.01) velocity.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      velocity.setLength((4 + Math.random() * 12) * scale);
      velocity.y = (8 + Math.random() * 12) * scale;
      axis.randomDirection();
      const spin = (Math.random() - 0.5) * 6; // radians per second
      const [lands, restY] = landing(centre, velocity);
      // Written number by number, as three's toArray measured slow here.
      const piece = [
        cx,
        cy,
        cz,
        spin,
        velocity.x,
        velocity.y,
        velocity.z,
        lands,
        axis.x,
        axis.y,
        axis.z,
        restY,
      ];
      const [front, back] = [v, v + n];
      for (let k = 0; k < 2 * n; k++, v++) {
        const p = polygon[k % n];
        const behind = k < n ? 0 : depth * (0.4 + 1.2 * Math.random());
        const shade = k < n ? 1 : DARKER;
        local[3 * v] = p[0] + inward[0] * behind - cx;
        local[3 * v + 1] = p[1] + inward[1] * behind - cy;
        local[3 * v + 2] = p[2] + inward[2] * behind - cz;
        colors[3 * v] = color.r * shade;
        colors[3 * v + 1] = color.g * shade;
        colors[3 * v + 2] = color.b * shade;
        for (let d = 0; d < 4; d++) {
          centres[4 * v + d] = piece[d];
          velocities[4 * v + d] = piece[4 + d];
          axes[4 * v + d] = piece[8 + d];
        }
      }
      for (let k = 1; k < n - 1; k++) {
        triangleOf(front, front + k, front + k + 1);
        triangleOf(back, back + k + 1, back + k);
      }
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n;
        triangleOf(front + k, front + j, back + j);
        triangleOf(front + k, back + j, back + k);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.setAttribute("position", new THREE.BufferAttribute(local, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("debrisCentre", new THREE.BufferAttribute(centres, 4));
    geometry.setAttribute("debrisVelocity", new THREE.BufferAttribute(velocities, 4));
    geometry.setAttribute("debrisAxis", new THREE.BufferAttribute(axes, 4));
    const uniforms = {
      debrisAge: { value: 0 },
      debrisSink: { value: Math.max(4, scale * 8) },
    };
    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${DEBRIS}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n${DEBRIS_VERTEX}`);
    };
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; // it moves beyond its bounds
    scene.add(mesh);
    running.add((dt) => {
      uniforms.debrisAge.value += dt;
      if (uniforms.debrisAge.value <= GONE_AT) return true;
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      return false;
    });
  }

  // When a piece thrown from p at velocity v comes down onto the terrain (0.3 m above it), and the
  // height there: where its fall meets the height of the ground below it, which is then looked up
  // there, twice more; at the top of its flight if that is below the ground.
  function landing(p, v) {
    let [t, ground] = [0, heightAt(p.x, p.z) + 0.3];
    for (let i = 0; i < 3; i++) {
      const square = v.y * v.y + 2 * GRAVITY * (p.y - ground);
      if (square < 0) return [v.y / GRAVITY, ground];
      t = (v.y + Math.sqrt(square)) / GRAVITY;
      ground = heightAt(p.x + v.x * t, p.z + v.z * t) + 0.3;
    }
    return [t, ground];
  }

  // Black ground under what faces up (the roofs, so their aerial photo is covered), with flames
  // that send up smoke.
  function burn(parts, scale) {
    const ground = [];
    const areas = []; // running total per triangle, to place the flames
    const normal = new THREE.Vector3();
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    let area = 0;
    for (const { positions } of parts)
      for (let t = 0; t < positions.length; t += 9) {
        a.fromArray(positions, t);
        b.fromArray(positions, t + 3);
        c.fromArray(positions, t + 6);
        if (Math.abs(THREE.Triangle.getNormal(a, b, c, normal).y) < 0.3) continue; // a wall
        for (const p of [a, b, c]) ground.push(p.x, heightAt(p.x, p.z) + 0.3, p.z);
        area += Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
        areas.push(area);
      }
    if (!ground.length) return;
    addScorch(ground);

    const flames = THREE.MathUtils.clamp(Math.round(area / 60), 2, MAX_FLAMES);
    for (let n = 0; n < flames; n++) {
      // A random point on the black ground, by area.
      const r = Math.random() * area;
      const t = areas.findIndex((sum) => sum >= r);
      let [u, w] = [Math.random(), Math.random()];
      if (u + w > 1) [u, w] = [1 - u, 1 - w];
      const at = new THREE.Vector3();
      for (const [k, weight] of [
        [0, 1 - u - w],
        [1, u],
        [2, w],
      ])
        at.addScaledVector(new THREE.Vector3().fromArray(ground, 9 * t + 3 * k), weight);
      const flame = {
        position: at,
        size: (5 + Math.random() * 4) * scale,
        lift: 0.35, // stands on the ground
        color: new THREE.Color(Math.random() < 0.5 ? 0xff7a1a : 0xffb02e),
        age: -0.2,
        life: Infinity, // burns for good
        step: stepFlame,
        phase: Math.random() * 10,
        nextPuff: Math.random(),
      };
      if (fire.add(flame)) burning.push(flame);
      if (burning.length > BURNING) burning.shift().life = 0; // out at its next update
    }
  }

  // A bright ball growing and fading fast, then smoke rising from all over in puffs.
  function blast(box, scale, extent, puffs) {
    for (let n = 0; n < 6; n++)
      fire.add({
        position: inside(box),
        size: extent * (0.6 + Math.random() * 0.6),
        rise: 4 * scale,
        lift: 0,
        color: new THREE.Color(Math.random() < 0.5 ? 0xffa040 : 0xffd060),
        age: 0,
        life: 0.8 + Math.random() * 0.4,
        step: stepBall,
      });
    for (let n = 0; n < puffs; n++)
      puff(
        inside(box),
        extent * (0.5 + Math.random() * 0.5),
        (2 + Math.random() * 4) * scale,
        5 + Math.random() * 4,
        0.1 + Math.random() * 0.3,
      );
  }

  // A bang: a low thump and a dull rumble fading out, at most half as loud as the speakers allow,
  // quieter far away and by loudness (0 to 1); each a little different in pitch and length.
  function bang(distance, scale, loudness = 1) {
    const { context, noise } = audio();
    const now = context.currentTime;
    const vary = () => 0.85 + Math.random() * 0.3;
    const volume = 0.5 * loudness * THREE.MathUtils.clamp(500 / Math.max(distance, 1), 0.05, 1);
    const length = (1.3 + scale) * vary();
    const rumble = context.createBufferSource();
    rumble.buffer = noise;
    rumble.loop = true; // the rumble can be longer than the noise
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(500 * vary(), now);
    filter.frequency.exponentialRampToValueAtTime(60, now + length);
    rumble.connect(filter).connect(fade(volume, length));
    rumble.start(now, Math.random()); // from somewhere in the noise
    rumble.stop(now + length);
    const thump = context.createOscillator();
    thump.frequency.setValueAtTime(90 * vary(), now);
    thump.frequency.exponentialRampToValueAtTime(30, now + 0.6);
    thump.connect(fade(volume, 0.7));
    thump.start(now);
    thump.stop(now + 0.7);
  }

  // Hides the buildings and bridges with these numbers; returns per one not gone already (nor -1)
  // its number, parts (from structures.triangles), bounding box, middle, extent (metres across)
  // and scale.
  function remove(numbers) {
    const found = structures.triangles(numbers);
    structures.hide(found.keys());
    return [...found].map(([number, parts]) => {
      const box = new THREE.Box3();
      for (const { positions } of parts)
        for (let i = 0; i < positions.length; i += 3)
          box.expandByPoint(new THREE.Vector3().fromArray(positions, i));
      const size = box.getSize(new THREE.Vector3());
      const extent = Math.max(size.x, size.z, 10);
      const scale = THREE.MathUtils.clamp(extent / 30, 0.8, 2);
      return { number, parts, box, middle: box.getCenter(new THREE.Vector3()), extent, scale };
    });
  }

  return {
    // Blows up the building or bridge with this number, unless it is gone already (or -1);
    // whether it did.
    explode(number) {
      const [gone] = remove([number]);
      if (!gone) return false;
      const { parts, box, middle, extent, scale } = gone;
      debris(parts, middle, scale);
      blast(box, scale, extent, THREE.MathUtils.clamp(Math.round(extent / 2), 12, 40));
      if (!structures.isBridge(number)) burn(parts, scale);
      bang(camera.position.distanceTo(middle), scale);
      return true;
    },
    // A small blast at a scene point, where a rocket hits the ground.
    burst(point) {
      blast(new THREE.Box3().setFromCenterAndSize(point, new THREE.Vector3(4, 4, 4)), 0.8, 12, 3);
      bang(camera.position.distanceTo(point), 0, 0.25);
    },
    // Leaves the ones with these numbers as explode does in the end, at once: gone, a building's
    // ground burning; returns the numbers of those it removed.
    ruin(numbers) {
      const gone = remove(numbers);
      for (const { number, parts, scale } of gone)
        if (!structures.isBridge(number)) burn(parts, scale);
      return gone.map(({ number }) => number);
    },
    update(dt) {
      for (const step of running) if (!step(dt)) running.delete(step);
      fire.update(dt);
      smoke.update(dt);
    },
  };
}

// The faces that triangles form (positions: nine numbers each; vertices: each corner's vertex
// number in its mesh): neighbours across an edge in about the same plane as the face's first, so
// bent ones fall into nearly flat strips. Each as { triangles (indices), normal (unit [x, y, z] of
// its largest triangle), area }; none without area.
function faces(positions, vertices) {
  const count = positions.length / 9;
  const normals = new Float64Array(count * 3); // unit
  const areas = new Float64Array(count);
  for (let t = 0; t < count; t++) {
    const o = 9 * t;
    const [ux, uy, uz] = [0, 1, 2].map((d) => positions[o + 3 + d] - positions[o + d]);
    const [vx, vy, vz] = [0, 1, 2].map((d) => positions[o + 6 + d] - positions[o + d]);
    const [nx, ny, nz] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const length = Math.hypot(nx, ny, nz) || 1;
    normals[3 * t] = nx / length;
    normals[3 * t + 1] = ny / length;
    normals[3 * t + 2] = nz / length;
    areas[t] = length / 2;
  }
  const parallel = (s, t) =>
    Math.abs(
      normals[3 * s] * normals[3 * t] +
        normals[3 * s + 1] * normals[3 * t + 1] +
        normals[3 * s + 2] * normals[3 * t + 2],
    ) > 0.97;
  const parent = Int32Array.from({ length: count }, (_, t) => t);
  const root = (t) => {
    while (parent[t] !== t) t = parent[t] = parent[parent[t]];
    return t;
  };
  // The vertex numbers renumbered from 0, so the edges' keys stay small integers, fast in a Map.
  const numbers = new Map();
  const number = (i) => numbers.get(vertices[i]) ?? numbers.set(vertices[i], numbers.size).size - 1;
  const own = Int32Array.from(vertices, (_, i) => number(i));
  const edges = new Map(); // edge (from its two vertex numbers) → first triangle with it
  for (let t = 0; t < count; t++)
    for (let k = 0; k < 3; k++) {
      const [p, q] = [own[3 * t + k], own[3 * t + ((k + 1) % 3)]];
      const edge = p < q ? p * numbers.size + q : q * numbers.size + p;
      const other = edges.get(edge);
      if (other === undefined) edges.set(edge, t);
      else if (parallel(root(t), root(other))) parent[root(t)] = root(other);
    }
  const groups = []; // by root: { triangles, normal, area, largest }
  for (let t = 0; t < count; t++) {
    const group = (groups[root(t)] ??= { triangles: [], normal: null, area: 0, largest: 0 });
    group.triangles.push(t);
    group.area += areas[t];
    if (areas[t] <= group.largest) continue;
    group.largest = areas[t];
    group.normal = [normals[3 * t], normals[3 * t + 1], normals[3 * t + 2]];
  }
  return groups.filter((group) => group?.normal);
}

// The pieces of a face (as faces gives it): the convex hull of its corners in its plane, split
// again and again across the longest side at random angles, into pieces about size metres wide,
// some staying bigger; where the face is not convex, without those whose middle lies outside it.
// Per piece its corners ([x, y, z]).
function shatter(positions, vertices, { triangles, normal, area }, size) {
  const u = perpendicular(normal);
  const v = cross(normal, u);
  const seen = new Set(); // vertex numbers, so each corner counts once
  const corners = [];
  for (const t of triangles)
    for (let k = 0; k < 3; k++)
      if (!seen.has(vertices[3 * t + k])) {
        seen.add(vertices[3 * t + k]);
        corners.push(corner(positions, 9 * t + 3 * k));
      }
  const level = corners.reduce((sum, p) => sum + dot(p, normal), 0) / corners.length;
  const flat = (p) => {
    const off = dot(p, normal) - level;
    return p.map((x, d) => x - normal[d] * off);
  };
  const flat2 = (p) => [dot(p, u), dot(p, v)];
  const outline = hull(corners.map(flat2)).map((i) => flat(corners[i]));
  const convex = polygonArea(outline.map(flat2)) < area * 1.02;
  // For a point, whether one of the face's triangles holds it, seen along the normal; looked up
  // in a grid of cells size metres wide, each listing the triangles whose bounds reach into it.
  const cellKey = (x, y) => (x + 1e5) * 1e6 + y; // of a cell, by its column and row
  const cells = new Map();
  if (!convex)
    for (const t of triangles) {
      const flatTriangle = [0, 3, 6].map((k) => flat2(corner(positions, 9 * t + k)));
      const [xs, ys] = [0, 1].map((d) => flatTriangle.map((p) => Math.floor(p[d] / size)));
      for (let x = Math.min(...xs); x <= Math.max(...xs); x++)
        for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
          const key = cellKey(x, y);
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(flatTriangle);
        }
    }
  const inFace = (p) => {
    const q = flat2(p);
    return (cells.get(cellKey(Math.floor(q[0] / size), Math.floor(q[1] / size))) ?? []).some(
      ([a, b, c]) => {
        const [s, t, w] = [area2(a, b, q), area2(b, c, q), area2(c, a, q)];
        return (s >= 0 && t >= 0 && w >= 0) || (s <= 0 && t <= 0 && w <= 0);
      },
    );
  };

  const pieces = [];
  const stack = [outline];
  while (stack.length) {
    const polygon = stack.pop();
    if (polygon.length < 3) continue;
    const [a, b] = farthest(polygon);
    const span = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (span < size * 1.5 || (span < size * 6 && Math.random() < KEEP)) {
      if (convex || inFace(middleOf(polygon))) pieces.push(polygon);
      continue;
    }
    // Across a-b, turned by up to about 40° within the face's plane.
    const turn = Math.random() * 2 * Math.PI;
    const across = [0, 1, 2].map(
      (d) => (b[d] - a[d]) / span + 0.8 * (u[d] * Math.cos(turn) + v[d] * Math.sin(turn)),
    );
    const f = 0.3 + 0.4 * Math.random(); // where between a and b
    const limit = dot(
      a.map((x, d) => x + (b[d] - x) * f),
      across,
    );
    stack.push(clip(polygon, across, limit, 1), clip(polygon, across, limit, -1));
  }
  return pieces;
}

const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const corner = (positions, i) => positions.slice(i, i + 3); // [x, y, z] from nine-number triangles
const cross = (p, q) => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
];
const area2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); // twice, signed
const polygonArea = (points) =>
  Math.abs(
    points.reduce((sum, p, i) => sum + area2(points[0], p, points[(i + 1) % points.length]), 0),
  ) / 2;
function middleOf(polygon) {
  const sum = [0, 0, 0];
  for (const p of polygon) for (let d = 0; d < 3; d++) sum[d] += p[d];
  return sum.map((x) => x / polygon.length);
}

// A unit vector at right angles to a unit vector n.
function perpendicular(n) {
  const p = Math.abs(n[1]) < 0.9 ? [n[2], 0, -n[0]] : [1, 0, 0]; // along a wall, else any
  const along = cross(cross(n, p), n);
  const length = Math.hypot(...along);
  return along.map((x) => x / length);
}

// The indices of the convex hull of 2D points, in order (monotone chain).
function hull(points) {
  const order = points
    .map((_, i) => i)
    .sort((i, j) => points[i][0] - points[j][0] || points[i][1] - points[j][1]);
  const chain = (indices) => {
    const out = [];
    for (const i of indices) {
      while (out.length > 1 && area2(points[out.at(-2)], points[out.at(-1)], points[i]) <= 0)
        out.pop();
      out.push(i);
    }
    return out.slice(0, -1);
  };
  return [...chain(order), ...chain(order.reverse())];
}

// The two corners of a polygon farthest apart.
function farthest(polygon) {
  let [best, pair] = [-1, null];
  for (let i = 0; i < polygon.length; i++)
    for (let j = i + 1; j < polygon.length; j++) {
      const [p, q] = [polygon[i], polygon[j]];
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
      if (d > best) [best, pair] = [d, [p, q]];
    }
  return pair;
}

// The part of a convex polygon ([x, y, z] corners) where dot(p, axis) is at least limit (sign 1)
// or at most limit (sign -1).
function clip(polygon, axis, limit, sign) {
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const [a, b] = [polygon[i], polygon[(i + 1) % polygon.length]];
    const da = sign * (dot(a, axis) - limit);
    const db = sign * (dot(b, axis) - limit);
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const f = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
    }
  }
  return out;
}

// Soft round particles (fire or smoke) facing the camera, all of a kind drawn at once. Each is
// { position, lift (how far its middle is above position, in heights), color, age (negative while
// it waits), life, step(p, f, dt) } with f = age / life; step sets its width, height and opacity
// and may move it. Smoke is drawn back to front, so the nearer covers the farther.
function createParticles(scene, camera, additive, capacity) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
  );
  const attribute = (name, size) => {
    const values = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
    geometry.setAttribute(name, values.setUsage(THREE.DynamicDrawUsage));
    return values;
  };
  const centre = attribute("centre", 3);
  const shape = attribute("shape", 3); // width, height, lift
  const tint = attribute("tint", 4); // colour, opacity
  geometry.instanceCount = 0;
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute vec3 centre;
      attribute vec3 shape;
      attribute vec4 tint;
      varying vec2 vCorner;
      varying vec4 vTint;
      void main() {
        vCorner = position.xy;
        vTint = tint;
        vec4 mvPosition = modelViewMatrix * vec4(centre, 1.0);
        mvPosition.xy += vec2(position.x, position.y + shape.z) * shape.xy;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      varying vec2 vCorner;
      varying vec4 vTint;
      void main() {
        float fade = clamp(1.0 - 2.0 * length(vCorner), 0.0, 1.0); // 1 in the middle, 0 at the edge
        gl_FragColor = vec4(vTint.rgb, vTint.a * fade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, // fire adds, smoke covers
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // they are all over the city
  scene.add(mesh);
  const list = [];
  return {
    // Whether there was room for it.
    add(p) {
      if (list.length >= capacity) return false;
      list.push(p);
      return true;
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt;
        if (p.age >= p.life) {
          list[i] = list[list.length - 1]; // already updated, as from the end
          list.pop();
        } else if (p.age >= 0) p.step(p, p.age / p.life, dt);
      }
      if (!additive) {
        for (const p of list) p.depth = p.position.distanceToSquared(camera.position);
        // Insertion sort: from frame to frame the order hardly changes, so this is about linear.
        for (let i = 1; i < list.length; i++) {
          const p = list[i];
          let j = i - 1;
          for (; j >= 0 && list[j].depth < p.depth; j--) list[j + 1] = list[j];
          list[j + 1] = p;
        }
      }
      let n = 0;
      const [c, s, t] = [centre.array, shape.array, tint.array];
      for (const p of list) {
        if (p.age < 0) continue;
        c[3 * n] = p.position.x;
        c[3 * n + 1] = p.position.y;
        c[3 * n + 2] = p.position.z;
        s[3 * n] = p.width;
        s[3 * n + 1] = p.height;
        s[3 * n + 2] = p.lift;
        t[4 * n] = p.color.r;
        t[4 * n + 1] = p.color.g;
        t[4 * n + 2] = p.color.b;
        t[4 * n + 3] = p.opacity;
        n++;
      }
      if (n === 0 && geometry.instanceCount === 0) return; // nothing drawn, nothing to send
      geometry.instanceCount = n;
      for (const values of [centre, shape, tint]) {
        values.clearUpdateRanges();
        values.addUpdateRange(0, n * values.itemSize);
        values.needsUpdate = true;
      }
    },
  };
}
