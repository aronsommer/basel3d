// The terrain of public/terrain/terrain.bin (tools/terrain.mjs): per tile of chunk metres, in rows
// from north, a mesh over a grid of GRID + 1 points a side, its right-angled triangles halved
// along their longest side only where the ground needs it (as in mapbox/martini). Stored as one
// bit per triangle that can be halved, whether it is, and the height of each new point in cm as
// how it differs from the middle of the side it halves (after the tile's four corners).
import { Packed } from "./pack.js";

export const GRID = 512;
const SIDE = GRID + 1;
// The two triangles each tile starts from, as corners a, b (their longest side) and c.
const ROOTS = [
  [0, 0, GRID, GRID, GRID, 0],
  [GRID, GRID, 0, 0, 0, GRID],
];

// Walks a tile's triangles in the order they are stored: split(a, b, c) says whether to halve one
// (only called where it can be), leaf(a, b, c) gets each kept one, facing up; points are keys
// y * SIDE + x.
export function walk(split, leaf) {
  const visit = (ax, ay, bx, by, cx, cy) => {
    const [mx, my] = [(ax + bx) >> 1, (ay + by) >> 1];
    if (
      Math.abs(ax - cx) + Math.abs(ay - cy) > 1 &&
      split(ay * SIDE + ax, by * SIDE + bx, my * SIDE + mx)
    ) {
      visit(cx, cy, ax, ay, mx, my);
      visit(bx, by, cx, cy, mx, my);
    } else leaf(ay * SIDE + ax, by * SIDE + bx, cy * SIDE + cx);
  };
  for (const root of ROOTS) visit(...root);
}

// The tiles and the height at a scene point, as the meshes have it. A tile: keys: its points
// ascending; heights: theirs in metres above scene 0; index: its triangles over them; ring: those
// on its edge, from the north-west corner east, then south, west and north; has: one bit per key
// whether it is a point.
export function readTerrain(buffer, { x0, z0, chunk, columns, rows }) {
  const header = new Uint32Array(buffer, 0, 1)[0];
  const bits = new Uint8Array(buffer, 4, header);
  const packed = new Packed(new Uint8Array(buffer, 4 + header));
  let bit = 0;
  const cm = new Int32Array(SIDE * SIDE); // per key, of the tile being read
  const slot = new Uint32Array(SIDE * SIDE); // per key, its place in the tile's keys
  const tiles = [];
  for (let t = 0; t < columns * rows; t++) {
    const has = new Uint32Array(Math.ceil((SIDE * SIDE) / 32));
    const points = [0, GRID, GRID * SIDE, GRID * SIDE + GRID];
    for (const key of points) {
      cm[key] = packed.signed();
      has[key >> 5] |= 1 << (key & 31);
    }
    const triangles = [];
    walk(
      (a, b, m) => {
        if (!((bits[bit >> 3] >> (bit++ & 7)) & 1)) return false;
        if (!((has[m >> 5] >>> (m & 31)) & 1)) {
          cm[m] = Math.floor((cm[a] + cm[b]) / 2) + packed.signed();
          has[m >> 5] |= 1 << (m & 31);
          points.push(m);
        }
        return true;
      },
      (a, b, c) => triangles.push(a, b, c),
    );
    const keys = Int32Array.from(points).sort();
    const heights = new Float32Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      slot[keys[i]] = i;
      heights[i] = cm[keys[i]] / 100;
    }
    const index = new Uint32Array(triangles.length);
    for (let i = 0; i < triangles.length; i++) index[i] = slot[triangles[i]];
    const ring = [];
    for (let k = 0; k < 4 * GRID; k++) {
      const s = k % GRID;
      const key = [s, GRID + s * SIDE, GRID * SIDE + GRID - s, (GRID - s) * SIDE][(k / GRID) | 0];
      if ((has[key >> 5] >>> (key & 31)) & 1) ring.push(slot[key]);
    }
    tiles.push({ keys, heights, index, ring, has });
  }

  // The tile's height at grid point (gx, gy), one of its points.
  const at = ({ keys, heights }, gx, gy) => {
    const key = gy * SIDE + gx;
    let [low, high] = [0, keys.length - 1];
    for (;;) {
      const mid = (low + high) >> 1;
      if (keys[mid] === key) return heights[mid];
      if (keys[mid] < key) low = mid + 1;
      else high = mid - 1;
    }
  };
  const step = chunk / GRID;
  function heightAt(x, z) {
    const fx = Math.min(Math.max((x - x0) / chunk, 0), columns - 1e-9);
    const fz = Math.min(Math.max((z - z0) / chunk, 0), rows - 1e-9);
    const tile = tiles[Math.floor(fz) * columns + Math.floor(fx)];
    const { has } = tile;
    const px = (fx % 1) * GRID;
    const py = (fz % 1) * GRID;
    // Down the halved triangles to the kept one holding the point.
    const root = px >= py ? ROOTS[0] : ROOTS[1];
    let [ax, ay, bx, by, cx, cy] = root;
    for (;;) {
      const mx = (ax + bx) >> 1;
      const my = (ay + by) >> 1;
      const m = my * SIDE + mx;
      if (Math.abs(ax - cx) + Math.abs(ay - cy) <= 1 || !((has[m >> 5] >>> (m & 31)) & 1)) break;
      // Into the half on a's side of the line from c to m, or the other.
      const onA =
        ((mx - cx) * (py - cy) - (my - cy) * (px - cx)) *
          ((mx - cx) * (ay - cy) - (my - cy) * (ax - cx)) >=
        0;
      if (onA) {
        bx = ax;
        by = ay;
        ax = cx;
        ay = cy;
      } else {
        ax = bx;
        ay = by;
        bx = cx;
        by = cy;
      }
      cx = mx;
      cy = my;
    }
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    const u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
    const v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
    return u * at(tile, ax, ay) + v * at(tile, bx, by) + (1 - u - v) * at(tile, cx, cy);
  }
  return { tiles, heightAt, step };
}
