// Rockets flying straight with a whoosh and a smoke trail, until they hit a building or bridge
// (structures.hit, then onHit(number)), the ground (a small blast) or are PAST where they were
// aimed (a shell: ACROSS). Those of a plane first drop from it for DROP seconds, going along with
// it, then light and fly towards where they were aimed.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { audio, fade } from "./sound.js";

// Metres per second each kind starts at, the metres per second² it speeds up by and the speed it
// reaches: a rocket; a shell, fast from the gun; a plane's, from the speed it drops at.
const ROCKET = [350, 400, 700];
const SHELL_FLIGHT = [1000, 0, 1000];
const DROPPED = [0, 2000, 1000];
const ACROSS = 12000; // metres a shell flies at most: further than across the terrain's area
const PAST = 20; // metres a rocket flies on past where it was aimed, into what is there
const DROP = 0.25; // seconds
const FALL = 12; // metres per second while dropping
// Metres between the points tested along the line of fire, and how fast they grow with the
// distance: further apart far away, where it need not be as fine.
const AIM_STEP = 10;
const AIM_GROWTH = 1 / 50;
const MAX = 256; // rockets in flight at most
const SHELL = 0.35; // a shell's size, of a rocket's

// structures: from buildings.js; explosions: from explosions.js; heightAt(x, z): the terrain
// height; camera: where the whoosh is heard.
export function createRockets(scene, structures, explosions, heightAt, camera, onHit) {
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
  for (const mesh of [bodies, trails]) {
    mesh.count = 0;
    mesh.frustumCulled = false; // they fly all over
    scene.add(mesh);
  }
  // { position, direction (unit), speed, thrust, top, turn (from +z), size, travelled, range, to
  // (where it is aimed at) }; a plane's also { wait (seconds it still drops), carried (the
  // plane's velocity) }.
  const flying = new Set();
  const before = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const none = new THREE.Matrix4().makeScale(0, 0, 0); // no trail while dropping
  const FORWARD = new THREE.Vector3(0, 0, 1);

  // Whether the segment from → to meets the ground or a building or bridge: "ground", the
  // number of the building or bridge, or null.
  const meets = (from, to) => {
    const number = structures.hit(from, to);
    if (number >= 0) return number;
    return to.y < heightAt(to.x, to.z) ? "ground" : null;
  };

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
    filter.frequency.setValueAtTime(long ? 300 : 900, now);
    if (long) filter.frequency.exponentialRampToValueAtTime(2500, now + 0.25);
    filter.frequency.exponentialRampToValueAtTime(150, now + length);
    const volume = 0.2 * THREE.MathUtils.clamp(200 / Math.max(distance, 1), 0.05, 1);
    sound.connect(filter).connect(fade(volume, length));
    sound.start(now, Math.random() * 2); // from somewhere in the noise, so each is a bit different
    sound.stop(now + length);
  }

  return {
    // The first point on the line from origin along direction (unit) that meets the ground or a
    // building or bridge, to within AIM_STEP / 64 by halving the step there, so it does not jump;
    // else the point range metres along it.
    aim(origin, direction, range) {
      const from = origin.clone();
      const to = origin.clone();
      const half = new THREE.Vector3();
      for (let d = 0; d < range;) {
        const step = Math.max(AIM_STEP, d * AIM_GROWTH);
        d = Math.min(d + step, range);
        to.copy(origin).addScaledVector(direction, d);
        if (meets(from, to) !== null) {
          for (let part = step; part > AIM_STEP / 64; part /= 2) {
            half.lerpVectors(from, to, 0.5);
            if (meets(from, half) !== null) to.copy(half);
            else from.copy(half);
          }
          return to;
        }
        from.copy(to);
      }
      return to;
    },
    // A rocket from a scene point towards another, unless MAX are flying; or a shell, smaller and
    // silent (its bang is the gun's); or a plane's, dropped at the plane's velocity (carried).
    fire(from, to, shell = false, carried = null) {
      if (flying.size >= MAX) return;
      const direction = to.clone().sub(from).normalize();
      const [speed, thrust, top] = shell ? SHELL_FLIGHT : carried ? DROPPED : ROCKET;
      flying.add({
        position: from.clone(),
        direction,
        speed,
        thrust,
        top,
        turn: new THREE.Quaternion().setFromUnitVectors(FORWARD, direction),
        size: shell ? SHELL : 1,
        travelled: 0,
        range: shell ? ACROSS : from.distanceTo(to) + PAST,
        to: to.clone(),
        wait: carried ? DROP : 0,
        carried: carried?.clone(),
      });
      if (!shell && !carried) whoosh(camera.position.distanceTo(from));
    },
    update(dt) {
      let n = 0;
      for (const rocket of flying) {
        const { position, carried } = rocket;
        const dropping = rocket.wait > 0;
        before.copy(position);
        if (dropping) {
          rocket.wait -= dt;
          position.addScaledVector(carried, dt).y -= FALL * dt;
          // Lit: on to where it was aimed, from where it dropped to, at the speed it has.
          if (rocket.wait <= 0) {
            rocket.direction.copy(rocket.to).sub(position).normalize();
            rocket.turn.setFromUnitVectors(FORWARD, rocket.direction);
            rocket.speed = carried.length();
            rocket.range = position.distanceTo(rocket.to) + PAST;
            whoosh(camera.position.distanceTo(position), true);
          }
        } else {
          rocket.speed = Math.min(rocket.speed + rocket.thrust * dt, rocket.top);
          position.addScaledVector(rocket.direction, rocket.speed * dt);
          rocket.travelled += rocket.speed * dt;
        }
        const met = meets(before, position);
        if (met === null && rocket.travelled < rocket.range) {
          matrix.compose(position, rocket.turn, scale.setScalar(rocket.size));
          bodies.setMatrixAt(n, matrix);
          trails.setMatrixAt(n, dropping ? none : matrix);
          n++;
          continue;
        }
        if (met === "ground") explosions.burst(position);
        else if (met !== null) onHit(met);
        flying.delete(rocket);
      }
      for (const mesh of [bodies, trails]) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
