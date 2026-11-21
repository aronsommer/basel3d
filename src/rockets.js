// Rockets flying straight with a whoosh and a smoke trail, until they hit a building or bridge
// (structures.hit, then onHit(number)), the ground (a small blast) or are out of RANGE. Fired
// from a craft they keep its velocity besides their own, so seen from it they stay on its line of
// fire. Those of a plane first drop from it for DROP seconds, then light and speed up by THRUST
// to TOP, and reach FAR.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { audio, fade } from "./sound.js";

const SPEED = 350; // metres per second
const RANGE = 900; // metres
const FAR = 1800; // metres
const DROP = 0.25; // seconds
const FALL = 12; // metres per second while dropping
const THRUST = 2000; // metres per second²
const TOP = 1000; // metres per second
const AIM_STEP = 10; // metres between the points tested along the line of fire
const MAX = 64; // rockets in flight at most
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
  // { position, direction (unit) and speed of its own flight, top (the speed it reaches),
  // carried (the velocity it keeps from what fired it), turn (from +z), size, travelled (metres
  // of its own flight), range, wait (seconds it still drops), to (where it is aimed at, going
  // along with what fired it while it drops) }.
  const flying = new Set();
  const before = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const none = new THREE.Matrix4().makeScale(0, 0, 0); // no trail while dropping
  const STILL = new THREE.Vector3();
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
    // else the point at RANGE, or at FAR for a plane (far).
    aim(origin, direction, far = false) {
      const from = origin.clone();
      const to = new THREE.Vector3();
      const half = new THREE.Vector3();
      for (let d = AIM_STEP; d <= (far ? FAR : RANGE); d += AIM_STEP) {
        to.copy(origin).addScaledVector(direction, d);
        if (meets(from, to) !== null) {
          for (let step = AIM_STEP; step > AIM_STEP / 64; step /= 2) {
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
    meets,
    // A rocket from a scene point towards another, unless MAX are flying; or a shell, smaller and
    // silent (its bang is the gun's). carried: the velocity of the craft firing it, if any;
    // dropped: a plane's.
    fire(from, to, shell = false, carried = STILL, dropped = false) {
      if (flying.size >= MAX) return;
      const direction = to.clone().sub(from).normalize();
      flying.add({
        position: from.clone(),
        direction,
        speed: dropped ? 0 : SPEED,
        top: dropped ? TOP : SPEED,
        carried: carried.clone(),
        turn: new THREE.Quaternion().setFromUnitVectors(FORWARD, direction),
        size: shell ? SHELL : 1,
        travelled: 0,
        range: dropped ? FAR : RANGE,
        wait: dropped ? DROP : 0,
        to: to.clone(),
      });
      if (!shell && !dropped) whoosh(camera.position.distanceTo(from));
    },
    update(dt) {
      let n = 0;
      for (const rocket of flying) {
        const { position } = rocket;
        const dropping = rocket.wait > 0;
        before.copy(position);
        position.addScaledVector(rocket.carried, dt);
        if (dropping) {
          rocket.wait -= dt;
          position.y -= FALL * dt;
          rocket.to.addScaledVector(rocket.carried, dt);
          // Lit: on to where it was aimed, from where it dropped to.
          if (rocket.wait <= 0) {
            rocket.direction.copy(rocket.to).sub(position).normalize();
            rocket.turn.setFromUnitVectors(FORWARD, rocket.direction);
            whoosh(camera.position.distanceTo(position), true);
          }
        } else {
          rocket.speed = Math.min(rocket.speed + THRUST * dt, rocket.top);
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
