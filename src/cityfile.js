// Reads the buildings file public/basel.bin (tools/compact.mjs): the meshes of the former
// basel.glb, their vertices on the same grid.

// mesh(scale, x, y, z, normalized) for each mesh: its vertices' whole numbers times scale (after
// being divided by 32767 if normalized) plus x, y, z are scene coordinates. After each,
// building(number, pos, roof, wall, ranges, colours, c) for each of its buildings, with pos: x, y,
// z per vertex; roof and wall: the vertex numbers of their triangles; ranges: [bottom, top, foot,
// wall triangles, …] per run of wall triangles, for _wall (src/facade.js); colours: all
// buildings', its roof's linear RGB at c and its walls' RGB and facade at c + 3.
import { Packed } from "./pack.js";

export function readCity(buffer, mesh, building) {
  const header = new Uint32Array(buffer, 0, 10);
  let offset = 40;
  const [meshes, head, xs, zs, columns, heights, ranks, walls, triangles, colours] = [
    ...header,
  ].map((length) => {
    const packed = new Packed(new Uint8Array(buffer, offset, length));
    offset += length;
    return packed;
  });
  // Per mesh: scale, x, y, z, normalized, buildings.
  const table = new Float64Array(buffer.slice(40, 40 + header[0]));
  const levels = []; // the heights of the building's vertices, each once
  let n = 0;
  for (let m = 0; m < table.length; m += 6) {
    mesh(...table.subarray(m, m + 5));
    let x = 0;
    let z = 0;
    let foot = 0;
    for (let left = table[m + 5]; left > 0; left--, n++) {
      const pos = new Int16Array(head.number() * 3);
      const roof = new Uint32Array(head.number() * 3);
      const ranges = new Uint16Array(head.number() * 4);
      levels.length = head.number();
      x += head.signed();
      z += head.signed();
      foot += head.signed();
      const base = head.number();
      let wallTriangles = 0;
      for (let i = 0, bottom = base; i < ranges.length; i += 4) {
        ranges[i] = bottom += walls.signed();
        ranges[i + 1] = bottom + walls.number();
        ranges[i + 2] = base;
        wallTriangles += ranges[i + 3] = walls.number();
      }
      const wall = new Uint32Array(wallTriangles * 3);
      for (let i = 0, y = foot; i < levels.length; i++) levels[i] = y += heights.number();
      // The vertices column by column (those above each other), the columns in order of x, then
      // z, each from its lowest vertex.
      for (let i = 0, vx = x, vz = z; i < pos.length;) {
        vx += xs.number();
        vz += zs.signed();
        for (let more = columns.number(), rank = -1; more >= 0; more--, i += 3) {
          pos[i] = vx;
          pos[i + 1] = levels[(rank += ranks.number() + 1)];
          pos[i + 2] = vz;
        }
      }
      // The triangles of the roof and of each run in order of their lowest vertex number, which
      // comes first.
      const read = (list, from, to) => {
        for (let i = from, a = 0; i < to; i += 3) {
          list[i] = a += triangles.number();
          list[i + 1] = a + triangles.number();
          list[i + 2] = a + triangles.number();
        }
      };
      read(roof, 0, roof.length);
      for (let i = 0, from = 0; i < ranges.length; i += 4)
        read(wall, from, (from += ranges[i + 3] * 3));
      building(n, pos, roof, wall, ranges, colours.bytes, n * 7);
    }
  }
}
