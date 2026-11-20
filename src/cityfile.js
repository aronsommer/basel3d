// Reads the buildings file public/basel.bin (tools/compact.mjs): the meshes of the former
// basel.glb, their vertices on the same grid.

// mesh(scale, x, y, z, normalized) for each mesh: its vertices' whole numbers times scale (after
// being divided by 32767 if normalized) plus x, y, z are scene coordinates. After each,
// building(number, pos, roof, wall, ranges, colours, c) for each of its buildings, with pos: x, y,
// z per vertex; roof and wall: the vertex numbers of their triangles; ranges: [bottom, top, foot,
// wall triangles, …] per run of wall triangles, for _wall (src/facade.js); colours: all
// buildings', its roof's linear RGB at c and its walls' RGB and facade at c + 3.
export function readCity(buffer, mesh, building) {
  const header = new Uint32Array(buffer, 0, 10);
  let offset = 40;
  const [meshes, head, xs, zs, columns, heights, ranks, walls, triangles, colours] = [
    ...header,
  ].map((length) => {
    const bytes = new Uint8Array(buffer, offset, length);
    offset += length;
    return { bytes, at: 0 };
  });
  const number = (s) => {
    let value = 0;
    let scale = 1;
    for (;;) {
      const byte = s.bytes[s.at++];
      value += (byte & 127) * scale;
      if (byte < 128) return value;
      scale *= 128;
    }
  };
  const signed = (s) => {
    const value = number(s);
    return value % 2 ? -(value + 1) / 2 : value / 2;
  };
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
      const pos = new Int16Array(number(head) * 3);
      const roof = new Uint32Array(number(head) * 3);
      const ranges = new Uint16Array(number(head) * 4);
      levels.length = number(head);
      x += signed(head);
      z += signed(head);
      foot += signed(head);
      const base = number(head);
      let wallTriangles = 0;
      for (let i = 0, bottom = base; i < ranges.length; i += 4) {
        ranges[i] = bottom += signed(walls);
        ranges[i + 1] = bottom + number(walls);
        ranges[i + 2] = base;
        wallTriangles += ranges[i + 3] = number(walls);
      }
      const wall = new Uint32Array(wallTriangles * 3);
      for (let i = 0, y = foot; i < levels.length; i++) levels[i] = y += number(heights);
      // The vertices column by column (those above each other), the columns in order of x, then
      // z, each from its lowest vertex.
      for (let i = 0, vx = x, vz = z; i < pos.length;) {
        vx += number(xs);
        vz += signed(zs);
        for (let more = number(columns), rank = -1; more >= 0; more--, i += 3) {
          pos[i] = vx;
          pos[i + 1] = levels[(rank += number(ranks) + 1)];
          pos[i + 2] = vz;
        }
      }
      // The triangles of the roof and of each run in order of their lowest vertex number, which
      // comes first.
      const read = (list, from, to) => {
        for (let i = from, a = 0; i < to; i += 3) {
          list[i] = a += number(triangles);
          list[i + 1] = a + number(triangles);
          list[i + 2] = a + number(triangles);
        }
      };
      read(roof, 0, roof.length);
      for (let i = 0, from = 0; i < ranges.length; i += 4)
        read(wall, from, (from += ranges[i + 3] * 3));
      building(n, pos, roof, wall, ranges, colours.bytes, n * 7);
    }
  }
}
