// Checks that every animal of src/zoo.js is in one piece: each of its parts (the triangles sharing
// corners) touches another, all joined to the rest. `npm run joints`.
import * as THREE from "three";

const { KINDS } = await import("../src/zoo.js");
const GAP = 0.001; // metres apart two parts may be and still count as joined

const problems = [];
for (const [name, { body }] of Object.entries(KINDS)) {
  // Its parts: triangles joined where they share a corner.
  const position = body.attributes.position;
  const key = (i) => [0, 1, 2].map((k) => position.array[3 * i + k].toFixed(4)).join();
  const root = Array.from({ length: position.count / 3 }, (_, t) => t);
  const find = (t) => (root[t] === t ? t : (root[t] = find(root[t])));
  const first = new Map(); // a corner → the first triangle with it
  for (let i = 0; i < position.count; i++) {
    const t = Math.floor(i / 3);
    const other = first.get(key(i));
    if (other === undefined) first.set(key(i), t);
    else root[find(t)] = find(other);
  }
  const boxes = new Map(); // a part → its bounding box
  const corner = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const part = find(Math.floor(i / 3));
    if (!boxes.has(part)) boxes.set(part, new THREE.Box3());
    boxes.get(part).expandByPoint(corner.fromBufferAttribute(position, i));
  }
  // Joined to the first part, through others.
  const parts = [...boxes.values()].map((box) => box.expandByScalar(GAP));
  const joined = new Set([0]);
  for (let grew = true; grew;) {
    grew = false;
    parts.forEach((box, p) => {
      if (joined.has(p) || ![...joined].some((q) => parts[q].intersectsBox(box))) return;
      joined.add(p);
      grew = true;
    });
  }
  for (const [p, { min, max }] of parts.entries())
    if (!joined.has(p))
      problems.push(
        `${name}: a part apart, y ${(min.y + GAP).toFixed(2)} to ${(max.y - GAP).toFixed(2)}, ` +
          `z ${(min.z + GAP).toFixed(2)} to ${(max.z - GAP).toFixed(2)}`,
      );
}
console.log(problems.length ? problems.join("\n") : "Every animal is in one piece.");
process.exitCode = problems.length ? 1 : 0;
