// A flying saucer hiding on the Novartis Campus, hovering low over a roof near the Pavillon,
// slowly turning, covered in the Pavillon's light show (src/pavilion.js), wherever it is. Ridden,
// it is flown like the helicopter and fires laser bolts; let go, it is back in its place at once,
// as the helicopter on its circle.
import * as THREE from "three";
import { PAVILION_BLACK, pavilionLights } from "./pavilion.js";
import { fade, audio } from "./sound.js";

const [CX, CZ] = [-201.4, -1885.9]; // scene x, z of its place
const ABOVE = 7; // metres between its underside and what is below its place
const NEAR = 60; // metres from its place within which it is drawn life size
const GREEN = 0x39ff14; // neon green: the bolts, the guns' tips, strips and muzzle flashes
const BOLT_SPEED = 900; // metres per second
const MAX_BOLTS = 32; // in flight at most, and as many flashes
const FLASH = 0.25; // seconds a flash lasts where a bolt ends

// boost(position): how much larger to draw it far away (src/main.js); roof(x, z): the scene y of
// the top there. Its material has vertex colours, which riders (src/main.js) turn off to
// highlight it; then it shows no light show.
export function createUfo(boost, roof) {
  // Its hull around y, in metres from its underside: flat and wide, a shallow cone below, a sharp
  // rim at 2 m, a long slope up to the canopy.
  const hull = new THREE.LatheGeometry(
    [
      [0, 0],
      [5, 0],
      [18, 1.6],
      [18.6, 2],
      [18, 2.3],
      [6, 3.8],
      [0, 3.8],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    64,
  );
  hull.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(new Array(hull.attributes.position.count * 3).fill(1), 3),
  );
  const material = new THREE.MeshLambertMaterial({ color: 0xc4cad2, vertexColors: true });
  material.onBeforeCompile = (shader) => {
    pavilionLights(shader);
    // vUfoOff: metres from its middle, x and z, unscaled but turned as in the scene, so the show
    // stays put while the hull turns, as on the Pavillon.
    const varyings = "varying vec3 vUfoLocal;\nvarying vec2 vUfoOff;";
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${varyings}`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vUfoLocal = transformed;
        vUfoOff = (modelMatrix * vec4(transformed, 0.0)).xz / length(modelMatrix[0].xyz);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${varyings}`)
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        #ifdef USE_COLOR
        pavilionModules(vUfoOff, vUfoLocal.y, length(fwidth(vUfoLocal)), diffuseColor.rgb,
          totalEmissiveRadiance);
        #endif`,
      );
  };
  const body = new THREE.Mesh(hull, material);
  // Glowing green: the guns' strips and muzzle flashes, the bolts and their flashes. It adds its colour and
  // leaves the alpha, which the grey view (render in src/main.js) reads.
  const glowing = new THREE.MeshBasicMaterial({
    color: GREEN,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const ball = new THREE.SphereGeometry(1, 12, 8);
  // Two black guns on arms out from the rim, left and right, pointing ahead (+z): each an angular
  // spike, thick near the back, with a short point behind and tapering to a point ahead, its
  // last 3 m neon green, with a glowing strip along its top and a flash at the muzzle as it
  // fires. Built for the right side (+x), mirrored for the left. They turn
  // with its heading, not with the hull.
  const GUN = [20.8, 2, 17]; // x (either side), y and z of the muzzles
  const black = new THREE.MeshLambertMaterial({
    color: new THREE.Color().setRGB(...PAVILION_BLACK), // as inside the Pavillon
  });
  const along = (geometry, z) => geometry.rotateX(Math.PI / 2).translate(GUN[0], GUN[1], z); // its axis along z
  // Square in section (4 sides, turned to stand flat), radii at the ends front and back.
  const square = (front, back, length, z) =>
    along(new THREE.CylinderGeometry(front, back, length, 4).rotateY(Math.PI / 4), z);
  const parts = [
    // The arm, under its middle, from inside the rim to the spike, thinner than the rim.
    new THREE.BoxGeometry(2, 0.4, 3).translate(18.9, GUN[1], -2.25),
    square(0.33, 1.7, 23, GUN[2] - 14.5), // the spike, from 26 m back to the tip
    square(1.7, 0, 3.5, GUN[2] - 27.75), // the point behind
  ];
  // The tip, going on as the spike to 0.15 m at the muzzle; unlit and not tone-mapped, so always
  // that green.
  const tip = new THREE.Mesh(
    square(0.15, 0.33, 3, GUN[2] - 1.5),
    new THREE.MeshBasicMaterial({ color: GREEN, toneMapped: false }),
  );
  // On the spike's top, which sinks 0.042 m per metre ahead and is 0.95 m above its axis 3 m back.
  const strip = new THREE.BoxGeometry(0.4, 0.2, 10)
    .rotateX(0.042)
    .translate(GUN[0], GUN[1] + 1.05, -3);
  const cannons = [-1, 1].map((side) => {
    const muzzle = new THREE.Mesh(ball, glowing); // the flash, shown while it fades
    muzzle.position.set(GUN[0], GUN[1], GUN[2]);
    muzzle.scale.setScalar(0);
    muzzle.visible = false;
    const gun = new THREE.Group().add(
      ...parts.map((geometry) => new THREE.Mesh(geometry, black)),
      tip.clone(),
      new THREE.Mesh(strip, glowing),
      muzzle,
    );
    gun.scale.x = side;
    return { gun, muzzle, at: new THREE.Vector3(side * GUN[0], GUN[1], GUN[2]) };
  });
  // A black canopy.
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(6, 32, 8, 0, Math.PI * 2, 0, Math.PI / 2)
      .scale(1, 0.55, 1)
      .translate(0, 3.8, 0),
    black,
  );
  const group = new THREE.Group().add(body, canopy, ...cannons.map((c) => c.gun));
  group.rotation.order = "YXZ"; // heading first, then tilt in its frame
  group.position.set(CX, roof(CX, CZ) + ABOVE, CZ);

  // Bolts flying from the guns in turn (fire), fat and 24 m long, and flashes growing and shrinking
  // where they end; each kind in one draw call.
  const bolts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 24, 8).rotateX(Math.PI / 2),
    glowing,
    MAX_BOLTS,
  );
  const flashes = new THREE.InstancedMesh(ball, glowing, MAX_BOLTS);
  for (const mesh of [bolts, flashes]) {
    mesh.count = 0;
    mesh.frustumCulled = false; // all over
  }
  const flying = new Set(); // { position, velocity, turn (from +z), left (seconds), target, arrive }
  const ending = new Set(); // flashes { position, age }
  const matrix = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const size = new THREE.Vector3();
  const still = new THREE.Quaternion();
  let side = 0; // the cannon the next bolt leaves

  const place = new THREE.Vector3(); // its place
  let nextRoof = 0; // when to look up the roof again (seconds), in case it was blown up
  let spin = 0;
  // flown (createFlight in src/main.js) while ridden, else null.
  function update(seconds, dt, flown) {
    if (seconds >= nextRoof) {
      nextRoof = seconds + 5;
      place.set(CX, roof(CX, CZ) + ABOVE, CZ);
    }
    const { position, rotation } = group;
    if (flown) {
      position.set(flown.x, flown.y, flown.z);
      // Leaning into turns more than the helicopter.
      rotation.set(0.3 * flown.nose, flown.heading, -0.5 * flown.turn * flown.speed);
    } else {
      // Bobbing gently, level.
      position.copy(place).y += 1.5 * Math.sin(seconds * 1.2);
      rotation.x = rotation.z = 0;
    }
    const near = THREE.MathUtils.clamp(1 - position.distanceTo(place) / NEAR, 0, 1);
    spin += dt * (0.3 + 1.7 * (1 - near)); // slowly in its place, fast away
    body.rotation.y = spin;
    group.scale.setScalar(THREE.MathUtils.lerp(boost(position), 1, near));
    for (const { muzzle } of cannons) {
      muzzle.scale.multiplyScalar(Math.exp(-12 * dt));
      muzzle.visible = muzzle.scale.x > 0.1;
    }

    let n = 0;
    for (const bolt of flying) {
      bolt.left -= dt;
      if (bolt.left <= 0) {
        flying.delete(bolt);
        ending.add({ position: bolt.target, age: 0 });
        bolt.arrive();
        continue;
      }
      bolt.position.addScaledVector(bolt.velocity, dt);
      bolts.setMatrixAt(n++, matrix.compose(bolt.position, bolt.turn, one));
    }
    bolts.count = n;
    n = 0;
    for (const flash of ending) {
      flash.age += dt;
      if (flash.age >= FLASH) {
        ending.delete(flash);
        continue;
      }
      size.setScalar(6 * Math.sin((Math.PI * flash.age) / FLASH));
      flashes.setMatrixAt(n++, matrix.compose(flash.position, still, size));
    }
    flashes.count = n;
    for (const mesh of [bolts, flashes]) mesh.instanceMatrix.needsUpdate = true;
  }
  return {
    group,
    meshes: [group, bolts, flashes],
    // Flown at speed metres per second, turning up to turn radians per second (createFlight in
    // src/main.js): far faster than the helicopter.
    speed: 220,
    turn: 1.8,
    lift: 100, // metres it first rises straight up when boarded
    material,
    update,
    // A bolt from the next cannon to a scene point, with a zap; arrive() is called when it is
    // there. None while MAX_BOLTS are flying.
    fire(target, arrive) {
      if (flying.size >= MAX_BOLTS) return;
      const cannon = cannons[side];
      side = 1 - side;
      group.updateMatrixWorld(); // this frame's place
      const position = group.localToWorld(cannon.at.clone());
      const velocity = target.clone().sub(position).setLength(BOLT_SPEED);
      const turn = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        velocity.clone().normalize(),
      );
      const left = position.distanceTo(target) / BOLT_SPEED;
      flying.add({ position, velocity, turn, left, target, arrive });
      cannon.muzzle.scale.setScalar(2);
      zap();
    },
  };
}

// A big laser shot: a buzzing tone falling from 650 to 50 Hz, its brightness falling with it
// through a resonant filter, after a short, bright crack of noise.
function zap() {
  const { context, noise } = audio();
  const now = context.currentTime;
  const LENGTH = 0.6; // seconds
  const fall = now + 0.35; // when pitch and brightness are down
  const out = fade(0.07, LENGTH);
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 4;
  filter.frequency.setValueAtTime(4000, now);
  filter.frequency.exponentialRampToValueAtTime(200, fall);
  filter.connect(out);
  const tone = context.createOscillator();
  tone.type = "sawtooth";
  tone.frequency.setValueAtTime(650, now);
  tone.frequency.exponentialRampToValueAtTime(50, fall);
  tone.connect(filter);
  const crack = context.createBufferSource();
  crack.buffer = noise;
  const high = context.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 3000;
  const level = context.createGain();
  level.gain.setValueAtTime(0.6, now);
  level.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  crack.connect(high).connect(level).connect(out);
  tone.start(now);
  tone.stop(now + LENGTH);
  crack.start(now, Math.random() * 2); // from somewhere in the noise
  crack.stop(now + 0.04);
}
