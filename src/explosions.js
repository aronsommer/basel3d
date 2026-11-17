// Explosions of buildings and bridges, by number (see buildings.js): the original vanishes and its
// faces (walls, roof planes) fly apart, fall and sink into the ground, with a fireball, smoke and
// a bang. A building leaves scorched ground, where flames keep burning.
import * as THREE from "three";
import { audio, fade } from "./sound.js";

const GRAVITY = 30; // m/s², three times real, so the pieces are down within about a second
const SINK_AT = 2.5; // seconds after the bang, when the pieces start sinking into the ground
const GONE_AT = 5; // seconds after the bang, when the pieces are gone
const MAX_FLAMES = 10;

// heightAt(x, z): the terrain height; camera: where the bang is heard.
export function createExplosions(scene, structures, heightAt, camera) {
  const dot = softDot();
  const debrisMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const scorchMaterial = new THREE.MeshBasicMaterial({
    color: 0x15120f,
    side: THREE.DoubleSide,
    polygonOffset: true, // over the terrain
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const running = new Set(); // per frame: step(dt), false when done

  // A sprite of the soft dot that runs update(f, age, dt) per frame for life seconds after delay
  // (f: age / life), then is removed.
  function particle(color, additive, life, update, delay = 0) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: dot,
        color,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    sprite.visible = false;
    scene.add(sprite);
    let age = -delay;
    running.add((dt) => {
      age += dt;
      if (age < 0) return true;
      if (age > life) {
        scene.remove(sprite);
        sprite.material.dispose();
        return false;
      }
      sprite.visible = true;
      update(sprite, age / life, age, dt);
      return true;
    });
    return sprite;
  }

  // A smoke puff at a point, rising and growing to size metres, fading out.
  function puff(at, size, rise, life, delay = 0) {
    const velocity = new THREE.Vector3((Math.random() - 0.5) * 3, rise, (Math.random() - 0.5) * 3);
    const grey = new THREE.Color().setScalar(0.12 + Math.random() * 0.2);
    particle(
      grey,
      false,
      life,
      (sprite, f, age, dt) => {
        sprite.position.addScaledVector(velocity, dt);
        sprite.scale.setScalar(size * (0.3 + 0.7 * Math.sqrt(f)));
        sprite.material.opacity = 0.8 * Math.min(age / 0.3, 1) * (1 - f);
      },
      delay,
    ).position.copy(at);
  }

  // Random point inside a box.
  const inside = (box) =>
    new THREE.Vector3(
      THREE.MathUtils.lerp(box.min.x, box.max.x, Math.random()),
      THREE.MathUtils.lerp(box.min.y, box.max.y, Math.random()),
      THREE.MathUtils.lerp(box.min.z, box.max.z, Math.random()),
    );

  // The faces fly apart from the middle, spinning, and come to rest on the terrain.
  function debris(parts, middle, scale) {
    const pieces = [];
    let vertices = 0;
    for (const { material, positions } of parts)
      for (const face of faces(positions)) {
        const centre = new THREE.Vector3();
        for (const t of face)
          for (let k = 0; k < 9; k += 3)
            centre.add(new THREE.Vector3().fromArray(positions, 9 * t + k));
        centre.divideScalar(face.length * 3);
        const out = new THREE.Vector3(centre.x - middle.x, 0, centre.z - middle.z);
        if (out.lengthSq() < 0.01) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        out.setLength((4 + Math.random() * 12) * scale);
        out.y = (8 + Math.random() * 12) * scale;
        pieces.push({
          positions,
          face,
          color: material.color,
          start: vertices,
          centre,
          velocity: out,
          axis: new THREE.Vector3().randomDirection(),
          spin: (Math.random() - 0.5) * 6, // radians per second
          angle: 0,
          resting: false,
        });
        vertices += face.length * 3;
      }
    // Each vertex relative to its piece's centre, which moves.
    const local = new Float32Array(vertices * 3);
    const colors = new Float32Array(vertices * 3);
    for (const { positions, face, color, start, centre } of pieces)
      face.forEach((t, i) => {
        for (let k = 0; k < 3; k++) {
          const v = 3 * (start + 3 * i + k);
          for (let d = 0; d < 3; d++)
            local[v + d] = positions[9 * t + 3 * k + d] - centre.getComponent(d);
          color.toArray(colors, v);
        }
      });
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3);
    geometry.setAttribute("position", position);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, debrisMaterial);
    mesh.frustumCulled = false; // it moves beyond its bounds
    scene.add(mesh);

    const turn = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sink = Math.max(4, scale * 8); // metres per second
    let age = 0;
    running.add((dt) => {
      age += dt;
      if (age > GONE_AT) {
        scene.remove(mesh);
        geometry.dispose();
        return false;
      }
      for (const piece of pieces) {
        const { centre: p, velocity } = piece;
        if (!piece.resting) {
          velocity.y -= GRAVITY * dt;
          p.addScaledVector(velocity, dt);
          piece.angle += piece.spin * dt;
          const ground = heightAt(p.x, p.z) + 0.3;
          if (p.y < ground && velocity.y < 0) {
            p.y = ground;
            piece.resting = true;
          }
        }
        if (age > SINK_AT) p.y -= sink * dt;
        turn.setFromAxisAngle(piece.axis, piece.angle);
        for (let i = piece.start; i < piece.start + piece.face.length * 3; i++)
          v.fromArray(local, 3 * i)
            .applyQuaternion(turn)
            .add(p)
            .toArray(position.array, 3 * i);
      }
      position.needsUpdate = true;
      return true;
    });
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
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(ground, 3));
    scene.add(new THREE.Mesh(geometry, scorchMaterial));

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
      const size = (5 + Math.random() * 4) * scale;
      const phase = Math.random() * 10;
      let nextPuff = Math.random();
      const flame = particle(
        Math.random() < 0.5 ? 0xff7a1a : 0xffb02e,
        true,
        Infinity, // burns for good
        (sprite, f, age) => {
          const flicker =
            0.85 + 0.15 * Math.sin(age * 17 + phase) + 0.1 * Math.sin(age * 29 + phase);
          sprite.scale.set(size * flicker * 0.8, size * flicker * 1.3, 1);
          sprite.material.opacity = 0.9 * Math.min(age / 0.5, 1);
          if (age > nextPuff) {
            nextPuff = age + 1.5 + Math.random();
            puff(
              at.clone().setY(at.y + size),
              size * 2,
              3 + Math.random() * 3,
              5 + Math.random() * 3,
            );
          }
        },
        0.2,
      );
      flame.center.set(0.5, 0.15); // stands on the ground
      flame.position.copy(at);
    }
  }

  // A bright ball growing and fading fast, then smoke rising from all over in puffs.
  function blast(box, scale, extent, puffs) {
    for (let n = 0; n < 6; n++) {
      const size = extent * (0.6 + Math.random() * 0.6);
      const rise = new THREE.Vector3(0, 4 * scale, 0);
      particle(
        Math.random() < 0.5 ? 0xffa040 : 0xffd060,
        true,
        0.8 + Math.random() * 0.4,
        (sprite, f, age, dt) => {
          sprite.position.addScaledVector(rise, dt);
          sprite.scale.setScalar(size * (0.3 + 0.7 * Math.sqrt(f)));
          sprite.material.opacity = (1 - f) ** 2;
        },
      ).position.copy(inside(box));
    }
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

  // Hides the building or bridge with this number; returns its parts (from structures.triangles),
  // bounding box, middle, extent (metres across) and scale, or null if it is gone already (or -1).
  function remove(number) {
    const parts = structures.triangles(number);
    if (!parts.length) return null;
    structures.hide(number);
    const box = new THREE.Box3();
    for (const { positions } of parts)
      for (let i = 0; i < positions.length; i += 3)
        box.expandByPoint(new THREE.Vector3().fromArray(positions, i));
    const size = box.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.z, 10);
    const scale = THREE.MathUtils.clamp(extent / 30, 0.8, 2);
    return { parts, box, middle: box.getCenter(new THREE.Vector3()), extent, scale };
  }

  return {
    // Blows up the building or bridge with this number, unless it is gone already (or -1).
    explode(number) {
      const gone = remove(number);
      if (!gone) return;
      const { parts, box, middle, extent, scale } = gone;
      debris(parts, middle, scale);
      blast(box, scale, extent, THREE.MathUtils.clamp(Math.round(extent / 2), 12, 40));
      if (!structures.isBridge(number)) burn(parts, scale);
      bang(camera.position.distanceTo(middle), scale);
    },
    // A small blast at a scene point, where a rocket hits the ground.
    burst(point) {
      blast(new THREE.Box3().setFromCenterAndSize(point, new THREE.Vector3(4, 4, 4)), 0.8, 12, 3);
      bang(camera.position.distanceTo(point), 0, 0.25);
    },
    // Leaves it as explode does in the end, at once: gone, a building's ground burning.
    ruin(number) {
      const gone = remove(number);
      if (gone && !structures.isBridge(number)) burn(gone.parts, gone.scale);
    },
    update(dt) {
      for (const step of running) if (!step(dt)) running.delete(step);
    },
  };
}

// The faces that triangles (nine numbers each) form: neighbours across an edge in about the same
// plane, each a list of triangle indices.
function faces(positions) {
  const count = positions.length / 9;
  const normals = [];
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let t = 0; t < count; t++) {
    a.fromArray(positions, 9 * t);
    b.fromArray(positions, 9 * t + 3);
    c.fromArray(positions, 9 * t + 6);
    normals.push(THREE.Triangle.getNormal(a, b, c, new THREE.Vector3()));
  }
  const parent = Int32Array.from({ length: count }, (_, t) => t);
  const root = (t) => {
    while (parent[t] !== t) t = parent[t] = parent[parent[t]];
    return t;
  };
  // A vertex as text, to the centimetre, so neighbours find their shared edges.
  const key = (t, k) => [0, 1, 2].map((d) => Math.round(positions[9 * t + 3 * k + d] * 100)).join();
  const edges = new Map(); // edge → first triangle with it
  for (let t = 0; t < count; t++) {
    const keys = [key(t, 0), key(t, 1), key(t, 2)];
    for (let k = 0; k < 3; k++) {
      const edge = [keys[k], keys[(k + 1) % 3]].sort().join("|");
      const other = edges.get(edge);
      if (other === undefined) edges.set(edge, t);
      else if (Math.abs(normals[t].dot(normals[other])) > 0.97) parent[root(t)] = root(other);
    }
  }
  const groups = new Map();
  for (let t = 0; t < count; t++) {
    const r = root(t);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(t);
  }
  return [...groups.values()];
}

// A white dot, opaque in the middle and fading out to the edge, for fire and smoke.
function softDot() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.5)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
