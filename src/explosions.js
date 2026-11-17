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
  const debrisMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const running = new Set(); // per frame: step(dt), false when done
  const fire = createParticles(scene, camera, true, 2000);
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
      fire.add({
        position: at,
        size: (5 + Math.random() * 4) * scale,
        lift: 0.35, // stands on the ground
        color: new THREE.Color(Math.random() < 0.5 ? 0xff7a1a : 0xffb02e),
        age: -0.2,
        life: Infinity, // burns for good
        step: stepFlame,
        phase: Math.random() * 10,
        nextPuff: Math.random(),
      });
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
    // Blows up the building or bridge with this number, unless it is gone already (or -1).
    explode(number) {
      const [gone] = remove([number]);
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
    // Leaves the ones with these numbers as explode does in the end, at once: gone, a building's
    // ground burning.
    ruin(numbers) {
      for (const { number, parts, scale } of remove(numbers))
        if (!structures.isBridge(number)) burn(parts, scale);
    },
    update(dt) {
      for (const step of running) if (!step(dt)) running.delete(step);
      fire.update(dt);
      smoke.update(dt);
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
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // they are all over the city
  scene.add(mesh);
  const list = [];
  return {
    add(p) {
      if (list.length < capacity) list.push(p);
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
        list.sort((a, b) => b.depth - a.depth);
      }
      let n = 0;
      for (const p of list) {
        if (p.age < 0) continue;
        p.position.toArray(centre.array, 3 * n);
        shape.array.set([p.width, p.height, p.lift], 3 * n);
        p.color.toArray(tint.array, 4 * n);
        tint.array[4 * n + 3] = p.opacity;
        n++;
      }
      geometry.instanceCount = n;
      for (const values of [centre, shape, tint]) {
        values.clearUpdateRanges();
        values.addUpdateRange(0, n * values.itemSize);
        values.needsUpdate = true;
      }
    },
  };
}
