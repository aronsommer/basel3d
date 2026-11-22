// Basel SBB's main front as on photos of it, laid onto the model's plain one: the hall's glazed arch
// in its green band with the Swiss shield on top instead of the model's low gable, the rusticated
// towers with an arched window over each entrance and a clock above, the part between them with
// its arched windows and balustrade, the green canopy all along, and a flag on each dome. Measured
// on the model (public/basel.glb); drawn here, so nothing is loaded.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { baselstab } from "./baselstab.js";

// Places on the front as [along, out]: metres along it (east-south-east) and out from it
// (north-north-east), the scene's x and z turned by ANGLE.
const ANGLE = 0.52315; // radians, 29.97°
const at = ([along, out]) => [
  along * Math.cos(ANGLE) + out * Math.sin(ANGLE),
  along * Math.sin(ANGLE) - out * Math.cos(ANGLE),
];
const GROUND = 28.3; // scene y of the square before it
// Each wall's bottom corners as seen from the front, left then right.
const TOWERS = [
  [
    [843.85, -724.52],
    [832.69, -724.6],
  ],
  [
    [885.0, -724.21],
    [873.7, -724.26],
  ],
];
const TOWER_TOP = 45.1;
const MIDDLE = [
  [873.68, -725.56],
  [843.84, -725.9],
];
const MIDDLE_TOP = 40; // where the gable starts, which the arch covers
const GABLE = [
  [873.68, -731.43],
  [843.85, -731.55],
];
const CLOCK = { up: 14.5, radius: 1.25 }; // metres above the ground, the dial's
// The domes' tops: the Swiss flag on the east tower's, Basel's on the west tower's.
const DOMES = [
  [879.5, -728.3],
  [838.38, -728.47],
];
const DOME_TOP = 52.3;

// The pictures on one canvas, K pixels a metre, each [x, y, width, height] in pixels: the left
// halves (as seen from the front) of the arch, the middle and a tower, mirrored for their right
// halves, then the SBB's logo, and white for the canopy's vertex colour.
const K = 24;
const [W, H] = [1024, 512];
const ARCH = [0, 0, 358, 365]; // 15.2 m high from MIDDLE_TOP
const PART = [362, 0, 358, 310]; // 12.9 m high from GROUND, its balustrade above MIDDLE_TOP
const TOWER = [724, 0, 134, 403]; // 16.8 m high from GROUND
const SIGN = [0, 370, 512, 56]; // SIGN_HIGH metres high, finer
const SIGN_HIGH = 0.6; // on each tower's window, its middle 5.95 m above the ground
const WHITE = [1016, 504, 8, 8];
const STONE = "#ded3bd"; // the walls' colour in the model
const LIGHT = "#ece4d2"; // surrounds, cornices
const JOINT = "#c7bba2";
const GREEN = "#5e8b74"; // copper
const GLASS = "#37444a";
const BAR = "#a3c0ad"; // the glazing's bars

const TEXTURE = (() => {
  const canvas = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const brush = canvas.getContext("2d");
  // Draws in region [x, y, w, h] in metres from its bottom left.
  const region = ([x, y, w, h], draw) => {
    brush.save();
    brush.beginPath();
    brush.rect(x, y, w, h);
    brush.clip();
    brush.setTransform(K, 0, 0, -K, x, y + h); // metres, y up
    draw();
    brush.restore();
  };
  const fill = (colour, path) => {
    brush.fillStyle = colour;
    brush.beginPath();
    path();
    brush.fill();
  };
  const line = (colour, width, path) => {
    brush.strokeStyle = colour;
    brush.lineWidth = width;
    brush.beginPath();
    path();
    brush.stroke();
  };
  const rect = (u0, h0, u1, h1) => brush.rect(u0, h0, u1 - u0, h1 - h0);
  // The upper half of an ellipse around u, h, as a closed shape.
  const dome = (u, h, rx, ry) => brush.ellipse(u, h, rx, ry, 0, 0, Math.PI);
  // A window from u0 to u1 and h0 to h1, round-headed if arched (its top then h1 + half its width).
  const opening = (u0, h0, u1, h1, arched) => {
    rect(u0, h0, u1, h1);
    if (arched) dome((u0 + u1) / 2, h1, (u1 - u0) / 2, (u1 - u0) / 2);
  };
  // Mortar joints from h0 to h1 between u0 and u1, courses of 0.6 m, offset every other one.
  const rustication = (u0, u1, h0, h1) =>
    line(JOINT, 0.06, () => {
      for (let h = h0, row = 0; h < h1; h += 0.6, row++) {
        brush.moveTo(u0, h);
        brush.lineTo(u1, h);
        for (let u = u0 + (row % 2) * 0.75; u < u1; u += 1.5) {
          brush.moveTo(u, h);
          brush.lineTo(u, Math.min(h + 0.6, h1));
        }
      }
    });

  region(ARCH, () => {
    const c = 14.92; // the middle
    fill(GREEN, () => dome(c, 0, 14.92, 13.9));
    fill(GLASS, () => dome(c, 0, 13.9, 12.9));
    brush.save();
    brush.clip();
    // Bars every 1.16 m, every third stronger, and between them a round arch every 1.45 m up.
    for (let k = 0; k <= 12; k++) {
      const u = c - k * 1.16;
      line(BAR, k % 3 ? 0.08 : 0.16, () => {
        brush.moveTo(u, 0);
        brush.lineTo(u, 13);
        for (let h = 0; h < 13; h += 1.45) {
          brush.moveTo(u, h);
          dome(u - 0.58, h, 0.58, 0.95);
        }
      });
    }
    brush.restore();
    line("#7fa892", 0.1, () => {
      dome(c, 0, 14.85, 13.83);
      brush.moveTo(c + 13.9, 0);
      dome(c, 0, 13.9, 12.9);
    });
    // The shield in a stone cartouche, under a green crest.
    fill(GREEN, () => {
      brush.moveTo(c - 0.7, 14.4);
      brush.lineTo(c, 15.15);
      brush.lineTo(c + 0.7, 14.4);
    });
    fill(LIGHT, () => brush.ellipse(c, 13.55, 1.45, 1.2, 0, 0, 2 * Math.PI));
    fill("#d52b1e", () => {
      brush.moveTo(c - 0.85, 14.4);
      brush.lineTo(c + 0.85, 14.4);
      brush.lineTo(c + 0.85, 13.3);
      brush.quadraticCurveTo(c + 0.85, 12.75, c, 12.55);
      brush.quadraticCurveTo(c - 0.85, 12.75, c - 0.85, 13.3);
    });
    fill("#fff", () => {
      rect(c - 0.18, 12.95, c + 0.18, 14.05);
      rect(c - 0.55, 13.32, c + 0.55, 13.68);
    });
  });

  region(PART, () => {
    const c = 14.92;
    fill(STONE, () => rect(0, 0, c, 11.7));
    rustication(0, c, 0, 5);
    fill(LIGHT, () => {
      rect(0, 5, c, 5.25); // string course
      rect(0, 11.1, c, 11.7); // cornice
    });
    line("#b9ad94", 0.06, () => {
      brush.moveTo(0, 11.05);
      brush.lineTo(c, 11.05);
    });
    // Bays as on the photos: narrow, arched, narrow, arched (the middle one) from the tower on.
    for (const [u, half, arched] of [
      [1.78, 0.75, false],
      [6.1, 1.625, true],
      [10.4, 0.75, false],
      [c, 1.625, true],
    ]) {
      const top = arched ? 8.1 : 8.6;
      fill(LIGHT, () => opening(u - half - 0.3, 5.3, u + half + 0.3, top, arched));
      if (arched) fill(LIGHT, () => rect(u - 0.3, top + half - 0.1, u + 0.3, top + half + 0.55));
      for (const [h0, h1, round] of [
        [5.6, top, arched],
        [0.9, 4.1, false],
      ]) {
        fill("#6e3a2b", () => opening(u - half, h0, u + half, h1, round));
        fill(GLASS, () => opening(u - half + 0.12, h0 + 0.12, u + half - 0.12, h1, round));
        line("#6e3a2b", 0.1, () => {
          brush.moveTo(u, h0);
          brush.lineTo(u, h1 + (round ? half : 0));
          brush.moveTo(u - half, h0 + 0.68 * (h1 - h0));
          brush.lineTo(u + half, h0 + 0.68 * (h1 - h0));
        });
      }
    }
    // The balustrade on the cornice: rails, balusters, and piers.
    fill(LIGHT, () => {
      rect(0, 11.7, c, 11.9);
      rect(0, 12.72, c, 12.9);
      for (let u = 0.2; u < c; u += 0.38) rect(u, 11.9, u + 0.16, 12.72);
      for (const u of [0, 4.1, 8.3, 12.5]) rect(u, 11.7, u + 0.55, 12.9);
    });
  });

  region(TOWER, () => {
    const c = 5.58;
    fill(STONE, () => rect(0, 0, c, 16.8));
    rustication(0, c, 0, 16.2);
    fill(LIGHT, () => rect(0, 16.25, c, 16.8)); // cornice
    // The entrance: a door under the canopy, the arched window above it, with sill and keystone.
    fill(LIGHT, () => rect(c - 2.65, 0, c, 4.1));
    fill("#4b3527", () => rect(c - 2.4, 0, c, 3.9));
    fill("#2f3539", () => rect(c - 2.1, 2.5, c - 0.25, 3.6));
    line("#3a281c", 0.06, () => {
      brush.moveTo(c - 1.2, 0);
      brush.lineTo(c - 1.2, 3.9);
    });
    fill(LIGHT, () => {
      opening(c - 3.55, 5.3, c + 3.55, 9, true);
      rect(c - 3.8, 5.05, c, 5.3);
      rect(c - 0.4, 11.85, c, 12.85);
    });
    fill(GLASS, () => opening(c - 3.1, 5.3, c + 3.1, 9, true));
    line(BAR, 0.08, () => {
      for (const u of [0, 0.78, 1.56, 2.34]) {
        brush.moveTo(c - u, 5.3);
        brush.lineTo(c - u, 9 + Math.sqrt(3.1 ** 2 - u ** 2));
      }
      for (const h of [6.5, 7.75, 9]) {
        brush.moveTo(c - 3.1, h);
        brush.lineTo(c, h);
      }
      brush.moveTo(c - 1.6, 9);
      brush.arc(c, 9, 1.6, Math.PI, Math.PI / 2, true);
    });
    // The clock's round stone frame.
    fill(LIGHT, () => brush.arc(c, CLOCK.up, 1.55, 0, 2 * Math.PI));
    line(JOINT, 0.06, () => brush.arc(c, CLOCK.up, 1.5, 0, 2 * Math.PI));
  });

  // The SBB's logo as in its SVG, 41.2 units high: the red field with the white arrows and bar,
  // then SBB CFF FFS in black, here on white.
  const unit = SIGN[3] / 41.2; // pixels
  brush.setTransform(unit, 0, 0, unit, SIGN[0], SIGN[1]);
  brush.fillStyle = "#fff";
  brush.fillRect(118, 0, SIGN[2] / unit - 118, 41.2);
  brush.fillStyle = "#eb0000";
  brush.fillRect(0, 0, 118.5, 41.2);
  brush.fillStyle = "#fff";
  brush.fill(
    new Path2D(
      "M70.4 34 77.9 34 67.8 23.7 80.3 23.7 80.3 34 86.2 34 86.2 23.7 98.8 23.7 88.7 34 96.2 34 " +
        "109 20.6 96.2 7.2 88.7 7.2 98.8 17.5 86.2 17.5 86.2 7.2 80.3 7.2 80.3 17.5 67.8 17.5 " +
        "77.9 7.2 70.4 7.2 57.5 20.6Z",
    ),
  );
  brush.fillStyle = "#000";
  brush.font = "bold 42.5px Helvetica, Arial, sans-serif"; // capitals 30.5 units high
  for (const [word, x0, x1] of [
    ["SBB", 129.6, 206.9],
    ["CFF", 217.2, 289.3],
    ["FFS", 303, 373.4],
  ])
    brush.fillText(word, x0, 37, x1 - x0);
  brush.setTransform(1, 0, 0, 1, 0, 0);
  brush.fillStyle = "#fff";
  brush.fillRect(...WHITE);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8; // sharp when seen at a slant
  return texture;
})();

// The u0, u1, v0, v1 of a region of the canvas.
const uvs = ([x, y, w, h]) => [x / W, (x + w) / W, 1 - (y + h) / H, 1 - y / H];
const white = (g) =>
  g.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(Array(3 * g.attributes.position.count).fill(1), 3),
  );
// A plane width × height facing +z, showing u0 to u1 and v0 to v1.
function plane(width, height, [u0, u1, v0, v1]) {
  const g = new THREE.PlaneGeometry(width, height);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return white(g);
}
// A wall's middle, its width and the heading it faces, out metres before it.
function wall([left, right], out) {
  const [l, r] = [at(left), at(right)];
  const [dx, dz] = [r[0] - l[0], r[1] - l[1]];
  const width = Math.hypot(dx, dz);
  const [nx, nz] = [-dz / width, dx / width]; // outwards
  return {
    x: (l[0] + r[0]) / 2 + out * nx,
    z: (l[1] + r[1]) / 2 + out * nz,
    width,
    heading: Math.atan2(nx, nz),
  };
}
// A picture of region on a wall from y0 to y1: its left half as drawn, its right half mirrored.
function picture(corners, y0, y1, region) {
  const { x, z, width, heading } = wall(corners, 0.1);
  const [u0, u1, v0, v1] = uvs(region);
  return [
    plane(width / 2, y1 - y0, [u0, u1, v0, v1]).translate(-width / 4, 0, 0),
    plane(width / 2, y1 - y0, [u1, u0, v0, v1]).translate(width / 4, 0, 0),
  ].map((g) => g.rotateY(heading).translate(x, (y0 + y1) / 2, z));
}
// A geometry in one colour (the canvas's white under its vertex colour).
function solid(g, colour) {
  const [u0, u1, v0, v1] = uvs(WHITE);
  const { uv, position } = g.attributes;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (u0 + u1) / 2, (v0 + v1) / 2);
  const rgb = new THREE.Color(colour).toArray();
  return g.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(Array(position.count).fill(rgb).flat(), 3),
  );
}
// A green box: size along the front, up and out; its middle at along, y, out.
function box([length, height, depth], [along, y, out], tilt = 0) {
  const [x, z] = at([along, out]);
  return solid(new THREE.BoxGeometry(length, height, depth).rotateX(tilt), GREEN)
    .rotateY(Math.PI - ANGLE)
    .translate(x, y, z);
}
// A flag on a pole standing on a dome's top, its square cloth to the right of the pole as seen
// from the front: Switzerland's, or Basel's (white with the black Baselstab, its hook towards the
// pole, mirrored on the back as through the cloth).
function flag([along, out], swiss) {
  const [pole, side] = [6.5, 2.4]; // metres
  const [x, z] = at([along, out]);
  const middle = (g) => g.translate(side / 2 + 0.06, pole - side / 2 - 0.1, 0);
  return [
    solid(new THREE.BoxGeometry(0.12, pole, 0.12).translate(0, pole / 2, 0), "#e8e8e8"),
    middle(solid(new THREE.BoxGeometry(side, side, 0.03), swiss ? "#d52b1e" : "#fff")),
    ...(swiss
      ? [
          [0.1875, 0.625],
          [0.625, 0.1875],
        ].map(([w, h]) => middle(solid(new THREE.BoxGeometry(w * side, h * side, 0.04), "#fff")))
      : [0, Math.PI].map((turn) =>
          middle(
            solid(baselstab(0.8 * side), "#111")
              .translate(0, -0.4 * side, 0.02)
              .rotateY(turn),
          ),
        )),
  ].map((g) => g.rotateY(Math.PI - ANGLE).translate(x, DOME_TOP, z));
}

// The front, one mesh, and its clocks for src/clocks.js.
export function createStation() {
  const sign = (corners) => {
    const { x, z, heading } = wall(corners, 0.13);
    return plane((SIGN_HIGH * SIGN[2]) / SIGN[3], SIGN_HIGH, uvs(SIGN))
      .rotateY(heading)
      .translate(x, GROUND + 5.95, z);
  };
  // The canopy from tower to tower at 4.6 m, brackets every 4.36 m reaching 2 m out from the
  // walls, but before the doors.
  const [first, last] = [TOWERS[0][1][0], TOWERS[1][0][0]];
  const doors = TOWERS.map(([left, right]) => (left[0] + right[0]) / 2);
  const brackets = Array.from({ length: 12 }, (_, k) => first + 2.2 + k * 4.36)
    .filter((along) => doors.every((door) => Math.abs(along - door) > 2.8))
    .map((along) => {
      const inTower = along < MIDDLE[1][0] || along > MIDDLE[0][0];
      const out = (inTower ? -724.5 : -725.7) + 1;
      return box([0.1, 0.1, 2.19], [along, GROUND + 4.15, out], -Math.atan2(0.9, 2));
    });
  const geometry = mergeGeometries([
    ...picture(GABLE, MIDDLE_TOP, MIDDLE_TOP + ARCH[3] / K, ARCH),
    ...picture(MIDDLE, GROUND, GROUND + PART[3] / K, PART),
    ...TOWERS.flatMap((corners) => [...picture(corners, GROUND, TOWER_TOP, TOWER), sign(corners)]),
    box([last - first, 0.35, 4.3], [(first + last) / 2, GROUND + 4.78, -723.55]),
    ...brackets,
    ...DOMES.flatMap((dome, k) => flag(dome, k === 0)),
  ]);
  const material = new THREE.MeshLambertMaterial({
    map: TEXTURE,
    vertexColors: true,
    alphaTest: 0.5,
    // Before the walls they lie on, also far away.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  const clocks = TOWERS.map((corners) => {
    const { x, z, heading } = wall(corners, 0.2);
    return { x, y: GROUND + CLOCK.up, z, heading, radius: CLOCK.radius };
  });
  return { mesh: new THREE.Mesh(geometry, material), clocks };
}
