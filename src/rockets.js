// Rockets flying straight with a whoosh and a smoke trail, until they hit a building or bridge
// (structures.hit, then onHit(number)), the ground (a small blast) or are out of RANGE.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { audio, fade } from "./sound.js";

const SPEED = 350; // metres per second
const RANGE = 900; // metres
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
      // It leaves the alpha as it is, which the grey view (render in src/main.js) reads.
      blending: THREE.CustomBlending,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    }),
    MAX,
  );
  for (const mesh of [bodies, trails]) {
    mesh.count = 0;
    mesh.frustumCulled = false; // they fly all over
    scene.add(mesh);
  }
  const flying = new Set(); // { position, velocity, turn (from +z), size, travelled }
  const before = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();

  // Whether the segment from → to meets the ground or a building or bridge: "ground", the
  // number of the building or bridge, or null.
  const meets = (from, to) => {
    const number = structures.hit(from, to);
    if (number >= 0) return number;
    return to.y < heightAt(to.x, to.z) ? "ground" : null;
  };

  // A whoosh: noise through a low-pass sweeping down, dull rather than hissing, quieter far away.
  function whoosh(distance) {
    const { context, noise } = audio();
    const now = context.currentTime;
    const sound = context.createBufferSource();
    sound.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.6);
    const volume = 0.2 * THREE.MathUtils.clamp(200 / Math.max(distance, 1), 0.05, 1);
    sound.connect(filter).connect(fade(volume, 0.6));
    sound.start(now, Math.random() * 2); // from somewhere in the noise, so each is a bit different
    sound.stop(now + 0.6);
  }

  return {
    // The first point on the line from origin along direction (unit) that meets the ground or a
    // building or bridge, to within AIM_STEP / 64 by halving the step there, so it does not jump;
    // else the point at RANGE.
    aim(origin, direction) {
      const from = origin.clone();
      const to = new THREE.Vector3();
      const half = new THREE.Vector3();
      for (let d = AIM_STEP; d <= RANGE; d += AIM_STEP) {
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
    // A rocket from a scene point towards another, unless MAX are flying; or a shell, smaller and
    // silent (its bang is the gun's).
    fire(from, to, shell = false) {
      const size = shell ? SHELL : 1;
      if (flying.size >= MAX) return;
      const velocity = to.clone().sub(from).setLength(SPEED);
      const turn = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        velocity.clone().normalize(),
      );
      flying.add({ position: from.clone(), velocity, turn, size, travelled: 0 });
      if (!shell) whoosh(camera.position.distanceTo(from));
    },
    update(dt) {
      let n = 0;
      for (const rocket of flying) {
        const { position } = rocket;
        before.copy(position);
        position.addScaledVector(rocket.velocity, dt);
        rocket.travelled += SPEED * dt;
        const met = meets(before, position);
        if (met === null && rocket.travelled < RANGE) {
          matrix.compose(position, rocket.turn, scale.setScalar(rocket.size));
          bodies.setMatrixAt(n, matrix);
          trails.setMatrixAt(n, matrix);
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
