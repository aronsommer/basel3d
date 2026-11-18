// Basel police cars: white, with an orange line along the middle of each side, POLIZEI on the
// back and a light bar whose blue lights flash in turn; driven as in src/drive.js.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part, profile } from "./parts.js";
import { createDriving } from "./drive.js";

const WIDTH = 1.84; // metres
const AXLES = 2.9; // metres between them
const WHEEL = 0.34; // radius in metres
const SPEC = {
  max: 35,
  back: 8,
  accelerate: 11,
  brake: 50,
  roll: 5,
  steer: 0.6,
  grip: 150,
  react: 6,
  axles: AXLES,
  half: 2.4,
  width: WIDTH,
};

// One car per place ({ x, y, z, heading }), each { group, material, update }; they share their
// geometries and all materials but the body's (so one is highlighted alone). boost(position): how
// much larger to draw one far away; world: as for createDriving (src/drive.js).
export function createPolice(places, boost, world) {
  const WHITE = 0xf4f6f8;
  const ORANGE = 0xff7a10;
  const GLASS = 0x18202a;
  const DARK = 0x24272c;
  const body = mergeGeometries([
    part(
      profile(
        [
          [-2.4, 0.3],
          [2.4, 0.3],
          [2.4, 0.8],
          [1.3, 0.98],
          [-1.9, 1.0],
          [-2.4, 0.95],
        ],
        WIDTH,
      ),
      WHITE,
      [0, 0, 0],
    ),
    part(
      profile(
        [
          [-1.85, 0.99],
          [1.3, 0.97],
          [0.45, 1.5],
          [-1.15, 1.5],
        ],
        1.6,
      ),
      GLASS,
      [0, 0, 0],
    ),
    part(new THREE.BoxGeometry(1.62, 0.06, 1.62), WHITE, [0, 1.52, -0.35]), // roof
    part(new THREE.BoxGeometry(1.2, 0.08, 0.32), DARK, [0, 1.59, -0.2]), // light bar
    ...[-1, 1].map((end) =>
      part(new THREE.BoxGeometry(1.9, 0.2, 0.14), DARK, [0, 0.38, end * 2.4]),
    ), // bumpers
    // The orange lines, above the wheels.
    ...[-1, 1].map((side) =>
      part(new THREE.BoxGeometry(0.02, 0.15, 4.5), ORANGE, [side * (WIDTH / 2 + 0.01), 0.75, 0]),
    ),
  ]);
  // Head and tail lights, unlit so they glow.
  const lamps = mergeGeometries(
    [-1, 1].flatMap((side) => [
      part(new THREE.BoxGeometry(0.4, 0.12, 0.04), 0xffffff, [side * 0.62, 0.72, 2.41]),
      part(new THREE.BoxGeometry(0.36, 0.14, 0.04), 0xff1a1a, [side * 0.66, 0.82, -2.41]),
    ]),
  );
  const lampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  // POLIZEI on the back between the tail lights, drawn here, so nothing is loaded.
  const canvas = Object.assign(document.createElement("canvas"), { width: 512, height: 96 });
  const context = canvas.getContext("2d");
  context.font = "bold 80px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#1a2b5c";
  context.fillText("POLIZEI", 256, 50);
  const lettering = new THREE.CanvasTexture(canvas);
  lettering.colorSpace = THREE.SRGBColorSpace;
  // Facing back.
  const sign = new THREE.PlaneGeometry(0.9, 0.17).rotateY(Math.PI).translate(0, 0.62, -2.405);
  const signMaterial = new THREE.MeshLambertMaterial({ map: lettering, alphaTest: 0.5 });
  // The flashing lights on the bar, one each side: lit, a bright core in a blue glow added onto
  // what is behind it; else blue as their covers.
  const on = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3060ff).multiplyScalar(3) });
  const off = new THREE.MeshBasicMaterial({ color: 0x1a3a8a });
  const lens = new THREE.BoxGeometry(0.5, 0.14, 0.3);
  const fade = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
  const brush = fade.getContext("2d");
  const gradient = brush.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "#fff");
  gradient.addColorStop(0.25, "rgba(255, 255, 255, 0.6)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  brush.fillStyle = gradient;
  brush.fillRect(0, 0, 64, 64);
  const glowMaterial = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(fade),
    color: 0x1848ff,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const tyre = part(
    new THREE.CylinderGeometry(WHEEL, WHEEL, 0.24, 10).rotateZ(Math.PI / 2),
    DARK,
    [0, 0, 0],
  );
  // Each car's lights flash this many seconds later than the one before, so they do not flash
  // together.
  return places.map((place, k) => createCar(place, k * 0.23));

  function createCar(place, late) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const group = new THREE.Group();
    group.rotation.order = "YXZ"; // heading first, then pitch
    group.add(
      new THREE.Mesh(body, material),
      new THREE.Mesh(lamps, lampMaterial),
      new THREE.Mesh(sign, signMaterial),
    );
    const flashers = [-1, 1].map((side) => {
      const core = new THREE.Mesh(lens, off);
      core.position.set(side * 0.32, 1.68, -0.2);
      const glow = new THREE.Sprite(glowMaterial);
      glow.position.copy(core.position);
      glow.scale.setScalar(1.6); // metres across
      group.add(core, glow);
      return { core, glow };
    });
    // Front left, front right, back left, back right.
    const wheels = [1, -1].flatMap((end) =>
      [1, -1].map((side) => {
        const wheel = new THREE.Mesh(tyre, material);
        wheel.position.set(side * 0.86, WHEEL, (end * AXLES) / 2); // a little out of the body
        wheel.rotation.order = "YXZ"; // steered, then turning
        group.add(wheel);
        return wheel;
      }),
    );
    const driving = createDriving(place, SPEC, world);
    const s = driving.state;

    // Driven by input (createDriving), else in its place; its lights flashing.
    function update(seconds, dt, input) {
      driving.step(dt, input);
      group.position.set(s.x, s.y, s.z);
      group.rotation.set(s.pitch, s.heading, 0);
      group.scale.setScalar(boost(group.position));
      wheels.forEach((wheel, k) => {
        wheel.rotation.x = s.rolled / WHEEL;
        if (k < 2) wheel.rotation.y = s.steer;
      });
      // Each side flashes twice, then the other, 0.6 s in all.
      const t = (seconds + late) % 0.6;
      const flash = t % 0.3 < 0.07 || (t % 0.3 > 0.12 && t % 0.3 < 0.19);
      flashers.forEach(({ core, glow }, k) => {
        glow.visible = flash && t < 0.3 === (k === 0);
        core.material = glow.visible ? on : off;
      });
    }
    update(0, 0, null); // in place before the first frame

    return { group, material, update };
  }
}
