// The buildings of public/basel.bin as the meshes of the former basel.glb: per mesh tile a roof
// and a wall mesh with each vertex's building number (_building), its building's colour (color;
// a wall's alpha its facade style) and on walls _wall (src/facade.js).
import * as THREE from "three";
import { readCity } from "./cityfile.js";

// A mesh's data, growing: per vertex 3 of position, 1 of number, 4 of colour and 4 of range.
const data = () => ({
  position: new Int16Array(3 << 12),
  number: new Uint16Array(1 << 12),
  colour: new Uint8Array(4 << 12),
  range: new Uint16Array(4 << 12),
  index: new Uint32Array(1 << 12),
  vertices: 0,
  indices: 0,
});
// Makes room for this many more vertices and indices.
function room(m, vertices, indices) {
  const grow = (name, size, needed) => {
    if (needed * size <= m[name].length) return;
    const next = new m[name].constructor(Math.max(needed * size, m[name].length * 2));
    next.set(m[name]);
    m[name] = next;
  };
  grow("position", 3, m.vertices + vertices);
  grow("number", 1, m.vertices + vertices);
  grow("colour", 4, m.vertices + vertices);
  grow("range", 4, m.vertices + vertices);
  grow("index", 1, m.indices + indices);
}

// materials: { roof, wall }.
export function createCity(buffer, materials) {
  const city = new THREE.Group();
  let tile = null; // { roof, wall, scale, x, y, z, normalized } being read
  const finish = () => {
    for (const kind of tile ? ["roof", "wall"] : []) {
      const m = tile[kind];
      if (!m.indices) continue;
      const attribute = (name, size, normalized) =>
        new THREE.BufferAttribute(m[name].slice(0, m.vertices * size), size, normalized);
      const geometry = new THREE.BufferGeometry()
        .setAttribute("position", attribute("position", 3, tile.normalized))
        .setAttribute("_building", attribute("number", 1))
        .setAttribute("color", attribute("colour", 4, true))
        .setIndex(new THREE.BufferAttribute(m.index.slice(0, m.indices), 1));
      if (kind === "wall") geometry.setAttribute("_wall", attribute("range", 4));
      const object = new THREE.Mesh(geometry, materials[kind]);
      object.position.set(tile.x, tile.y, tile.z);
      object.scale.setScalar(tile.scale);
      city.add(object);
    }
  };
  readCity(
    buffer,
    (scale, x, y, z, normalized) => {
      finish();
      tile = { roof: data(), wall: data(), scale, x, y, z, normalized: !!normalized };
    },
    (number, pos, roof, wall, ranges, colours, c) => {
      // Adds the vertex v to a mesh, with the colour at `at` and an alpha; gives its number there.
      const add = (m, v, at, alpha) => {
        const n = m.vertices++;
        m.position.set(pos.subarray(v * 3, v * 3 + 3), n * 3);
        m.number[n] = number;
        m.colour[n * 4] = colours[at];
        m.colour[n * 4 + 1] = colours[at + 1];
        m.colour[n * 4 + 2] = colours[at + 2];
        m.colour[n * 4 + 3] = alpha;
        return n;
      };
      const placed = new Int32Array(pos.length / 3).fill(-1); // a vertex's number in the mesh
      const top = tile.roof;
      room(top, pos.length / 3, roof.length);
      for (const v of roof) {
        if (placed[v] < 0) placed[v] = add(top, v, c, 255);
        top.index[top.indices++] = placed[v];
      }
      // The wall triangles with the same _wall share their vertices.
      const side = tile.wall;
      room(side, wall.length, wall.length);
      const alpha = colours[c + 6];
      for (let r = 0, i = 0; r < ranges.length; r += 4) {
        placed.fill(-1);
        for (const end = i + ranges[r + 3] * 3; i < end; i++) {
          const v = wall[i];
          if (placed[v] < 0) {
            const n = (placed[v] = add(side, v, c + 3, alpha));
            side.range.set(ranges.subarray(r, r + 3), n * 4);
          }
          side.index[side.indices++] = placed[v];
        }
      }
    },
  );
  finish();
  return city;
}
