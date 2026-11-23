// Basel ambulances, Mercedes Sprinters with a box body: fluorescent yellow-green, along each side a
// band of slanted blue and white blocks, a blue Star of Life at the back, a blue ECG line from it,
// RETTUNG BASEL-STADT and SANITÄT 144 at the top, AMBULANCE on the bonnet and the back; a blue
// light bar over the cab and blue lights at the back flash in turn. Driven as in src/drive.js.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { glow, part, profile } from "./parts.js";
import { createDriving } from "./drive.js";

const WIDTH = 2.2; // metres, the box's
const CAB = 1.99; // metres wide
const HALF = 3.45; // metres from the middle to the front
const BACK = 3.05; // metres from the middle to the back
const LENGTH = HALF + BACK;
const BOX = 0.9; // metres from the middle to the box's front, where the cab begins
const TOP = 2.95; // metres up the box's roof
const WHEEL = 0.37; // radius in metres
const AXLES = [2.45, -1.215]; // metres from the middle, front and back
const SPEC = {
  max: 35,
  back: 8,
  accelerate: 12,
  brake: 45,
  roll: 5,
  steer: 0.65,
  grip: 350,
  spin: 0,
  react: 10,
  axles: AXLES[0] - AXLES[1],
  half: HALF,
  width: WIDTH,
};
const K = 1024 / LENGTH; // the side markings' canvas pixels per metre
const ROWS = 384; // pixels high, each side's markings
const FOOT = 0.4; // metres up the side markings' foot

// A wheel arch of this radius around [z, y], from its back to its front.
const arch = (z, y, radius) =>
  Array.from({ length: 7 }, (_, k) => [
    z - radius * Math.cos((k * Math.PI) / 6),
    y + radius * Math.sin((k * Math.PI) / 6),
  ]);
// Front, back: [z, y, radius] of the wheel arches.
const ARCHES = [
  [AXLES[0], WHEEL, 0.48],
  [AXLES[1], 0.45, 0.47],
];

// One ambulance per place ({ x, y, z, heading }), each { group, material, update, half, width };
// they share their geometries and all materials but the body's (so one is highlighted alone).
// boost(position): how much larger to draw one far away; world: as for createDriving
// (src/drive.js).
export function createAmbulances(places, boost, world) {
  const LIME = 0xcde628;
  const BLUE = "#1d4f9c";
  const GLASS = 0x141a22;
  const DARK = 0x2a2d32;
  const screen = Math.atan2(1.03, 0.8); // the windscreen's slope
  const bonnet = Math.atan2(0.2, 0.63); // its slope
  const body = mergeGeometries([
    // The cab: bumper, bonnet, windscreen, roof.
    part(
      profile(
        [
          [BOX, 0.45],
          ...arch(...ARCHES[0]),
          [HALF, 0.4],
          [HALF + 0.02, 0.75],
          [3.38, 1.1],
          [2.75, 1.3],
          [1.95, 2.33],
          [BOX, 2.38],
        ],
        CAB,
      ),
      LIME,
      [0, 0, 0],
    ),
    // The box, and over the cab its front, with the blue lights.
    part(
      profile([[-BACK, 0.45], ...arch(...ARCHES[1]), [BOX, 0.45], [BOX, TOP], [-BACK, TOP]], WIDTH),
      LIME,
      [0, 0, 0],
    ),
    part(
      profile(
        [
          [BOX, 2.38],
          [1.98, 2.38],
          [2.05, 2.62],
          [BOX, TOP],
        ],
        CAB,
      ),
      LIME,
      [0, 0, 0],
    ),
    // The door windows, a slab a little wider than the cab, so it shows on both sides; one window
    // in the box's front, the same; two in the back doors; the windscreen.
    part(
      profile(
        [
          [1.45, 1.35],
          [2.62, 1.35],
          [2.02, 2.2],
          [1.45, 2.2],
        ],
        CAB + 0.02,
      ),
      GLASS,
      [0, 0, 0],
    ),
    part(new THREE.BoxGeometry(WIDTH + 0.02, 0.65, 0.6), GLASS, [0, 1.92, 0.5]),
    ...[-1, 1].map((side) =>
      part(new THREE.BoxGeometry(0.6, 0.5, 0.02), GLASS, [side * 0.5, 2.15, -BACK - 0.005]),
    ),
    part(new THREE.BoxGeometry(1.8, 0.02, 1.2).rotateX(screen), GLASS, [0, 1.82, 2.36]),
    // Dark grey: the front bumper and grille, the back step, the light bar's foot, the mirrors.
    part(new THREE.BoxGeometry(CAB + 0.02, 0.36, 0.14), DARK, [0, 0.58, 3.42]),
    part(new THREE.BoxGeometry(0.8, 0.24, 0.04), DARK, [0, 0.95, 3.42]),
    part(new THREE.BoxGeometry(WIDTH, 0.14, 0.3), DARK, [0, 0.42, -BACK - 0.1]),
    part(new THREE.BoxGeometry(1.64, 0.06, 0.3), DARK, [0, 2.67, 1.85]),
    ...[-1, 1].map((side) =>
      part(new THREE.BoxGeometry(0.12, 0.32, 0.16), DARK, [side * 1.12, 1.75, 2.45]),
    ),
  ]);
  // Head and tail lights, unlit so they glow.
  const lamps = mergeGeometries(
    [-1, 1].flatMap((side) => [
      part(new THREE.BoxGeometry(0.4, 0.14, 0.04), 0xffffff, [side * 0.68, 1.0, 3.4]),
      part(new THREE.BoxGeometry(0.14, 0.4, 0.04), 0xff1a1a, [side * 0.98, 0.95, -BACK - 0.02]),
    ]),
  );
  const lampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  // The markings, drawn here, so nothing is loaded: the side at +x (front at the left), the side
  // at -x (front at the right), each ROWS pixels high, then AMBULANCE for the bonnet and the back,
  // 64 high.
  const canvas = Object.assign(document.createElement("canvas"), {
    width: 1024,
    height: 2 * ROWS + 64,
  });
  const brush = canvas.getContext("2d");
  brush.textAlign = "center";
  brush.lineJoin = "round";
  [false, true].forEach((flip, k) => {
    // The pixel s metres from the front and y metres up.
    const at = (s, y) => [(flip ? LENGTH - s : s) * K, (FOOT - y) * K + ROWS * (k + 1)];
    const poly = (points) => {
      brush.beginPath();
      for (const [s, y] of points) brush.lineTo(...at(s, y));
    };
    brush.save();
    brush.beginPath();
    brush.rect(0, ROWS * k, canvas.width, ROWS);
    brush.clip();
    // The band, its blocks leaning back, cut out over the wheel arches.
    for (let n = 0; n < 18; n++) {
      const s = 0.1 + 0.35 * n;
      brush.fillStyle = n % 2 ? "#fff" : BLUE;
      poly([
        [s, 0.86],
        [s + 0.35, 0.86],
        [s + 0.43, 1.1],
        [s + 0.08, 1.1],
      ]);
      brush.fill();
    }
    brush.globalCompositeOperation = "destination-out";
    for (const [z, y, radius] of ARCHES) {
      brush.beginPath();
      brush.arc(...at(HALF - z, y), (radius + 0.02) * K, 0, 2 * Math.PI);
      brush.fill();
    }
    brush.globalCompositeOperation = "source-over";
    // The Star of Life: three blue arms edged white, a white staff with a snake.
    const [cx, cy] = at(5.8, 1.75);
    for (const [color, grow] of [
      ["#fff", 0.05],
      [BLUE, 0],
    ])
      for (let n = 0; n < 3; n++) {
        brush.save();
        brush.translate(cx, cy);
        brush.rotate((n * Math.PI) / 3);
        brush.fillStyle = color;
        brush.fillRect(
          (-0.19 - grow) * K,
          (-0.62 - grow) * K,
          (0.38 + 2 * grow) * K,
          (1.24 + 2 * grow) * K,
        );
        brush.restore();
      }
    brush.strokeStyle = "#fff";
    brush.lineWidth = 0.05 * K;
    poly([
      [5.8, 1.25],
      [5.8, 2.25],
    ]);
    brush.stroke();
    brush.lineWidth = 0.03 * K;
    poly(Array.from({ length: 9 }, (_, n) => [5.8 + 0.09 * Math.sin(n * 1.6), 1.35 + 0.11 * n]));
    brush.stroke();
    // The ECG line, from the box's window to the star, with two beats.
    brush.strokeStyle = BLUE;
    brush.lineWidth = 0.035 * K;
    const beat = (s) =>
      [
        [0, 0],
        [0.06, 0.08],
        [0.12, 0],
        [0.18, 0.5],
        [0.25, -0.35],
        [0.31, 0],
        [0.45, 0.1],
        [0.55, 0],
      ].map(([ds, dy]) => [s + ds, 1.75 + dy]);
    poly([[3.3, 1.75], ...beat(3.5), ...beat(4.4), [5.2, 1.75]]);
    brush.stroke();
    brush.restore();
    brush.font = `bold ${0.2 * K}px sans-serif`;
    brush.fillStyle = BLUE;
    brush.fillText("RETTUNG BASEL-STADT", ...at(3.7, 2.6), 2 * K);
    brush.font = `bold ${0.17 * K}px sans-serif`;
    brush.fillStyle = "#fff";
    brush.fillText("SANITÄT 144", ...at(3.7, 2.37), 1.1 * K);
  });
  brush.font = `bold ${0.18 * K}px sans-serif`;
  brush.fillStyle = BLUE;
  brush.fillText("AMBULANCE", 512, 2 * ROWS + 32 + 0.065 * K, 1.3 * K);
  const markings = new THREE.CanvasTexture(canvas);
  markings.colorSpace = THREE.SRGBColorSpace;
  markings.anisotropy = 8; // sharp when seen at a slant
  // A plane showing the canvas from u0 to u1 and v0 to v1.
  const decal = (width, height, u0, u1, v0, v1) => {
    const plane = new THREE.PlaneGeometry(width, height);
    const uv = plane.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    return plane;
  };
  const height = ROWS / K; // metres the side markings are high
  const row = ROWS / canvas.height; // of the canvas
  const split = (HALF - BOX) / LENGTH; // of a side's markings, where the cab ends
  // Each side on the cab and on the box, which is wider.
  const sides = [1, -1].flatMap((side, k) => {
    const [v0, v1] = [1 - (k + 1) * row, 1 - k * row];
    const cab = k ? [1 - split, 1] : [0, split];
    const box = k ? [0, 1 - split] : [split, 1];
    return [
      [cab, CAB, HALF, BOX],
      [box, WIDTH, BOX, -BACK],
    ].map(([[u0, u1], width, front, back]) =>
      decal(front - back, height, u0, u1, v0, v1)
        .rotateY((side * Math.PI) / 2)
        .translate((side * width) / 2 + side * 0.005, FOOT + height / 2, (front + back) / 2),
    );
  });
  // AMBULANCE, 1.3 m long at the side markings' scale, times scale.
  const word = (scale) =>
    decal(
      1.3 * scale,
      (64 / K) * scale,
      0.5 - (0.65 * K) / 1024,
      0.5 + (0.65 * K) / 1024,
      0,
      1 - 2 * row,
    );
  const decals = mergeGeometries([
    ...sides,
    word(1)
      .rotateX(bonnet - Math.PI / 2)
      .translate(0, 1.21, 3.08),
    word(1.5)
      .rotateY(Math.PI)
      .translate(0, 1.6, -BACK - 0.005), // under the back windows
  ]);
  const decalMaterial = new THREE.MeshLambertMaterial({ map: markings, alphaTest: 0.5 });
  // The flashing lights, lit: a bright core in a blue glow added onto what is behind it; else blue
  // as their covers. The light bar's halves on the box's front over the cab, and at the box's top
  // back corners, left then right; each [lens, x, y, z].
  const on = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3060ff).multiplyScalar(3) });
  const off = new THREE.MeshBasicMaterial({ color: 0x1a3a8a });
  const bar = new THREE.BoxGeometry(0.78, 0.12, 0.26);
  const lens = new THREE.BoxGeometry(0.3, 0.12, 0.2);
  const glowMaterial = glow(0x1848ff);
  const LIGHTS = [-1, 1].flatMap((side) => [
    [bar, side * 0.4, 2.76, 1.85],
    [lens, side * 0.85, 2.82, -BACK + 0.06],
  ]);
  // Front, back: a wheel, the back ones doubled.
  const tyres = [0.24, 0.42].map((width) =>
    mergeGeometries([
      part(
        new THREE.CylinderGeometry(WHEEL, WHEEL, width, 10).rotateZ(Math.PI / 2),
        DARK,
        [0, 0, 0],
      ),
      part(
        new THREE.CylinderGeometry(0.22, 0.22, width + 0.01, 10).rotateZ(Math.PI / 2),
        0xb8bcc2,
        [0, 0, 0],
      ),
    ]),
  );
  // Each ambulance's lights flash this many seconds later than the one before, so they do not
  // flash together.
  return places.map((place, k) => createAmbulance(place, k * 0.23));

  function createAmbulance(place, late) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const group = new THREE.Group();
    group.rotation.order = "YXZ"; // heading first, then pitch
    group.add(
      new THREE.Mesh(body, material),
      new THREE.Mesh(lamps, lampMaterial),
      new THREE.Mesh(decals, decalMaterial),
    );
    const flashers = LIGHTS.map(([geometry, ...at]) => {
      const core = new THREE.Mesh(geometry, off);
      core.position.set(...at);
      const glow = new THREE.Sprite(glowMaterial);
      glow.position.copy(core.position);
      glow.scale.setScalar(1.6); // metres across
      group.add(core, glow);
      return { core, glow };
    });
    // Front left, front right, back left, back right.
    const wheels = AXLES.flatMap((z, end) =>
      [1, -1].map((side) => {
        const wheel = new THREE.Mesh(tyres[end], material);
        wheel.position.set(side * (end ? 0.82 : 0.86), WHEEL, z);
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
      // The left lights flash twice, then the right ones, 0.6 s in all.
      const t = (seconds + late) % 0.6;
      const flash = t % 0.3 < 0.07 || (t % 0.3 > 0.12 && t % 0.3 < 0.19);
      flashers.forEach(({ core, glow }, k) => {
        glow.visible = flash && t < 0.3 === k < 2;
        core.material = glow.visible ? on : off;
      });
    }
    update(0, 0, null); // in place before the first frame

    return { group, material, update, half: SPEC.half, width: SPEC.width };
  }
}
