// Graffiti in Cherry Bomb One (public/CherryBombOne.woff2, its Latin letters), black and white
// (paint), all of them in GRAFFITI: small tags and big pieces, each where it says.
import * as THREE from "three";
import { fromWGS84 } from "./geo.js";

// Every graffito, each { where, kind, from, to, text, back, roof }. To add one: in the viewer press
// C over each end of where it goes, on the wall or roof (C copies the point: lat, lon, metres
// above sea), and give where (words, to know it by), its kind (KINDS: a tag or piece), its text
// (any Latin letters) and, for a slab behind it, back (two colours, 0xrrggbb, the one above the
// other: FCB). Its text runs along the way from one point to the other, at most as wide as that;
// before the wall there, its middle at the points' height but at least its kind's raise in metres
// above the ground and at most up to TOP metres below the wall's top, out before every wall
// behind it (AHEAD); or with roof on the roof there, read from down its slope (on a flat one from
// left at from to right at to), in the slope's middle, at most up to EDGE metres from its ends.
// One that finds no wall or roof there is left out, with a warning in the console.
const FCB = [0x1d3fbf, 0xd51f2a]; // blue over red
const GRAFFITI = [
  {
    where: "An 82 m tower's side, south-west of Basel SBB's station building",
    kind: "piece",
    from: [47.546187, 7.58733, 298.2],
    to: [47.546345, 7.586954, 298.1],
    text: "FCB",
    back: FCB,
  },
  {
    where: "A row of 14 m high houses, about 650 m south-east of Basel SBB's station building",
    kind: "piece",
    from: [47.544213, 7.596809, 286.5],
    to: [47.544376, 7.59629, 287.2],
    text: "FCB 1893",
    back: FCB,
  },
  {
    where: "A 23 m long house wall about 140 m north-east of the Marktplatz",
    kind: "piece",
    from: [47.558755, 7.589476, 262.2],
    to: [47.558865, 7.589347, 263.2],
    text: "FCB",
    back: FCB,
  },
  {
    where: "The Kaserne's roof to the Rhine, in postcode 4058, about 50 m from 4057's border",
    kind: "piece",
    roof: true,
    from: [47.562975, 7.588992],
    to: [47.562439, 7.589382],
    text: "4057 FTP 4058",
  },
];
// Per kind: metres above the ground on a wall, and px of its letters when drawn.
const KINDS = { tag: { raise: 0.3, size: 96 }, piece: { raise: 0.8, size: 300 } };
// Metres: TOP, EDGE and AHEAD as said, OFF off the wall or roof.
const [TOP, EDGE, AHEAD, OFF] = [2, 0.5, 3, 0.02];
// Per px of the letters: the black outline's width (it joins them, fills their holes), the white
// cut line's around it, how far the white face sits up left of its black shade, and how wide a
// gap or bay of the black may be at most to be filled black too (closing it); and the gap between
// words, which stay apart.
const [OUTLINE, CUT, SHADE, FILL, GAP] = [0.22, 0.03, 0.04, 0.2, 0.15];
const [WHITE, BLACK] = [
  [244, 243, 238],
  [21, 21, 21],
];
// A slab behind (back), per px of the letters: how far it reaches beyond their outline and how
// round it is (the widest gap or bay it fills); and how far its colours' border falls per px to
// the right.
const SLAB = { reach: 0.35, round: 0.6, fall: 0.12 };
const cover = (d) => Math.min(Math.max(d + 0.5, 0), 1); // of a pixel d px inside an edge

// Per cell of a w × h grid, its distance in cells to the nearest one where is(i) holds (exact,
// Felzenszwalb and Huttenlocher's way; about 1e10 if none).
function distances(w, h, is) {
  const d = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = is(i) ? 0 : 1e20;
  const n = Math.max(w, h);
  const [f, v, z] = [new Float64Array(n), new Int32Array(n), new Float64Array(n + 1)];
  // Squared distances along one row or column: len cells from start, step apart.
  const pass = (start, step, len) => {
    for (let q = 0; q < len; q++) f[q] = d[start + q * step];
    let k = 0;
    [v[0], z[0], z[1]] = [0, -Infinity, Infinity];
    for (let q = 1; q < len; q++) {
      let s;
      while ((s = (f[q] + q * q - f[v[k]] - v[k] * v[k]) / (2 * (q - v[k]))) <= z[k]) k--;
      [v[++k], z[k], z[k + 1]] = [q, s, Infinity];
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      d[start + q * step] = (q - v[k]) ** 2 + f[v[k]];
    }
  };
  for (let x = 0; x < w; x++) pass(x, w, h);
  for (let y = 0; y < h; y++) pass(y * w, 1, w);
  for (let i = 0; i < w * h; i++) d[i] = Math.sqrt(d[i]);
  return d;
}
// A word at size px on a canvas of its own: its letters, outlined black (closed), in a white cut
// line, then the letters black and their white face up left of it; with the baseline's height.
function sheetOf(text, size) {
  const font = `${size}px "Cherry Bomb One"`;
  const canvas = document.createElement("canvas");
  const c = canvas.getContext("2d");
  c.font = font;
  const m = c.measureText(text);
  // Room for the outline grown by FILL, so it closes as if nothing were beyond the canvas.
  const [grown, pad] = [(OUTLINE / 2 + FILL) * size, Math.ceil((OUTLINE / 2 + FILL) * size) + 2];
  const w = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + 2 * pad;
  const h = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + 2 * pad;
  const [x, y] = [pad + m.actualBoundingBoxLeft, pad + m.actualBoundingBoxAscent];
  [canvas.width, canvas.height] = [w, h];
  c.font = font;
  c.fillText(text, x, y);
  const letters = c.getImageData(0, 0, w, h).data;
  // The outline grown by FILL, then shrunk by it: how far each pixel is inside the grown one.
  const near = distances(w, h, (i) => letters[4 * i + 3] >= 128);
  const inside = distances(w, h, (i) => near[i] > grown);
  const image = c.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const black = cover(inside[i] - FILL * size);
    for (let k = 0; k < 3; k++) image.data[4 * i + k] = WHITE[k] + (BLACK[k] - WHITE[k]) * black;
    image.data[4 * i + 3] = 255 * cover(inside[i] - (FILL - CUT) * size);
  }
  c.putImageData(image, 0, 0);
  c.fillStyle = `rgb(${BLACK})`;
  c.fillText(text, x, y);
  c.fillStyle = `rgb(${WHITE})`;
  c.fillText(text, x - SHADE * size, y - SHADE * size);
  // Without the room for growing, but the cut line.
  const margin = Math.floor((FILL - CUT) * size) - 1;
  const out = document.createElement("canvas");
  [out.width, out.height] = [w - 2 * margin, h - 2 * margin];
  out.getContext("2d").drawImage(canvas, -margin, -margin);
  return { sheet: out, baseline: Math.round(y) - margin };
}
// A canvas with text at size px, its words each on its own (sheetOf), GAP apart, on one baseline;
// with back, on its slab (slab).
function paint(text, size, back) {
  const words = text.split(" ").map((w) => sheetOf(w, size));
  const above = Math.max(...words.map(({ baseline }) => baseline));
  const below = Math.max(...words.map(({ sheet, baseline }) => sheet.height - baseline));
  const gap = Math.round(GAP * size);
  const canvas = document.createElement("canvas");
  canvas.width = words.reduce((sum, { sheet }) => sum + sheet.width + gap, -gap);
  canvas.height = above + below;
  let x = 0;
  for (const { sheet, baseline } of words) {
    canvas.getContext("2d").drawImage(sheet, x, above - baseline);
    x += sheet.width + gap;
  }
  return back ? slab(canvas, size, back) : canvas;
}
// A canvas with what is on this one (letters size px) on a slab (SLAB) behind it all: the colour
// top above a border falling to the right through its middle, bottom below.
function slab(canvas, size, [top, bottom]) {
  const { reach, round, fall } = SLAB;
  const pad = Math.ceil((reach + round) * size) + 2; // room to grow by both, as in sheetOf
  const [w, h] = [canvas.width + 2 * pad, canvas.height + 2 * pad];
  const out = document.createElement("canvas");
  [out.width, out.height] = [w, h];
  const c = out.getContext("2d");
  c.drawImage(canvas, pad, pad);
  const shown = c.getImageData(0, 0, w, h).data;
  // What is shown grown by reach and round, then shrunk by round: how far inside each pixel is.
  const near = distances(w, h, (i) => shown[4 * i + 3] >= 128);
  const inside = distances(w, h, (i) => near[i] > (reach + round) * size);
  const [upper, lower] = [top, bottom].map((rgb) => [rgb >> 16, (rgb >> 8) & 255, rgb & 255]);
  const image = c.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const [x, y] = [i % w, Math.floor(i / w)];
    const below = cover(y - h / 2 - fall * (x - w / 2));
    for (let k = 0; k < 3; k++) image.data[4 * i + k] = upper[k] + (lower[k] - upper[k]) * below;
    image.data[4 * i + 3] = 255 * cover(inside[i] - round * size);
  }
  c.putImageData(image, 0, 0);
  c.drawImage(canvas, pad, pad);
  // Without the room for rounding.
  const margin = Math.floor(round * size) - 1;
  const cut = document.createElement("canvas");
  [cut.width, cut.height] = [w - 2 * margin, h - 2 * margin];
  cut.getContext("2d").drawImage(out, -margin, -margin);
  return cut;
}
// A material showing a canvas, near the walls without fighting them.
function material(canvas) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return new THREE.MeshLambertMaterial({
    map,
    alphaTest: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
}
const plane = () => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); // its bottom's middle at 0

// font: the font file's bytes; structures: src/buildings.js; ground(x, z, y): the height walked on
// there, from near y; roofAt({ x, z }): the topmost roof there, { number, y }, if any. Resolves to
// { meshes, marks: per graffito [its building, a function hiding it] }.
export async function createGraffiti(font, structures, ground, roofAt) {
  document.fonts.add(await new FontFace("Cherry Bomb One", font).load());
  const [meshes, marks] = [[], []];
  const matrix = new THREE.Matrix4();
  for (const { where, kind, from, to, text, roof, back } of GRAFFITI) {
    const missing = (what) => console.warn(`Graffito "${text}" (${where}): no ${what} there`);
    const [[fx, fz], [tx, tz]] = [fromWGS84(...from), fromWGS84(...to)];
    const length = Math.hypot(tx - fx, tz - fz);
    const [mx, mz] = [(fx + tx) / 2, (fz + tz) / 2];
    const sheet = paint(text, KINDS[kind].size, back);
    const aspect = sheet.width / sheet.height;
    const mesh = new THREE.Mesh(plane(), material(sheet));
    if (roof) {
      const over = roofAt({ x: mx, z: mz });
      if (!over) {
        missing("roof");
        continue;
      }
      // Its plane at the middle: n down it, s metres up per metre that way, and a metres up per
      // metre along from → to (u).
      const top = (x, z) => structures.top(x, z, Infinity);
      const [ux, uz] = [(tx - fx) / length, (tz - fz) / length];
      let [nx, nz] = [uz, -ux];
      let s = (top(mx - nx, mz - nz) - top(mx + nx, mz + nz)) / 2;
      if (s < 0) [nx, nz, s] = [-nx, -nz, -s];
      const a = (top(mx + ux, mz + uz) - top(mx - ux, mz - uz)) / 2;
      // Metres the slope goes on from the middle seen from above, down it (k = 1) or up (-1):
      // where the roof stays within 0.2 m of its plane, tried every 0.25 m.
      const reach = (k) => {
        let d = 0;
        const off = (d) => top(mx + k * nx * d, mz + k * nz * d) - (over.y - k * s * d);
        while (d < 50 && Math.abs(off(d + 0.25)) < 0.2) d += 0.25;
        return d;
      };
      const [down, up] = [reach(1), reach(-1)];
      // Its axes in the plane: right along u, upward up the slope; and out of the plane.
      const slope = new THREE.Vector3(nx, -s, nz); // down it per metre seen from above
      const right = new THREE.Vector3(ux, a, uz).normalize();
      const out = new THREE.Vector3().crossVectors(right, slope).normalize();
      if (out.y < 0) out.negate();
      const upward = new THREE.Vector3().crossVectors(out, right);
      // Read from down the slope; on one flat to 1 cm per metre, from from's side.
      if (upward.y < -0.01) [right, upward].forEach((v) => v.negate());
      const width = Math.min(length, ((down + up) * Math.hypot(1, s) - 2 * EDGE) * aspect);
      // Its bottom's middle: half its height down the slope from the slope's middle, OFF out.
      mesh.position
        .set(mx, over.y, mz)
        .addScaledVector(slope, (down - up) / 2)
        .addScaledVector(upward, -width / aspect / 2)
        .addScaledVector(out, OFF);
      mesh.quaternion.setFromRotationMatrix(matrix.makeBasis(right, upward, out));
      mesh.scale.set(width, width / aspect, 1);
      meshes.push(mesh);
      marks.push([over.number, () => (mesh.visible = false)]);
      continue;
    }
    // The wall: the longest within 2 m of the middle along the way from → to.
    let wall = null;
    for (const [number, walls] of structures.walls(mx, mz, 2))
      for (let i = 0; i < walls.length; i += 6) {
        const [ax, az, bx, bz, , top] = walls.slice(i, i + 6);
        const l = Math.hypot(bx - ax, bz - az);
        const [ux, uz] = [(bx - ax) / l, (bz - az) / l];
        if (Math.abs(ux * (tx - fx) + uz * (tz - fz)) < 0.98 * length) continue;
        if (Math.abs((mx - ax) * uz - (mz - az) * ux) > 2 || l <= (wall?.l ?? 0)) continue;
        const along = (mx - ax) * ux + (mz - az) * uz;
        wall = { number, l, top, ux, uz, x: ax + ux * along, z: az + uz * along };
      }
    if (!wall) {
      missing("wall");
      continue;
    }
    // Out of it: the side with no roof over it.
    let [nx, nz] = [wall.uz, -wall.ux];
    if (structures.top(wall.x + nx, wall.z + nz, Infinity) > -Infinity) [nx, nz] = [-nx, -nz];
    // The ground at the wall and 1 m before it (the terrain may rise to the wall), the highest
    // along the whole way from → to, every metre.
    const steps = Math.ceil(length);
    let y = -Infinity;
    for (let k = 0; k <= steps; k++)
      for (const out of [0, 1]) {
        const t = (k / steps - 0.5) * length;
        const [x, z] = [wall.x + wall.ux * t + nx * out, wall.z + wall.uz * t + nz * out];
        y = Math.max(y, ground(x, z, Infinity));
      }
    // As high as fits between the ground and the top, its middle at the points' height if it may
    // (metres above sea less 250 m: the scene's y, src/geo.js), else as low as it may.
    const [low, high] = [y + KINDS[kind].raise, wall.top - TOP];
    const tall = Math.min(length / aspect, high - low);
    if (tall <= 0) {
      missing("room on the wall");
      continue;
    }
    const middle = from.length > 2 ? (from[2] + to[2]) / 2 - 250 : -Infinity;
    const bottom = Math.min(Math.max(middle - tall / 2, low), high - tall);
    // Before every wall reaching into its area from behind it up to AHEAD metres out, corners
    // too, so none hides any of it: as far out as the furthest.
    const half = (tall * aspect) / 2;
    let front = 0;
    for (const [, walls] of structures.walls(wall.x, wall.z, half + AHEAD))
      for (let i = 0; i < walls.length; i += 6) {
        const [ax, az, bx, bz, lo, hi] = walls.slice(i, i + 6);
        if (hi <= bottom || lo >= bottom + tall) continue;
        // Its ends: how far along the wall from the middle, and how far out.
        const [a, b] = [
          [ax, az],
          [bx, bz],
        ].map(([x, z]) => [
          (x - wall.x) * wall.ux + (z - wall.z) * wall.uz,
          (x - wall.x) * nx + (z - wall.z) * nz,
        ]);
        const [t0, t1] = [
          Math.max(Math.min(a[0], b[0]), -half),
          Math.min(Math.max(a[0], b[0]), half),
        ];
        if (t0 > t1) continue;
        // How far out it is at t along, as straight between its ends.
        const at = (t) =>
          a[0] === b[0]
            ? Math.max(a[1], b[1])
            : a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]);
        const out = Math.max(at(t0), at(t1));
        if (out <= AHEAD) front = Math.max(front, out);
      }
    mesh.scale.set(tall * aspect, tall, 1);
    mesh.rotation.y = Math.atan2(nx, nz);
    mesh.position.set(wall.x + nx * (front + OFF), bottom, wall.z + nz * (front + OFF));
    meshes.push(mesh);
    marks.push([wall.number, () => (mesh.visible = false)]);
  }
  return { meshes, marks };
}
