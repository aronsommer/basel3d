// Rockets flying straight with a whoosh and a smoke trail to where they were aimed (aim), there
// hitting what was aimed at (onHit(met, where)); with nothing aimed at, they end PAST it (a shell:
// ACROSS). Those of a plane first drop from it for DROP seconds, going along with it, then light
// and fly towards where they were aimed. The basilisk's fire shots fly so too.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { audio, fade, play } from "./sound.js";

// Metres per second each kind starts at, the metres per second² it speeds up by and the speed it
// reaches: a rocket; a shell, fast from the gun; a plane's, from the speed it drops at; a fireball.
const ROCKET = [350, 400, 700];
const FIREBALL = [1000, 0, 1000];
const BURST = 40; // metres to a fire shot's full size
const STREAK = 90; // metres of flame behind it at most
const COOL = 500; // metres from yellow to orange
const SHELL_FLIGHT = [1000, 0, 1000];
const DROPPED = [0, 2000, 1000];
const ACROSS = 12000; // metres a shell flies at most: further than across the terrain's area
const PAST = 20; // metres a rocket flies on past where it was aimed at nothing
const DROP = 0.25; // seconds
const FALL = 12; // metres per second while dropping
// Metres between the points tested along the line of fire, and how fast they grow with the
// distance: further apart far away, where it need not be as fine.
const AIM_STEP = 10;
const AIM_GROWTH = 1 / 50;
const MAX = 256; // rockets in flight at most
const SHELL = 0.35; // a shell's size, of a rocket's

// structures: from buildings.js; heightAt(x, z): the terrain height; camera: where the whoosh is
// heard; fireSound: a promise of the fire shot's sound file (its bytes).
export function createRockets(scene, structures, heightAt, camera, onHit, fireSound) {
  // A dark body with a glowing tail, and a fading smoke trail behind, the nose along +z; metres.
  // All rockets are instances of these two, in two draw calls.
  const colored = (geometry, color) => {
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) new THREE.Color(color).toArray(colors, i);
    return geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  };
  const bodies = new THREE.InstancedMesh(
    mergeGeometries([
      colored(new THREE.CylinderGeometry(0.6, 0.6, 8, 6).rotateX(Math.PI / 2), 0x2a3038),
      colored(
        new THREE.ConeGeometry(0.9, 4.5, 6).rotateX(-Math.PI / 2).translate(0, 0, -6.25),
        0xffb040,
      ),
    ]),
    new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), // the flame glows
    MAX,
  );
  const trails = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1.2, 40, 6).rotateX(-Math.PI / 2).translate(0, 0, -24),
    new THREE.MeshBasicMaterial({
      color: 0xdddddd,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
    MAX,
  );
  // Fire shots: a core and a flame behind it, additive, coloured per instance.
  const flame = () =>
    new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
  const balls = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1.6).scale(1, 1, 4),
    flame(),
    MAX,
  );
  const tails = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.5),
    flame(),
    MAX,
  );
  const [HOT, BURNING] = [0xfff0a0, 0xff7a18].map((c) => new THREE.Color(c));
  const glow = new THREE.Color();
  // Colours set from the start, so the first shot does not compile new shaders.
  for (const mesh of [balls, tails]) mesh.setColorAt(0, HOT);
  const spin = new THREE.Quaternion();
  const meshes = [bodies, trails, balls, tails];
  for (const mesh of meshes) {
    mesh.count = 0;
    mesh.frustumCulled = false; // they fly all over
    scene.add(mesh);
  }
  // { position, direction (unit), speed, thrust, top, turn (from +z), size, travelled, range, to
  // (where it is aimed at), met (what is aimed at there), ball (a fireball) }; a plane's also
  // { wait (seconds it still drops), carried (the plane's velocity) }.
  const flying = new Set();
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const none = new THREE.Matrix4().makeScale(0, 0, 0); // no trail while dropping
  const FORWARD = new THREE.Vector3(0, 0, 1);

  // A whoosh: noise through a low-pass sweeping down, dull rather than hissing, quieter far away;
  // a plane's rocket lighting (long): longer, first sweeping up, as it rushes off.
  function whoosh(distance, long = false) {
    const { context, noise } = audio();
    const now = context.currentTime;
    const length = long ? 1.4 : 0.6;
    const sound = context.createBufferSource();
    sound.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(long ? 300 : 700, now);
    if (long) filter.frequency.exponentialRampToValueAtTime(2500, now + 0.25);
    filter.frequency.exponentialRampToValueAtTime(150, now + length);
    const volume = 0.15 * THREE.MathUtils.clamp(200 / Math.max(distance, 1), 0.05, 1);
    sound.connect(filter).connect(fade(volume, length));
    sound.start(now, Math.random() * 2); // from somewhere in the noise, so each is a bit different
    sound.stop(now + length);
  }

  // A fire shot's sound, quieter far away, at most VOICES at once.
  const VOICES = 3;
  let decoded = null;
  let ends = []; // when those playing end (seconds)
  function roar(distance) {
    const { context } = audio();
    decoded ??= fireSound.then((bytes) => context.decodeAudioData(bytes.slice(0)));
    const volume = 0.15 * THREE.MathUtils.clamp(200 / Math.max(distance, 1), 0.05, 1);
    decoded.then((buffer) => {
      ends = ends.filter((end) => end > context.currentTime);
      if (ends.length >= VOICES) return;
      ends.push(context.currentTime + buffer.duration);
      play(buffer, volume);
    });
  }

  return {
    // The first point on the line from origin along direction (unit) that meets a building or
    // bridge, or the ground to within AIM_STEP / 64 by halving the step there, so it does not
    // jump; else the point range metres along it. With what it met: the number of the building
    // or bridge, "ground" or null.
    aim(origin, direction, range) {
      const from = origin.clone();
      const to = origin.clone();
      const half = new THREE.Vector3();
      const under = (at) => at.y < heightAt(at.x, at.z);
      for (let d = 0; d < range;) {
        const step = Math.max(AIM_STEP, d * AIM_GROWTH);
        d = Math.min(d + step, range);
        to.copy(origin).addScaledVector(direction, d);
        const number = structures.hit(from, to);
        if (number >= 0) to.lerpVectors(from, to, structures.along);
        if (!under(to)) {
          if (number >= 0) return [to, number];
          from.copy(to);
          continue;
        }
        for (let part = step; part > AIM_STEP / 64; part /= 2) {
          half.lerpVectors(from, to, 0.5);
          if (under(half)) to.copy(half);
          else from.copy(half);
        }
        return [to, "ground"];
      }
      return [to, null];
    },
    // A rocket from a scene point towards another, unless MAX are flying; or a shell, smaller and
    // silent (its bang is the gun's); or a plane's, dropped at the plane's velocity (carried); or
    // a fireball (ball). It hits what was aimed at there (met, from aim) when it gets there,
    // whatever is on its way; with nothing aimed at, it flies on past.
    fire(from, to, { met = null, shell = false, carried = null, ball = false } = {}) {
      if (flying.size >= MAX) return;
      const direction = to.clone().sub(from).normalize();
      const [speed, thrust, top] = shell
        ? SHELL_FLIGHT
        : carried
          ? DROPPED
          : ball
            ? FIREBALL
            : ROCKET;
      flying.add({
        position: from.clone(),
        direction,
        speed,
        thrust,
        top,
        turn: new THREE.Quaternion().setFromUnitVectors(FORWARD, direction),
        size: shell ? SHELL : 1,
        travelled: 0,
        range: met !== null ? from.distanceTo(to) : shell ? ACROSS : from.distanceTo(to) + PAST,
        to: to.clone(),
        met,
        wait: carried ? DROP : 0,
        carried: carried?.clone(),
        ball,
      });
      if (ball) roar(camera.position.distanceTo(from));
      else if (!shell && !carried) whoosh(camera.position.distanceTo(from));
    },
    update(dt) {
      let [n, b] = [0, 0]; // rockets and fireballs drawn
      for (const rocket of flying) {
        const { position, carried } = rocket;
        const dropping = rocket.wait > 0;
        if (dropping) {
          rocket.wait -= dt;
          position.addScaledVector(carried, dt).y -= FALL * dt;
          // Lit: on to where it was aimed, from where it dropped to, at the speed it has.
          if (rocket.wait <= 0) {
            rocket.direction.copy(rocket.to).sub(position).normalize();
            rocket.turn.setFromUnitVectors(FORWARD, rocket.direction);
            rocket.speed = carried.length();
            rocket.range = position.distanceTo(rocket.to) + (rocket.met !== null ? 0 : PAST);
            whoosh(camera.position.distanceTo(position), true);
          }
        } else {
          rocket.speed = Math.min(rocket.speed + rocket.thrust * dt, rocket.top);
          position.addScaledVector(rocket.direction, rocket.speed * dt);
          rocket.travelled += rocket.speed * dt;
        }
        if (rocket.travelled < rocket.range) {
          if (rocket.ball) {
            // Growing out of the mouth and cooling as it goes, flickering.
            const age = Math.min(1, rocket.travelled / COOL);
            const out = Math.min(1, 0.15 + rocket.travelled / BURST);
            const size = out * (1 + 0.5 * age) * (0.8 + 0.4 * Math.random());
            spin.setFromAxisAngle(FORWARD, Math.random() * 7).premultiply(rocket.turn);
            balls.setMatrixAt(b, matrix.compose(position, spin, scale.setScalar(size)));
            const back = Math.min(rocket.travelled, STREAK * (0.8 + 0.4 * Math.random()));
            tails.setMatrixAt(
              b,
              matrix.compose(position, rocket.turn, scale.set(2 * size, 2 * size, back)),
            );
            balls.setColorAt(b, glow.lerpColors(HOT, BURNING, age));
            tails.setColorAt(b++, glow.copy(BURNING).multiplyScalar(0.7));
            continue;
          }
          matrix.compose(position, rocket.turn, scale.setScalar(rocket.size));
          bodies.setMatrixAt(n, matrix);
          trails.setMatrixAt(n++, dropping ? none : matrix);
          continue;
        }
        if (rocket.met !== null) onHit(rocket.met, rocket.to);
        flying.delete(rocket);
      }
      meshes.forEach((mesh, k) => {
        const count = k < 2 ? n : b; // the rockets', then the fireballs'
        mesh.count = count;
        if (!count) return; // nothing drawn, nothing to send
        for (const [attribute, size] of [
          [mesh.instanceMatrix, 16],
          [mesh.instanceColor, 3],
        ]) {
          if (!attribute) continue; // the rockets' have no colours
          attribute.clearUpdateRanges();
          attribute.addUpdateRange(0, size * count);
          attribute.needsUpdate = true;
        }
      });
    },
  };
}
