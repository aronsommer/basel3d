import * as THREE from "three";

// Flocks of birds circling above bridges, parks and squares all over the city (flocks, each [x, z],
// else FLOCKS), flapping their wings. All birds are instances of one V, in one draw call.
const FLOCKS = [
  [366, -321], // Mittlere Brücke
  [537, 99], // Münster
  [-300, 1150], // Zoo
  [2300, -2150], // Lange Erlen
  [164, -896], // Johanniterbrücke
  [-100, -1500], // Dreirosenbrücke
  [-1000, -600], // Kannenfeldpark
  [-700, 400], // Schützenmattpark
  [-200, 1500], // Margarethenpark
  [500, 800], // Bahnhof SBB
  [2400, 0], // Birsköpfli
  [300, -3200], // Dreiländereck
];
export function createBirds(boost, heightAt, flocks = FLOCKS) {
  const BIRDS = 50; // per flock
  const SIZE = 2.5; // metres of wingspan, about three times life size so they can be seen
  // Two wings meeting at the body, along +z.
  const v = new THREE.BufferGeometry();
  v.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0, 0, 0.3, -0.5, 0.15, 0, 0, 0, -0.2, 0, 0, 0.3, 0, 0, -0.2, 0.5, 0.15, 0],
      3,
    ),
  );
  const mesh = new THREE.InstancedMesh(
    v,
    new THREE.MeshBasicMaterial({ color: 0x2b2b2b, side: THREE.DoubleSide }),
    flocks.length * BIRDS,
  );
  mesh.frustumCulled = false; // they fly around
  // Each bird: its flock's centre, a radius, a height, a speed and a phase, from a stable hash.
  const random = (i, k) => (Math.abs(Math.sin(i * 12.9898 + k * 78.233)) * 43758.5453) % 1;
  const birds = flocks.flatMap(([x, z], f) =>
    [...Array(BIRDS)].map((_, b) => {
      const i = f * BIRDS + b;
      return {
        x,
        z,
        ground: heightAt(x, z),
        radius: 30 + random(i, 1) * 60,
        height: 40 + random(i, 2) * 40,
        speed: (0.25 + random(i, 3) * 0.2) * (random(i, 4) < 0.5 ? 1 : -1),
        phase: random(i, 5) * 2 * Math.PI,
      };
    }),
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const update = (seconds) => {
    birds.forEach((bird, i) => {
      const a = bird.phase + seconds * bird.speed;
      position.set(
        bird.x + bird.radius * Math.cos(a),
        bird.ground + bird.height + 4 * Math.sin(seconds + bird.phase),
        bird.z + bird.radius * Math.sin(a),
      );
      // Heading along the circle (its velocity is speed × (-sin a, cos a)); the wings beat by
      // squashing the V up and down.
      quaternion.setFromAxisAngle(
        up,
        Math.atan2(-Math.sin(a) * bird.speed, Math.cos(a) * bird.speed),
      );
      const b = boost(position) * SIZE;
      scale.set(b, b * Math.sin(seconds * 9 + bird.phase) * 2, b);
      mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return { mesh, update };
}
