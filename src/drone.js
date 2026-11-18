// FPV drones: small black quadcopters with orange propellers and a blinking red light, the same
// size on the screen up to BEACON_MAX, hovering in their place. Ridden, one sees through its camera
// (look): up and down tilt the nose, which stays when let go, and it flies where it looks; left
// and right turn it and bank the view; stop hovers. It flies down to just over the ground,
// bridges and roofs and slides along walls. Let go, it is back in its place at once.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { glow, part } from "./parts.js";

const SIZE = 4; // times as large as a real one, to be seen
// Metres per second flying level; diving faster, climbing slower, by up to DIVE times that.
const SPEED = 35;
const DIVE = 0.6;
const TILT = 1.4; // radians per second the nose tilts
const PITCH = 1.3; // radians the nose points up or down at most
const YAW = 2; // radians per second it turns at most
const REACT = 8; // how fast (per second) turning follows the input
const BANK = 0.5; // radians the view leans turning fully
const ABOVE = 0.5; // metres it keeps above what is below
const HIGH = 600; // scene y it flies up to at most
const AHEAD = 0.6; // metres ahead of it that must be free of walls
const BEACON = 0.05; // the blinking light's size on the screen, about 40 px across
const BEACON_MAX = 30; // metres across it is at most, far away

// One per place ({ x, y, z, heading }), each { group, material, update, look }; they share their
// geometries and all materials but their own (so one is highlighted alone). boost(position): how
// much larger to draw one far away; world: { ground(x, z, y): the scene y of the top (ground,
// bridge or roof) under a point at y, blocked(from, to): whether a wall is in the way,
// intoArea(x, z): [x, z] moved into the terrain's area }; camera: the one looking at them.
export function createDrones(places, boost, { ground, blocked, intoArea }, camera) {
  const DARK = 0x1b1d22;
  const ORANGE = 0xff6a00;
  const body = mergeGeometries([
    part(new THREE.BoxGeometry(0.22, 0.06, 0.3), DARK, [0, 0, 0]),
    // Two arms crossing, a motor at each end, the camera at the front.
    ...[-1, 1].map((x) =>
      part(new THREE.BoxGeometry(0.04, 0.03, 0.62).rotateY((x * Math.PI) / 4), DARK, [0, 0, 0]),
    ),
    ...[-1, 1].flatMap((x) =>
      [-1, 1].map((z) =>
        part(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 8), DARK, [x * 0.22, 0.03, z * 0.22]),
      ),
    ),
    part(new THREE.BoxGeometry(0.06, 0.06, 0.05), 0x4a4e55, [0, 0.02, 0.17]),
  ]);
  const blade = part(new THREE.BoxGeometry(0.24, 0.006, 0.03), ORANGE, [0, 0, 0]);
  const beaconMaterial = glow(0xff2020);
  beaconMaterial.sizeAttenuation = false; // sized on the screen
  return places.map(createOne);

  function createOne(place) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(body, material));
    const propellers = [-1, 1].flatMap((x) =>
      [-1, 1].map((z) => {
        const mesh = new THREE.Mesh(blade, material);
        mesh.position.set(x * 0.22, 0.065, z * 0.22);
        group.add(mesh);
        return mesh;
      }),
    );
    const beacon = new THREE.Sprite(beaconMaterial);
    beacon.position.y = 0.1;
    group.add(beacon);
    // pitch: radians the nose points down; turn: the input eased, -1 to 1.
    const parked = { ...place, pitch: 0, turn: 0, speed: 0 };
    const s = { ...parked };
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    // Whether moving by mx, mz is free of walls, AHEAD beyond.
    const free = (mx, mz) => {
      const length = Math.hypot(mx, mz);
      if (!length) return true;
      const reach = 1 + AHEAD / length;
      from.set(s.x, s.y, s.z);
      return !blocked(from, to.set(s.x + mx * reach, s.y, s.z + mz * reach));
    };

    function fly(dt, input) {
      s.pitch = THREE.MathUtils.clamp(s.pitch - input.climb * TILT * dt, -PITCH, PITCH);
      s.turn += (input.turn - s.turn) * Math.min(1, dt * REACT);
      s.heading += s.turn * YAW * dt;
      const cruise = SPEED * (1 + DIVE * Math.sin(s.pitch));
      s.speed += ((input.stop ? 0 : cruise) - s.speed) * Math.min(1, dt * 3);
      const step = s.speed * dt;
      const level = Math.cos(s.pitch) * step;
      const [dx, dz] = [Math.sin(s.heading) * level, Math.cos(s.heading) * level];
      // Against a wall, it slides along.
      if (free(dx, dz)) [s.x, s.z] = [s.x + dx, s.z + dz];
      else if (free(dx, 0)) s.x += dx;
      else if (free(0, dz)) s.z += dz;
      [s.x, s.z] = intoArea(s.x, s.z);
      // Not below what is under where it was, so it does not sink through a roof in one frame.
      const below = ground(s.x, s.z, s.y);
      s.y = Math.max(Math.min(HIGH, s.y - Math.sin(s.pitch) * step), below + ABOVE);
    }

    // Flown by input ({ climb, turn, stop } from steering() in src/main.js), unseen as one sees
    // through it; else in its place, bobbing a little. Its propellers spin, its light blinks.
    function update(seconds, dt, input) {
      if (input) fly(dt, input);
      else Object.assign(s, parked);
      group.visible = !input;
      group.position.set(s.x, s.y + 0.1 * Math.sin(seconds * 2), s.z);
      group.rotation.y = s.heading;
      group.scale.setScalar(SIZE * boost(group.position));
      for (const propeller of propellers) propeller.rotation.y += dt * 60;
      // Not grown with the drone.
      const far = camera.position.distanceTo(group.position);
      beacon.scale.setScalar(Math.min(BEACON, BEACON_MAX / far) / group.scale.x);
      beacon.visible = seconds % 1 < 0.5;
    }
    update(0, 0, null); // in place before the first frame

    // Puts view where its camera is, looking where it flies, leaning into turns.
    const turned = new THREE.Euler();
    function look(view) {
      view.position.set(s.x, s.y, s.z);
      view.quaternion.setFromEuler(turned.set(-s.pitch, s.heading + Math.PI, s.turn * BANK, "YXZ"));
    }

    return { group, material, update, look };
  }
}
