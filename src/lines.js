import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

// Lines to check the ways of what moves (ticked in the menu): strong magenta unless given a colour,
// shown exactly (no tone mapping, as the trams' badges), 4 px wide, drawn over everything.
// vertices: flat x, y, z of each segment's two ends.
export function checkLines(vertices, color = 0xff00ff) {
  const lines = new LineSegments2(
    new LineSegmentsGeometry().setPositions(vertices),
    new LineMaterial({ color, linewidth: 4, depthTest: false, toneMapped: false }),
  );
  lines.renderOrder = 1;
  return lines;
}
