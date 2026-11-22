// The passage under the Mittlere Brücke (src/passage.js) for the converters, in LV95.
import { PASSAGE } from "../src/passage.js";
import { toLV95 } from "./osm.mjs";

export const passageEnds = PASSAGE.ends.map(([lat, lon]) => ({ lat, lon }));
const [a, b] = passageEnds.map(toLV95);
export const passageLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
const [ue, un] = [(b[0] - a[0]) / passageLength, (b[1] - a[1]) / passageLength];

// An LV95 point's [along, across]: metres from its first end along its middle and towards the
// Rhine.
export const passageLocal = (e, n) => [
  (e - a[0]) * ue + (n - a[1]) * un,
  (e - a[0]) * un - (n - a[1]) * ue,
];

// Whether a way is a tunnel wholly inside it.
export function inPassage({ type, tags, geometry }) {
  if (type !== "way" || !tags?.tunnel || !geometry?.every(Boolean)) return false;
  return geometry.every((point) => {
    const [t, s] = passageLocal(...toLV95(point));
    return t >= 0 && t <= passageLength && Math.abs(s) <= PASSAGE.width / 2;
  });
}
