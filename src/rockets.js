// Rockets flying straight with a whoosh and a smoke trail, until they hit a building or bridge
// (structures.hit, then onHit(number)), the ground (a small blast) or are out of RANGE.
import * as THREE from "three";
import { audio, fade } from "./sound.js";

const SPEED = 350; // metres per second
const RANGE = 900; // metres
const AIM_STEP = 10; // metres between the points tested along the line of fire

// structures: from buildings.js; explosions: from explosions.js; heightAt(x, z): the terrain
// height; camera: where the whoosh is heard.
export function createRockets(scene, structures, explosions, heightAt, camera, onHit) {
  // A dark body with a glowing tail and a fading smoke trail behind, the nose along +z; metres.
  const body = new THREE.CylinderGeometry(0.6, 0.6, 8, 6).rotateX(Math.PI / 2);
  const flame = new THREE.ConeGeometry(0.9, 4.5, 6).rotateX(-Math.PI / 2).translate(0, 0, -6.25);
  const trail = new THREE.ConeGeometry(1.2, 40, 6).rotateX(-Math.PI / 2).translate(0, 0, -24);
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x2a3038, flatShading: true });
  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffb040, toneMapped: false });
  const trailMaterial = new THREE.MeshBasicMaterial({
    color: 0xdddddd,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const flying = new Set(); // { group, velocity, travelled }
  const before = new THREE.Vector3();

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
    // building or bridge, else the point at RANGE.
    aim(origin, direction) {
      const from = origin.clone();
      const to = new THREE.Vector3();
      for (let d = AIM_STEP; d <= RANGE; d += AIM_STEP) {
        to.copy(origin).addScaledVector(direction, d);
        if (meets(from, to) !== null) return to;
        from.copy(to);
      }
      return to;
    },
    // A rocket from a scene point towards another.
    fire(from, to) {
      const group = new THREE.Group();
      group.add(
        new THREE.Mesh(body, bodyMaterial),
        new THREE.Mesh(flame, flameMaterial),
        new THREE.Mesh(trail, trailMaterial),
      );
      group.position.copy(from);
      group.lookAt(to);
      scene.add(group);
      const velocity = to.clone().sub(from).setLength(SPEED);
      flying.add({ group, velocity, travelled: 0 });
      whoosh(camera.position.distanceTo(from));
    },
    update(dt) {
      for (const rocket of flying) {
        const { position } = rocket.group;
        before.copy(position);
        position.addScaledVector(rocket.velocity, dt);
        rocket.travelled += SPEED * dt;
        const met = meets(before, position);
        if (met === null && rocket.travelled < RANGE) continue;
        if (met === "ground") explosions.burst(position);
        else if (met !== null) onHit(met);
        scene.remove(rocket.group);
        flying.delete(rocket);
      }
    },
  };
}
