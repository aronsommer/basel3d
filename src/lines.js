import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

// The magenta of the check lines, their boxes in the menu and the museum's pins (style.css's
// --magenta, src/main.js).
export const MAGENTA = 0xff00ff;
// Lines to check the ways of what moves (ticked in the menu): MAGENTA unless given a colour,
// shown exactly (no tone mapping, as the trams' badges), 4 px wide, drawn over everything, with
// fewer segments where straight (simplify). vertices: flat x, y, z of each segment's two ends.
export function checkLines(vertices, color = MAGENTA) {
  const lines = new LineSegments2(
    new LineSegmentsGeometry().setPositions(simplify(vertices)),
    new LineMaterial({ color, linewidth: 4, depthTest: false, toneMapped: false }),
  );
  lines.renderOrder = 1;
  return lines;
}

const TOLERANCE = 0.3; // metres a simplified line strays at most from the points it leaves out

// The segments (as for checkLines) with, along each run of them joined end to start, only the
// points that lie further than TOLERANCE from the straight line between those kept
// (Douglas–Peucker).
function simplify(v) {
  const out = [];
  let run = []; // the offsets in v of the run's points
  const flush = () => {
    const keep = new Uint8Array(run.length);
    keep[0] = keep[run.length - 1] = 1;
    const stack = [0, run.length - 1];
    while (stack.length) {
      const e = stack.pop();
      const s = stack.pop();
      let far = TOLERANCE * TOLERANCE;
      let at = -1;
      for (let i = s + 1; i < e; i++) {
        const d = distance2(v, run[i], run[s], run[e]);
        if (d > far) {
          far = d;
          at = i;
        }
      }
      if (at >= 0) {
        keep[at] = 1;
        stack.push(s, at, at, e);
      }
    }
    let last = run[0];
    for (let i = 1; i < run.length; i++)
      if (keep[i]) {
        const o = run[i];
        out.push(v[last], v[last + 1], v[last + 2], v[o], v[o + 1], v[o + 2]);
        last = o;
      }
  };
  for (let i = 0; i < v.length; i += 6) {
    const end = run.at(-1);
    if (
      end === undefined ||
      v[end] !== v[i] ||
      v[end + 1] !== v[i + 1] ||
      v[end + 2] !== v[i + 2]
    ) {
      if (run.length) flush();
      run = [i];
    }
    run.push(i + 3);
  }
  if (run.length) flush();
  return out;
}

// The squared distance of the point at offset p in v from the segment between those at a and b.
function distance2(v, p, a, b) {
  const dx = v[b] - v[a];
  const dy = v[b + 1] - v[a + 1];
  const dz = v[b + 2] - v[a + 2];
  const px = v[p] - v[a];
  const py = v[p + 1] - v[a + 1];
  const pz = v[p + 2] - v[a + 2];
  const length2 = dx * dx + dy * dy + dz * dz;
  const t = length2 ? Math.min(Math.max((px * dx + py * dy + pz * dz) / length2, 0), 1) : 0;
  const x = px - t * dx;
  const y = py - t * dy;
  const z = pz - t * dz;
  return x * x + y * y + z * z;
}
