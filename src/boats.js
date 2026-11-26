// Boats on the Rhine, driven as in src/drive.js on the water only, rocking a little on the waves,
// with their sides painted and blue lights flashing (KINDS):
// - fire: Basel's fireboat, a red hull with a dark band at the waterline, a white deckhouse with a
//   band of windows under a red roof, a wheelhouse above it, red water monitors fore, aft and on
//   top and a mast with a blue light;
// - police: Basel's very fast police boat, a blue hull with a white-and-blue chequered band, a
//   white stripe at the waterline and POLIZEI, a white cabin with a band of windows, two blue
//   lights on its roof and railings fore and aft.
// Moving ahead, a boat draws a wake of foam behind it, longer and stronger the faster it goes.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { glow, part, profile } from "./parts.js";
import { createDriving } from "./drive.js";

const RED = 0xd8231f;
const WHITE = 0xf2f2f0;
const DARK = 0x262a30;
const GLASS = 0x1c2a36;
const BLUE = 0x1f4fb8;
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const WAKE = 1.2; // seconds of travel its wake reaches back
const STRONG = 10; // metres per second from which it is fully seen
// Drawn here, so nothing is loaded: the wake's foam, white flecks on a light veil (scrolled back
// as a boat moves, so they stay on the water) under its fade (fixed): strong at the stern and its
// edges, gone at its end.
const FOAM = (() => {
  const canvas = Object.assign(document.createElement("canvas"), { width: 64, height: 128 });
  const brush = canvas.getContext("2d");
  brush.fillStyle = "rgba(255, 255, 255, 0.35)";
  brush.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 160; i++) {
    brush.fillStyle = `rgba(255, 255, 255, ${0.5 + Math.random() / 2})`;
    brush.beginPath();
    brush.ellipse(
      Math.random() * 64,
      Math.random() * 128,
      1 + Math.random() * 3,
      2 + Math.random() * 5,
      0,
      0,
      2 * Math.PI,
    );
    brush.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 3);
  return texture;
})();
const FADE = (() => {
  const canvas = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
  const brush = canvas.getContext("2d");
  const along = brush.createLinearGradient(0, 64, 0, 0); // the stern at the bottom (v = 0)
  along.addColorStop(0, "#fff");
  along.addColorStop(1, "#000");
  brush.fillStyle = along;
  brush.fillRect(0, 0, 64, 64);
  const across = brush.createLinearGradient(0, 0, 64, 0);
  across.addColorStop(0, "#fff");
  across.addColorStop(0.5, "#888");
  across.addColorStop(1, "#fff");
  brush.globalCompositeOperation = "multiply";
  brush.fillStyle = across;
  brush.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
})();
// A boat's wake, width metres wide at its stern (also src/m41.js): mesh, to set at its stern, just
// over the water (so it hides none of the hull above), drawn as if nearer, so the water never
// shows through; from there back 1 m, three times as wide, stretched by update(seconds, speed) to
// WAKE seconds of travel and faded in up to STRONG.
export function createWake(width) {
  const mesh = new THREE.Mesh(
    new THREE.BufferGeometry()
      .setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [-width / 2, 0, 0, width / 2, 0, 0, -1.5 * width, 0, -1, 1.5 * width, 0, -1],
          3,
        ),
      )
      .setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2))
      .setIndex([0, 1, 2, 1, 3, 2]),
    new THREE.MeshBasicMaterial({
      map: FOAM,
      alphaMap: FADE,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  );
  mesh.position.y = 0.03;
  function update(seconds, speed) {
    mesh.visible = speed > 0.5;
    mesh.scale.z = speed * WAKE;
    mesh.material.opacity = Math.min(1, speed / STRONG);
    FOAM.offset.y = (-seconds * FOAM.repeat.y) / WAKE; // as fast back as the boat goes on
  }
  return { mesh, update };
}

// A hull's two side profiles ([z, y], bow ahead), below and above its band, as parts across width.
const hull = (width, [below, above], [low, high]) => [
  part(profile(below, width), low, [0, 0, 0]),
  part(profile(above, width), high, [0, 0, 0]),
];

// Per kind: its driving (src/drive.js), its parts, its sides (a picture metres long and high at y,
// z, painted on a canvas 96 px high by paint(brush, px wide)) and its blue lights ([x, y, z] each),
// flashing each in turn.
const KINDS = {
  fire: {
    spec: { max: 28, back: 6, accelerate: 8, brake: 10, roll: 1, steer: 0.6, grip: 400 },
    width: 4.6,
    half: 9.5,
    axles: 8,
    parts: () => [
      // Dark up to y = 0.1, just above the waterline (y = 0), red above.
      ...hull(
        4.6,
        [
          [
            [-9.3, -0.6],
            [7.2, -0.6],
            [7.97, 0.1],
            [-9.37, 0.1],
          ],
          [
            [-9.37, 0.1],
            [7.97, 0.1],
            [9.5, 1.5],
            [-9.5, 1.3],
          ],
        ],
        [DARK, RED],
      ),
      // The deck on the hull's top, rising with it from 1.3 m at the stern to 1.5 m at the bow,
      // 0.2 m short of either end.
      part(box(4.3, 0.06, 18.6).rotateX(-Math.atan2(0.2, 19)), WHITE, [0, 1.43, 0]),
      part(box(3.6, 2, 9), WHITE, [0, 2.4, -0.5]), // deckhouse
      part(box(3.62, 0.5, 8.6), GLASS, [0, 2.75, -0.5]), // its windows, out a little
      part(box(3.8, 0.15, 9.4), RED, [0, 3.45, -0.5]), // its roof
      part(box(3.5, 1.2, 2.6), RED, [0, 2, 5.2]), // fore deckhouse, narrower than the deckhouse
      part(box(2.8, 1.4, 2.6), WHITE, [0, 4.2, 1.6]), // wheelhouse
      part(box(2.82, 0.45, 2.62), GLASS, [0, 4.4, 1.6]), // its windows, all round
      part(box(3, 0.12, 2.9), RED, [0, 4.95, 1.6]), // its roof
      part(box(0.12, 2.4, 0.12), WHITE, [0, 6.2, 0.4]), // mast
      // Monitors on the fore deckhouse, the wheelhouse and aft, each a post and a barrel ahead.
      ...[
        [0, 2.6, 5.2],
        [0.6, 5, 1.2],
        [0, 3.5, -4.2],
      ].flatMap(([x, y, z]) => [
        part(new THREE.CylinderGeometry(0.12, 0.15, 0.6, 6), RED, [x, y + 0.3, z]),
        part(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 6).rotateX(Math.PI / 2), RED, [
          x,
          y + 0.6,
          z + 0.5,
        ]),
      ]),
    ],
    side: {
      long: 7,
      high: 0.66,
      y: 0.75,
      z: -1.5,
      paint(brush, wide) {
        brush.font = "bold 72px sans-serif";
        brush.textAlign = "center";
        brush.textBaseline = "middle";
        brush.fillStyle = "#fff";
        brush.fillText("FEUERLÖSCHBOOT BS", wide / 2, 50);
      },
    },
    lights: [[0, 7.5, 0.4]],
  },
  police: {
    spec: { max: 70, back: 6, accelerate: 25, brake: 30, roll: 2, steer: 0.5, grip: 400 },
    width: 3,
    half: 5.5,
    axles: 6,
    parts: () => [
      // White up to y = 0.05, just above the waterline (y = 0), blue above (painted, see side).
      ...hull(
        3,
        [
          [
            [-5.5, -0.5],
            [4, -0.5],
            [4.6, 0.05],
            [-5.5, 0.05],
          ],
          [
            [-5.5, 0.05],
            [4.6, 0.05],
            [5.5, 0.95],
            [-5.5, 0.95],
          ],
        ],
        [WHITE, BLUE],
      ),
      part(box(2.9, 0.06, 10.8), WHITE, [0, 0.97, 0]), // deck
      part(box(2.6, 1.8, 5), WHITE, [0, 1.9, -0.6]), // cabin
      part(box(2.62, 0.5, 4.2), GLASS, [0, 2.3, -0.8]), // its side windows, out a little
      part(box(2.2, 0.6, 0.02), GLASS, [0, 2.25, 1.91]), // its windscreen
      part(box(2.7, 0.08, 5.2), WHITE, [0, 2.84, -0.6]), // its roof
      // Railings along the bow and the stern, each a rail on posts, both sides.
      ...[
        [2.2, 5],
        [-5.4, -3.2],
      ].flatMap(([from, to]) =>
        [-1, 1].flatMap((side) => [
          part(box(0.04, 0.04, to - from), WHITE, [side * 1.35, 1.75, (from + to) / 2]),
          ...[from, (from + to) / 2, to].map((z) =>
            part(box(0.04, 0.75, 0.04), WHITE, [side * 1.35, 1.37, z]),
          ),
        ]),
      ),
    ],
    side: {
      long: 10, // short of the raked bow
      high: 0.9,
      y: 0.5,
      z: -0.5,
      // Blue, a white-and-blue chequered band along the bottom, POLIZEI in white in the middle.
      paint(brush, wide) {
        brush.fillStyle = "#1f4fb8";
        brush.fillRect(0, 0, wide, 96);
        brush.fillStyle = "#fff";
        for (let x = 0; x < wide; x += 10)
          for (const row of [0, 1])
            if ((x / 10 + row) % 2) brush.fillRect(x, 76 + row * 10, 10, 10);
        brush.font = "bold 56px sans-serif";
        brush.textAlign = "center";
        brush.textBaseline = "middle";
        brush.fillText("POLIZEI", wide / 2, 40);
      },
    },
    lights: [
      [-0.6, 3, 1.4],
      [0.6, 3, 1.4],
    ],
  },
};

// Boats of a kind (KINDS), one per place ({ x, y, z, heading }), each { group, material, update,
// half, width }; they share their geometries and all materials but the hull's (so one is
// highlighted alone). boost(position): how much larger to draw one far away; world: as for
// createDriving (src/drive.js).
export function createBoats(kind, places, boost, world) {
  const { spec, width, half, axles, parts, side, lights } = KINDS[kind];
  const body = mergeGeometries(parts());
  // Its sides, drawn here, so nothing is loaded, on a canvas shaped as them.
  const { long, high, y, z, paint } = side;
  const wide = Math.round((96 * long) / high); // px
  const canvas = Object.assign(document.createElement("canvas"), { width: wide, height: 96 });
  paint(canvas.getContext("2d"), wide);
  const lettering = new THREE.CanvasTexture(canvas);
  lettering.colorSpace = THREE.SRGBColorSpace;
  const signs = mergeGeometries(
    [-1, 1].map((s) =>
      new THREE.PlaneGeometry(long, high)
        .rotateY((s * Math.PI) / 2)
        .translate(s * (width / 2 + 0.01), y, z),
    ),
  );
  const signMaterial = new THREE.MeshLambertMaterial({ map: lettering, alphaTest: 0.5 });
  // The blue lights: lit, a bright core in a blue glow added onto what is behind it.
  const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3060ff).multiplyScalar(3) });
  const unlit = new THREE.MeshBasicMaterial({ color: 0x1a3a8a });
  const lens = box(0.3, 0.2, 0.3);
  const glowMaterial = glow(0x1848ff);
  const driving = { ...spec, spin: 0.1, react: 3, axles, half, width };
  // Each boat's lights flash this many seconds later than the one before.
  return places.map((place, k) => createBoat(place, k * 0.31));

  function createBoat(place, late) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // On the water along its heading, with the wake, which so stays level on the water; in it the
    // boat, rocking.
    const group = new THREE.Group();
    const rocking = new THREE.Group();
    rocking.add(new THREE.Mesh(body, material), new THREE.Mesh(signs, signMaterial));
    const wake = createWake(width);
    wake.mesh.position.z = -half;
    group.add(rocking, wake.mesh);
    const flashers = lights.map((at) => {
      const core = new THREE.Mesh(lens, unlit);
      core.position.set(...at);
      const light = new THREE.Sprite(glowMaterial);
      light.position.copy(core.position);
      light.scale.setScalar(1.6); // metres across
      rocking.add(core, light);
      return { core, light };
    });
    const drive = createDriving(place, driving, world);
    const s = drive.state;

    // Driven by input (createDriving), else in its place; rocking, its lights flashing in turn,
    // each twice, 0.6 s in all.
    function update(seconds, dt, input) {
      drive.step(dt, input);
      group.position.set(s.x, s.y, s.z);
      group.rotation.y = s.heading;
      group.scale.setScalar(boost(group.position));
      rocking.position.y = 0.05 * Math.sin(seconds * 1.3 + late);
      rocking.rotation.set(
        0.01 * Math.sin(seconds * 0.9 + late),
        0,
        0.02 * Math.sin(seconds * 1.1),
      );
      wake.update(seconds, s.speed);
      const t = (seconds + late) % 0.6;
      const flash = t % 0.3 < 0.07 || (t % 0.3 > 0.12 && t % 0.3 < 0.19);
      flashers.forEach(({ core, light }, k) => {
        light.visible = flash && Math.floor(t / 0.3) === k % 2;
        core.material = light.visible ? lit : unlit;
      });
    }
    update(0, 0, null); // in place before the first frame

    return { group, material, update, half, width };
  }
}
