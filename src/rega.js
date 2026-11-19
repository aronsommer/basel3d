// The Rega's rescue helicopters in their colours (red, white below, a white-and-red chequered
// patch on each side, the registration on the tail boom, a Swiss cross on the fin,
// yellow blade tips), each on a square dark grey helipad with a white border and H: "h145", an H145 on skids with a
// ducted tail rotor and five blades, or "aw109", the AW109 "Da Vinci" on wheels with a pointed nose,
// a swept fin, a two-bladed tail rotor and four blades. Their lights: a red beacon on top flashing
// once a second, a white strobe at the tail flashing twice, red on the left, green on the right.
// Parked there, the rotors stand; flown (createFlight in src/main.js), they spin. They have no
// weapons.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part } from "./parts.js";

const RED = 0xd8231f;
const WHITE = 0xf2f2f0;
const DARK = 0x262a30;
const GLASS = 0x1c2a36;
const YELLOW = 0xf2c400;
const PAD = 6; // metres from its middle to each side
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// Along +z (the nose), narrower than high.
const hull = (g, wide = 0.85) => g.rotateX(Math.PI / 2).scale(wide, 1, 1);
// A part red with a white belly: each triangle white whose middle is below bottom (its own y),
// so the line between them is sharp.
function belly(geometry, bottom, at) {
  const g = part(geometry, RED, [0, 0, 0]);
  const { position, color } = g.attributes;
  const white = new THREE.Color(WHITE);
  for (let i = 0; i < position.count; i += 3)
    if (position.getY(i) + position.getY(i + 1) + position.getY(i + 2) < 3 * bottom)
      for (let k = i; k < i + 3; k++) white.toArray(color.array, 3 * k);
  return g.translate(...at);
}
// A rotor of blades metres long blades with yellow tips, turning about y.
const rotor = (blades, length) =>
  mergeGeometries(
    [...Array(blades)].flatMap((_, k) => {
      const angle = (k * 2 * Math.PI) / blades;
      return [
        part(
          box(length / 2, 0.06, 0.32)
            .translate(length / 4, 0, 0)
            .rotateY(angle),
          DARK,
          [0, 0, 0],
        ),
        part(
          box(0.6, 0.07, 0.33)
            .translate(length / 2 - 0.3, 0, 0)
            .rotateY(angle),
          YELLOW,
          [0, 0, 0],
        ),
      ];
    }),
  );
// A Swiss cross across a fin thick metres wide at [0, y, z].
const cross = (thick, y, z) => [
  part(box(thick, 0.45, 0.13), WHITE, [0, y, z]),
  part(box(thick, 0.13, 0.45), WHITE, [0, y, z]),
];
// Glass panes: quads between point(u, v) for consecutive us and vs, wound both ways, so they show
// from outside.
const OUT = 1.03; // panes this much further out than the surface they lie on
function panes(point, us, vs) {
  const corners = [];
  for (let i = 1; i < us.length; i++)
    for (let j = 1; j < vs.length; j++) {
      const [a, b, c, d] = [
        [us[i - 1], vs[j - 1]],
        [us[i], vs[j - 1]],
        [us[i], vs[j]],
        [us[i - 1], vs[j]],
      ].map(([u, v]) => point(u, v));
      corners.push(a, b, c, a, c, d, c, b, a, d, c, a);
    }
  const geometry = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(corners.flat(), 3),
  );
  return part(geometry, GLASS, [0, 0, 0]);
}
// The chequered patch on both sides, as part of a cross: three white cells h high and w long round
// height 0 and z, one above and one below in front, the middle one behind; all leaning back (SLANT
// metres per metre up). They lie on the body's sides, x metres out at height 0 and coming in by
// slope metres per metre up or down (the faces of its eight-sided hull).
const SLANT = 0.5;
const lean = new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, -SLANT, 1, 0, 0, 0, 0, 1);
const chequers = (x, slope, z, h, w) =>
  [-1, 1].flatMap((side) =>
    [
      [1, 0],
      [0, -1],
      [-1, 0],
    ].map(([row, column]) =>
      part(
        box(0.04, h, w)
          .applyMatrix4(lean)
          .rotateZ(side * row * Math.atan(slope)),
        WHITE,
        [side * (x + 0.02 - slope * h * Math.abs(row)), row * h, z + column * w - SLANT * row * h],
      ),
    ),
  );

// Each model: body, rotor (at top), its tail rotor (at back, turning about x, or none), floor
// (metres from its middle down to what it stands on), registration, where it is written ([x, y,
// z]) and its lights (beacon, strobe and the left one,
// mirrored for the right).
const MODELS = {
  h145: () => ({
    body: [
      belly(hull(new THREE.CylinderGeometry(1, 1, 4.2, 8)), -0.6, [0, 0, 0]),
      belly(new THREE.SphereGeometry(1, 8, 6).scale(0.85, 1, 1.3), -0.8, [0, 0, 2.1]), // nose
      // Its windscreen, on the upper front of the nose (SphereGeometry's faces: around by 45°,
      // down from the top by 30°).
      panes(
        (around, down) => [
          -0.85 * OUT * Math.cos(around) * Math.sin(down),
          OUT * Math.cos(down),
          2.1 + 1.3 * OUT * Math.sin(around) * Math.sin(down),
        ],
        [0, 1, 2, 3, 4].map((k) => (k * Math.PI) / 4),
        [1, 2, 3].map((k) => (k * Math.PI) / 6),
      ),
      part(box(1.72, 0.6, 1.6), GLASS, [0, 0.3, 0.9]), // side windows
      ...chequers(0.85, 0.354, -0.4, 0.42, 0.6),
      part(box(1.2, 0.6, 2.2), RED, [0, 1.15, -0.4]), // engines
      part(hull(new THREE.CylinderGeometry(0.45, 0.3, 5, 6)), RED, [0, 0.4, -4.5]), // tail boom
      part(
        new THREE.CylinderGeometry(0.75, 0.75, 0.3, 12).rotateZ(Math.PI / 2),
        RED,
        [0, 0.7, -7.4],
      ), // duct
      part(
        new THREE.CylinderGeometry(0.55, 0.55, 0.32, 10).rotateZ(Math.PI / 2),
        DARK,
        [0, 0.7, -7.4],
      ), // its rotor
      part(box(0.15, 1, 0.8), RED, [0, 1.6, -7.4]), // fin
      ...cross(0.17, 1.7, -7.45),
      part(box(2.2, 0.08, 0.5), RED, [0, 0.45, -6.3]), // stabiliser
      ...[-1, 1].map((side) => part(box(0.08, 0.6, 0.5), RED, [side * 1.1, 0.45, -6.3])), // its end plates
      ...[-1, 1].map((side) => part(box(0.1, 0.1, 3.4), DARK, [side, -1.55, 0.2])), // skids
      ...[-1, 1].flatMap((side) =>
        [-0.8, 1].map((z) =>
          part(box(0.1, 0.9, 0.1).rotateZ(side * 0.5), DARK, [side * 0.8, -1.1, z]),
        ),
      ), // struts
      part(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 5), DARK, [0, 1.6, -0.3]), // mast
    ],
    rotor: { geometry: rotor(5, 11), at: [0, 1.85, -0.3] },
    floor: 1.55,
    registration: "HB-TIB",
    lettering: [0.36, 0.42, -3.2],
    lights: { beacon: [0, 1.5, -1.3], strobe: [0, 2.15, -7.4], left: [1.16, 0.45, -6.3] },
  }),
  aw109: () => ({
    body: [
      belly(hull(new THREE.CylinderGeometry(0.8, 0.8, 4, 8), 0.8), -0.5, [0, 0, 0]),
      belly(hull(new THREE.ConeGeometry(0.8, 2.2, 8), 0.8), -0.4, [0, -0.1, 3.1]), // pointed nose
      // Its windscreen, on the cone's upper faces (around by 45°, the top at 180°) from its base
      // to past half way to its tip.
      panes(
        (around, along) => [
          0.64 * OUT * (1 - along) * Math.sin(around),
          -0.1 - 0.8 * OUT * (1 - along) * Math.cos(around),
          2 + 2.2 * along,
        ],
        [2, 3, 4, 5, 6].map((k) => (k * Math.PI) / 4),
        [0, 0.55],
      ),
      part(box(1.3, 0.5, 2.2), GLASS, [0, 0.25, 0.6]), // side windows
      ...chequers(0.64, 0.336, -0.9, 0.36, 0.55),
      part(box(1, 0.5, 2.4), RED, [0, 0.95, -0.4]), // engines
      part(hull(new THREE.CylinderGeometry(0.55, 0.25, 5.2, 6)), RED, [0, 0.3, -4.6]), // tail boom
      part(box(0.12, 1.6, 0.7).rotateX(-0.5), RED, [0, 1.15, -7.4]), // swept fin
      ...cross(0.14, 1.35, -7.55),
      part(box(0.1, 0.6, 0.5).rotateX(0.4), RED, [0, -0.1, -7.2]), // fin below
      part(box(2, 0.06, 0.45), RED, [0, 0.3, -6.2]), // stabiliser
      ...[
        [0, 2],
        [-0.45, -0.6],
        [0.45, -0.6],
      ].flatMap(([x, z]) => [
        part(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 10).rotateZ(Math.PI / 2), DARK, [
          x,
          -1,
          z,
        ]), // wheel
        part(box(0.08, 0.5, 0.08), DARK, [x, -0.65, z]), // its leg
      ]),
      part(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 5), DARK, [0, 1.35, -0.2]), // mast
    ],
    rotor: { geometry: rotor(4, 11), at: [0, 1.6, -0.2] },
    tail: {
      geometry: mergeGeometries(
        [-1, 1].flatMap((end) => [
          part(box(0.05, 0.18, 0.9), WHITE, [0, 0, end * 0.45]),
          part(box(0.06, 0.19, 0.2), YELLOW, [0, 0, end * 0.8]),
        ]),
      ), // level at rest
      at: [-0.15, 0.7, -7.2], // on the fin's left, below its cross
    },
    floor: 1.25,
    registration: "HB-ZRZ",
    lettering: [0.42, 0.3, -3.2],
    lights: { beacon: [0, 1.25, -1.4], strobe: [0, 1.95, -7.8], left: [1.03, 0.3, -6.2] },
  }),
};

// Letters in a colour on both sides, x metres out, wide metres wide, drawn here, so nothing is
// loaded.
function sign(text, color, wide, [x, y, z]) {
  const canvas = Object.assign(document.createElement("canvas"), { width: 256, height: 64 });
  const context = canvas.getContext("2d");
  context.font = "bold 52px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.fillText(text, 128, 34);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map, transparent: true });
  const plane = new THREE.PlaneGeometry(wide, wide / 4);
  return [-1, 1].map((side) => {
    const mesh = new THREE.Mesh(plane, material);
    mesh.position.set(side * x, y, z);
    mesh.rotation.y = (side * Math.PI) / 2; // facing out
    return mesh;
  });
}

// A light of this colour at [x, y, z], unlit, so it glows.
const lamp = new THREE.IcosahedronGeometry(0.15, 0);
function light(color, [x, y, z]) {
  const mesh = new THREE.Mesh(
    lamp,
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3) }),
  );
  mesh.position.set(x, y, z);
  return mesh;
}

// The model on its pad ({ x, y, z, heading }): { pad, group, material, update(seconds, flown),
// speed, turn, lift, unarmed } (speed, turn and lift as createFlight takes them); boost as for the
// vehicles.
export function createRega({ x, y, z, heading }, model, boost) {
  const pad = new THREE.Mesh(
    mergeGeometries([
      part(box(2 * PAD, 0.3, 2 * PAD), 0x4a4d52, [0, 0.15, 0]),
      ...[-1, 1].flatMap((side) => [
        part(box(2 * PAD, 0.02, 0.5), WHITE, [0, 0.31, side * (PAD - 0.25)]),
        part(box(0.5, 0.02, 2 * PAD), WHITE, [side * (PAD - 0.25), 0.31, 0]),
      ]), // white border
      ...[-1, 1].map((side) => part(box(0.7, 0.02, 4), WHITE, [side * 1.3, 0.31, 0])),
      part(box(1.9, 0.02, 0.7), WHITE, [0, 0.31, 0]), // the H, upright along its heading
    ]),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  pad.position.set(x, y, z);
  pad.rotation.y = heading;

  const { body, rotor, tail, floor, registration, lettering, lights } = MODELS[model]();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const group = new THREE.Group();
  group.rotation.order = "YXZ"; // heading first, then pitch and bank
  const spinning = [rotor, tail].filter(Boolean).map(({ geometry, at }) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.fromArray(at);
    return mesh;
  });
  const beacon = light(0xff2010, lights.beacon);
  const strobe = light(0xffffff, lights.strobe);
  const [lx, ly, lz] = lights.left;
  group.add(
    new THREE.Mesh(mergeGeometries(body), material),
    ...spinning,
    ...sign(registration, "#fff", 1.6, lettering),
    beacon,
    strobe,
    light(0xff2010, [lx, ly, lz]),
    light(0x20ff40, [-lx, ly, lz]),
  );
  const parked = new THREE.Vector3(x, y + 0.3 + floor, z);

  // Placed by flown while flown, else parked on its pad; its lights flashing.
  const update = (seconds, flown) => {
    if (flown) {
      group.position.set(flown.x, flown.y, flown.z);
      group.rotation.set(flown.nose, flown.heading, -0.3 * flown.turn * flown.speed);
      spinning[0].rotation.y = seconds * 25;
      if (spinning[1]) spinning[1].rotation.x = seconds * 40;
    } else {
      group.position.copy(parked);
      group.rotation.set(0, heading, 0);
    }
    group.scale.setScalar(boost(group.position));
    beacon.visible = seconds % 1 < 0.15;
    const t = seconds % 1.5;
    strobe.visible = t < 0.06 || (t > 0.18 && t < 0.24);
  };
  update(0, null);
  return { pad, group, material, update, speed: 50, turn: 1, lift: 30, unarmed: true };
}
