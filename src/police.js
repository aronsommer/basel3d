// Basel police vans, VW Transporters: white, with a fluorescent orange band and row of blocks along
// each side (POLIZEI in white on the band), POLIZEI in black on the bonnet and the back and a light
// bar whose blue lights flash in turn; or unmarked (place.unmarked): grey, with one blue beacon on
// the roof. Driven as in src/drive.js.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { glow, part, profile } from "./parts.js";
import { createDriving } from "./drive.js";

const WIDTH = 1.9; // metres
const AXLES = 3; // metres between them
const WHEEL = 0.36; // radius in metres
const ARCH = 0.41; // radius in metres of the wheel arches, around the axles 0.33 m up
const BELT = 1.27; // metres up the windows' foot
const ROOF = 1.98; // metres up
const SPEC = {
  max: 35,
  back: 8,
  accelerate: 16,
  brake: 50,
  roll: 5,
  steer: 0.7,
  grip: 350,
  spin: 0,
  react: 10,
  axles: AXLES,
  half: 2.45,
  width: WIDTH,
};
const FRONT = 2.45; // metres from the middle to the front
const SIDE = 4.75; // metres the side markings are long, from the front
const K = 1024 / SIDE; // their canvas pixels per metre

// Above the belt, narrowed to 0.86 of the width at the roof, as the windows lean in.
function lean(geometry) {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y > BELT) position.setX(i, position.getX(i) * (1 - (0.14 * (y - BELT)) / (ROOF - BELT)));
  }
  return geometry;
}

// One van per place ({ x, y, z, heading, unmarked }), each { group, material, update, half }; they
// share their geometries and all materials but the body's (so one is highlighted alone).
// boost(position): how much larger to draw one far away; world: as for createDriving
// (src/drive.js).
export function createPolice(places, boost, world) {
  const WHITE = 0xf4f6f8;
  const GREY = 0x55585d;
  const ORANGE = "#ff3a12";
  const GLASS = 0x141a22;
  const DARK = 0x24272c;
  // A wheel arch around the axle at z.
  const arch = (z) =>
    Array.from({ length: 7 }, (_, k) => [
      z - ARCH * Math.cos((k * Math.PI) / 6),
      0.33 + ARCH * Math.sin((k * Math.PI) / 6),
    ]);
  // Measured on a side photo of a T6.1: under the belt, and over it.
  const lower = [
    [-2.44, 0.33],
    ...arch(-AXLES / 2),
    ...arch(AXLES / 2),
    [2.42, 0.33],
    [2.45, 0.81],
    [2.33, 1.08], // bonnet's front
    [1.9, BELT],
    [-2.43, BELT],
  ];
  const upper = [
    [-2.43, BELT],
    [1.9, BELT],
    [1.58, 1.41], // windscreen's foot
    [0.98, 1.92],
    [0.75, ROOF],
    [-2.25, ROOF],
    [-2.36, 1.92],
    [-2.41, 1.75],
  ];
  // Side windows, each a slab a little wider than the van, so it shows on both sides; and the back
  // window, on the tailgate.
  const windows = [
    [
      [0.25, BELT],
      [1.45, BELT],
      [0.93, 1.88],
      [0.25, 1.88],
    ],
    [
      [-2.28, BELT],
      [0.12, BELT],
      [0.12, 1.88],
      [-2.2, 1.88],
    ],
  ];
  const back = [
    [-2.437, 1.22],
    [-2.427, 1.75],
    [-2.39, 1.86],
    [-2.37, 1.86],
    [-2.41, 1.75],
    [-2.42, 1.22],
  ];
  const screen = Math.atan2(0.51, 0.6); // the windscreen's slope
  const shell = (color, roof) =>
    mergeGeometries([
      part(profile(lower, WIDTH), color, [0, 0, 0]),
      lean(part(profile(upper, WIDTH), color, [0, 0, 0])),
      ...windows.map((points) => lean(part(profile(points, WIDTH + 0.02), GLASS, [0, 0, 0]))),
      lean(part(profile(back, 1.45), GLASS, [0, 0, 0])),
      lean(part(new THREE.BoxGeometry(1.66, 0.02, 0.72).rotateX(screen), GLASS, [0, 1.67, 1.285])),
      // Black from the bumper up to the bonnet, across the front (inside the sides, so the
      // markings show there), the headlights in it.
      part(new THREE.BoxGeometry(1.88, 0.48, 0.08), DARK, [0, 0.57, 2.43]),
      part(
        profile(
          [
            [2.4, 0.79],
            [2.465, 0.79],
            [2.37, 1.005],
            [2.33, 1.005],
          ],
          1.88,
        ),
        DARK,
        [0, 0, 0],
      ),
      part(new THREE.BoxGeometry(1.92, 0.2, 0.1), DARK, [0, 0.43, -2.42]), // back bumper
      ...[-1, 1].map((side) =>
        part(new THREE.BoxGeometry(0.2, 0.15, 0.08), DARK, [side * 1.03, 1.35, 1.45]),
      ), // mirrors
      ...roof,
    ]);
  const marked = shell(WHITE, [
    part(new THREE.BoxGeometry(1.84, 0.06, 0.04), ORANGE, [0, 1.04, 2.35]), // under the bonnet
    part(new THREE.BoxGeometry(1.56, 0.06, 0.3), DARK, [0, ROOF + 0.03, 0.35]), // light bar
  ]);
  const unmarked = shell(GREY, []);
  // Head and tail lights, unlit so they glow.
  const lamps = mergeGeometries(
    [-1, 1].flatMap((side) => [
      part(new THREE.BoxGeometry(0.46, 0.11, 0.04), 0xffffff, [side * 0.64, 0.9, 2.42]),
      part(new THREE.BoxGeometry(0.12, 0.4, 0.04), 0xff1a1a, [side * 0.85, 1.05, -2.445]),
    ]),
  );
  const lampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  // The markings, drawn here, so nothing is loaded: the left side (front at the left), the right
  // side (front at the right), each ROWS pixels high, then POLIZEI for the bonnet and the back, 64
  // high. Measured on a photo of one: a long band with POLIZEI on the front door, then two
  // short ones, and over the long one 6 blocks, evenly spaced, rising to the back, their ends
  // leaning back, cut out over the wheel arches.
  const ROWS = 128;
  const TOP = 1.16; // metres up the side markings' top
  const canvas = Object.assign(document.createElement("canvas"), {
    width: 1024,
    height: 2 * ROWS + 64,
  });
  const brush = canvas.getContext("2d");
  // Every POLIZEI alike: bold, its capitals 0.19 m high, at most 1.1 m long.
  const SIZE = 0.27; // metres, the font's
  brush.font = `bold ${SIZE * K}px sans-serif`;
  brush.textAlign = "center";
  [false, true].forEach((flip, k) => {
    // The pixel s metres from the front and h metres up the band's foot (0.63 m up at the front).
    const x = (s) => (flip ? SIDE - s : s) * K;
    const at = (s, h) => [x(s), (TOP - 0.63 - (0.11 * s) / SIDE - h) * K + ROWS * k];
    const quad = ([s0, s1], h0, h1) => {
      const slant = 0.3 * (h1 - h0);
      brush.beginPath();
      for (const [s, h] of [
        [s0, h0],
        [s1, h0],
        [s1 + slant, h1],
        [s0 + slant, h1],
      ])
        brush.lineTo(...at(s, h));
      brush.fill();
    };
    brush.save();
    brush.beginPath();
    brush.rect(0, ROWS * k, canvas.width, ROWS);
    brush.clip();
    brush.fillStyle = ORANGE;
    for (const run of [
      [0.015, 3.48],
      [3.55, 4.065],
      [4.135, 4.65],
    ])
      quad(run, 0, 0.26);
    for (let n = 0; n < 6; n++) quad([0.05 + 0.5965 * n, 0.4974 + 0.5965 * n], 0.3, 0.405);
    brush.globalCompositeOperation = "destination-out";
    for (const z of [-AXLES / 2, AXLES / 2]) {
      brush.beginPath();
      brush.arc(x(FRONT - z), (TOP - 0.33) * K + ROWS * k, (ARCH + 0.02) * K, 0, 2 * Math.PI);
      brush.fill();
    }
    brush.restore();
    brush.fillStyle = "#fff";
    brush.fillText("POLIZEI", ...at(1.76, (0.26 - 0.72 * SIZE) / 2), 1.1 * K);
  });
  brush.fillStyle = "#000";
  brush.fillText("POLIZEI", 512, 2 * ROWS + 32 + 0.36 * SIZE * K, 1.1 * K);
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
  // POLIZEI in black, 1.2 m long, at the side markings' scale.
  const word = () =>
    decal(1.2, 64 / K, 0.5 - (0.6 * K) / 1024, 0.5 + (0.6 * K) / 1024, 0, 1 - 2 * row);
  const bonnet = Math.atan2(0.33, 0.75); // its slope
  const decals = mergeGeometries([
    decal(SIDE, height, 0, 1, 1 - row, 1)
      .rotateY(Math.PI / 2)
      .translate(WIDTH / 2 + 0.005, TOP - height / 2, FRONT - SIDE / 2),
    decal(SIDE, height, 0, 1, 1 - 2 * row, 1 - row)
      .rotateY(-Math.PI / 2)
      .translate(-WIDTH / 2 - 0.005, TOP - height / 2, FRONT - SIDE / 2),
    word()
      .rotateX(bonnet - Math.PI / 2)
      .translate(0, 1.25, 1.96),
    word().rotateY(Math.PI).translate(0, 0.85, -2.45),
  ]);
  const decalMaterial = new THREE.MeshLambertMaterial({ map: markings, alphaTest: 0.5 });
  // The flashing lights, lit: a bright core in a blue glow added onto what is behind it; else blue
  // as their covers.
  const on = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3060ff).multiplyScalar(3) });
  const off = new THREE.MeshBasicMaterial({ color: 0x1a3a8a });
  const lens = new THREE.BoxGeometry(0.76, 0.1, 0.26);
  const beacon = new THREE.CylinderGeometry(0.08, 0.1, 0.14, 8);
  const glowMaterial = glow(0x1848ff);
  const tyre = mergeGeometries([
    part(new THREE.CylinderGeometry(WHEEL, WHEEL, 0.22, 10).rotateZ(Math.PI / 2), DARK, [0, 0, 0]),
    part(
      new THREE.CylinderGeometry(0.22, 0.22, 0.23, 10).rotateZ(Math.PI / 2),
      0xb8bcc2,
      [0, 0, 0],
    ),
  ]);
  // Each van's lights flash this many seconds later than the one before, so they do not flash
  // together.
  return places.map((place, k) => createCar(place, k * 0.23));

  function createCar(place, late) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const group = new THREE.Group();
    group.rotation.order = "YXZ"; // heading first, then pitch
    group.add(
      new THREE.Mesh(place.unmarked ? unmarked : marked, material),
      new THREE.Mesh(lamps, lampMaterial),
    );
    if (!place.unmarked) group.add(new THREE.Mesh(decals, decalMaterial));
    // Across the light bar, its two halves; or one beacon over the driver.
    const flashers = (
      place.unmarked
        ? [[0.45, ROOF + 0.07, 0.5]]
        : [-1, 1].map((side) => [side * 0.39, ROOF + 0.11, 0.35])
    ).map((at) => {
      const core = new THREE.Mesh(place.unmarked ? beacon : lens, off);
      core.position.set(...at);
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
        wheel.position.set(side * 0.87, WHEEL, (end * AXLES) / 2); // a little out of the body
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
      // Each light flashes twice, then the other (a beacon alone flashes twice and waits), 0.6 s
      // in all.
      const t = (seconds + late) % 0.6;
      const flash = t % 0.3 < 0.07 || (t % 0.3 > 0.12 && t % 0.3 < 0.19);
      flashers.forEach(({ core, glow }, k) => {
        glow.visible = flash && t < 0.3 === (k === 0);
        core.material = glow.visible ? on : off;
      });
    }
    update(0, 0, null); // in place before the first frame

    return { group, material, update, half: SPEC.half };
  }
}
