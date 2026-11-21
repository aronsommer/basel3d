// A low-poly fighter jet, twice life size: grey, with a pointed nose, a dark canopy, delta wings,
// two canted fins, two engines and a dark rocket on each wing tip, standing on three legs. Parked
// at its place; flown (createFlight in src/main.js), its engines glow and flicker. It fires
// rockets and does not hover.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { glow, part, profile } from "./parts.js";

const SCALE = 2;
const GREY = 0x8a9199;
const DARK = 0x3a4047;
const GLASS = 0x141a22;
const FLOOR = 1.5; // metres from its middle down to what it stands on, before scaling
// Along +z (the nose).
const along = (g) => g.rotateX(Math.PI / 2);
// A plate 0.15 m thick with this outline seen from above ([x, z] points of its right half),
// mirrored to the left.
const plate = (half) =>
  new THREE.ExtrudeGeometry(
    new THREE.Shape(
      [
        ...half,
        ...half
          .filter(([x]) => x)
          .toReversed()
          .map(([x, z]) => [-x, z]),
      ].map(([x, z]) => new THREE.Vector2(x, z)),
    ),
    { depth: 0.15, bevelEnabled: false },
  ).rotateX(Math.PI / 2);

// The jet at place ({ x, y, z, heading }): { group, material, update(seconds, flown), land(y):
// parks it at the height y, launchers (where its rockets leave, in its own frame), speed, turn,
// lift, low, dip (as createFlight, fly and shoot in src/main.js take them), plane }; boost as for
// the vehicles; level: the nose angle of level flight.
export function createJet({ x, y, z, heading }, boost, level) {
  const TIP = 5.1; // metres from the middle to the rockets on the wing tips
  // Below the wing tips, so the rockets fired do not start inside those on them.
  const launchers = [-1, 1].map((side) =>
    new THREE.Vector3(side * TIP, -0.8, -0.2).multiplyScalar(SCALE),
  );
  const body = mergeGeometries([
    part(along(new THREE.CylinderGeometry(0.9, 0.7, 11, 8)), GREY, [0, 0, 0]),
    part(along(new THREE.ConeGeometry(0.9, 4, 8)), GREY, [0, 0, 7.5]), // nose
    part(new THREE.SphereGeometry(0.6, 8, 6).scale(0.9, 0.8, 2.4), GLASS, [0, 0.7, 3.2]), // canopy
    part(
      plate([
        [0, 2.5],
        [5, -2.5],
        [5, -3.8],
        [0, -3.2],
      ]),
      GREY,
      [0, 0, 0],
    ), // wings
    part(
      plate([
        [0, -3.6],
        [2.8, -5.6],
        [2.8, -6.4],
        [0, -5.8],
      ]),
      GREY,
      [0, 0.1, 0],
    ), // tailplanes
    ...[-1, 1].flatMap((side) => [
      part(
        profile(
          [
            [-3.2, 0],
            [-5.2, 2.4],
            [-6, 2.4],
            [-5.6, 0],
          ],
          0.12,
        ).rotateZ(-side * 0.3),
        GREY,
        [side * 0.8, 0.5, 0],
      ), // fin
      part(new THREE.BoxGeometry(0.7, 0.8, 3.5), GREY, [side * 1.1, -0.1, 0.8]), // intake
      part(along(new THREE.CylinderGeometry(0.55, 0.45, 1, 8)), DARK, [side * 0.5, 0, -5.9]), // nozzle
      part(along(new THREE.CylinderGeometry(0.25, 0.25, 3.6, 6)), DARK, [side * TIP, 0, -2.6]), // rocket
      part(along(new THREE.ConeGeometry(0.25, 0.8, 6)), DARK, [side * TIP, 0, -0.4]), // its tip
      part(new THREE.BoxGeometry(0.1, 0.9, 0.1), DARK, [side * 1.2, -1.05, -2]), // leg
    ]),
    part(new THREE.BoxGeometry(0.1, 0.9, 0.1), DARK, [0, -1.05, 4]), // front leg
  ]).scale(SCALE, SCALE, SCALE);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // The engines' fire, unlit and added onto what is behind: a bright core from each nozzle and a
  // soft glow round it.
  const NOZZLE = -6.4 * SCALE; // z of the nozzles' ends
  const cores = new THREE.Mesh(
    mergeGeometries(
      [-1, 1].map((side) =>
        new THREE.ConeGeometry(0.4, 3, 6)
          .rotateX(-Math.PI / 2)
          .translate(side * 0.5, 0, -1.5)
          .scale(SCALE, SCALE, SCALE),
      ),
    ),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffc080).multiplyScalar(2),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  cores.position.z = NOZZLE;
  const glowing = glow(0xff6a20);
  const glows = [-1, 1].map((side) => {
    const sprite = new THREE.Sprite(glowing);
    sprite.position.set(side * 0.5 * SCALE, 0, NOZZLE - 1);
    return sprite;
  });
  const group = new THREE.Group().add(new THREE.Mesh(body, material), cores, ...glows);
  group.rotation.order = "YXZ"; // heading first, then pitch and bank
  const parked = new THREE.Vector3(x, y + FLOOR * SCALE, z);

  // Placed by flown while flown, its fire growing with its speed and flickering, else parked.
  const update = (seconds, flown) => {
    if (flown) {
      group.position.set(flown.x, flown.y, flown.z);
      group.rotation.set(flown.nose - level, flown.heading, -0.9 * flown.turn * flown.speed);
      const fire = (0.4 + 0.6 * flown.speed) * (0.85 + 0.15 * Math.sin(seconds * 47));
      cores.scale.z = fire;
      for (const sprite of glows) sprite.scale.setScalar(9 * fire);
    } else {
      group.position.copy(parked);
      group.rotation.set(0, heading, 0);
    }
    cores.visible = glows[0].visible = glows[1].visible = !!flown;
    group.scale.setScalar(boost(group.position));
  };
  update(0, null);
  return {
    group,
    material,
    update,
    land: (y) => (parked.y = y + FLOOR * SCALE),
    launchers,
    speed: 180,
    turn: 1.2,
    lift: 40,
    low: FLOOR * SCALE,
    nose: 9.5 * SCALE, // metres from its middle to its nose
    dip: 0.05, // radians it fires below its body, so its crosshair shows just above its nose
    plane: true,
  };
}
