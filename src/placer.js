// The Dev panel's Transform tool: Move, Rotate and Scale for figures and museum labels.
import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { toWGS84 } from "./geo.js";
import { frameLines } from "./lines.js";
import PLACEMENTS from "./placement-data.js";
import { MOVES, NUDGE, SHIFT, TURNS } from "./sprayer.js";

const CLICK = 5; // px
const AREA = 200; // metres, the widest figure picked by its box (a flock is up to 180)
const ABOVE = 0.7; // the tag's bottom up the green arrow, in the gizmo's size (its tip at 0.6)
const WIDTH = 100; // .prettierrc's printWidth
const HEAD = `// Written by the Transform tool (src/placer.js). Figures: { figure, from, to: [latitude,
// longitude, metres above sea], heading, x, z }; a kind's one size: { figure, size }; labels:
// { label, at }.
`;
// [name, mode, SVG icon path]
const TOOLS = [
  ["Move", "translate", "M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"],
  ["Rotate", "rotate", "M19 9A8 8 0 0 0 5 8M5 3.5V8h4.5M5 15a8 8 0 0 0 14 1M19 20.5V16h-4.5"],
  ["Scale", "scale", "M4 4h16v16H4zM8 16l8-8M11 8h5v5"],
];

// fixedAt(raycaster): what it names but does not move, the first a ray meets ({ tag, box, mark }:
// mark(on) shows it itself, in place of the frame round its box), or null.
export function createPlacer({ renderer, camera, orbit, scene, figures, labels, fixedAt }) {
  const canvas = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const [box, part, size, spot, top] = [
    new THREE.Box3(),
    new THREE.Box3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  const tag = document.getElementById("tag");
  // Its box: of the meshes shown only (no drops, nothing hidden).
  const boxOf = (object) => {
    object.updateMatrixWorld(true); // as moved this frame
    box.makeEmpty();
    object.traverseVisible((o) => {
      if (!o.isMesh) return;
      if (o.isInstancedMesh)
        o.computeBoundingBox(); // they move
      else if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(part.copy(o.boundingBox ?? o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
    });
    return box;
  };
  // Where an item is saved: a figure's place (anchor), a label's middle.
  const where = ({ object, anchor }) => {
    if (!anchor) return object.position;
    object.updateMatrixWorld();
    return object.localToWorld(spot.copy(anchor));
  };
  // A figure's pivot to its box's bottom middle; nothing moves.
  function centre({ object, inner, anchor }) {
    if (boxOf(object).isEmpty()) return;
    const middle = box.getCenter(new THREE.Vector3()).setY(box.min.y);
    const local = object.worldToLocal(middle.clone());
    object.position.copy(middle);
    inner.position.sub(local);
    anchor.sub(local);
  }
  // Round the picked one's box (update), as the graffiti's frame.
  const frame = frameLines(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5));
  const gizmo = new TransformControls(camera, canvas);
  gizmo.setColors(0xe8432a, 0x8ad63d, 0x3a7eeb, 0xffe24a);
  // Only the three positive axes, plus a cube to move it over the ground.
  const middle = new THREE.Vector3();
  const { gizmo: shown, picker, helper } = gizmo._gizmo;
  for (const [kind, groups] of [
    ["shown", shown],
    ["picker", picker],
    ["helper", helper],
  ])
    for (const [tool, group] of Object.entries(groups))
      for (const handle of [...group.children]) {
        if (kind !== "helper" && tool === "translate" && handle.name === "XZ") {
          const side = kind === "shown" ? 0.1 : 0.2; // picker larger
          handle.geometry = new THREE.BoxGeometry(side, side, side);
          continue;
        }
        const k = "XYZ".indexOf(handle.name);
        handle.geometry.computeBoundingBox();
        const far = k >= 0 && handle.geometry.boundingBox.getCenter(middle).getComponent(k) < -0.01;
        if (handle.name.length !== 1 || k < 0 || handle.tag === "helper" || far)
          group.remove(handle);
      }
  let on = false;
  let mode = "translate";
  let picked = null;
  let down = null;
  let start = 1;
  let buttons = null;

  gizmo.addEventListener("dragging-changed", ({ value }) => (orbit.enabled = !value));
  gizmo.addEventListener("mouseDown", () => (start = picked.object.scale.x));
  gizmo.addEventListener("objectChange", () => {
    const { object } = picked;
    if (picked.label) labels.settle(object);
    else if (gizmo.mode === "scale") {
      const { x, y, z } = object.scale;
      const size = [x, y, z].reduce((a, b) => (Math.abs(b - start) > Math.abs(a - start) ? b : a));
      object.scale.setScalar(Math.max(size, 0.01));
      // The whole kind, city and museum, has one size; the others keep their places.
      for (const figure of figures)
        if (figure !== picked && figure.key.figure === picked.key.figure) {
          const before = where(figure).clone();
          figure.object.scale.copy(object.scale);
          figure.object.position.add(before.sub(where(figure)));
        }
    }
  });

  function pick(item) {
    picked?.mark?.(false);
    picked = item;
    picked?.mark?.(true);
    show();
    tag.hidden = !picked?.tag; // a label is its own
    if (picked?.tag) tag.textContent = picked.tag;
    gizmo.detach();
    gizmo.getHelper().removeFromParent();
    frame.removeFromParent();
    if (!picked) return;
    if (!picked.mark) scene.add(frame);
    if (picked.fixed) return; // named, not moved
    if (!picked.label) centre(picked);
    gizmo.setMode(picked.label ? "translate" : mode);
    gizmo.setSpace(picked.label ? "world" : "local");
    gizmo.showY = !picked.label;
    gizmo.attach(picked.object);
    scene.add(gizmo.getHelper());
  }
  function show() {
    if (!buttons) return;
    TOOLS.forEach(([, m], k) => {
      const usable = picked && !picked.fixed && (!picked.label || m === "translate");
      buttons.children[k].disabled = !usable;
      buttons.children[k].ariaPressed = usable && (picked.label || m === mode);
    });
  }
  function use(m) {
    if (!picked || picked.fixed || (picked.label && m !== "translate")) return;
    mode = m;
    pick(picked);
  }
  // Downloads src/placement-data.js with all changes.
  function save() {
    const entries = [...PLACEMENTS];
    const round = (v, digits) => +v.toFixed(digits);
    const items = [...figures, ...labels.list().map((object) => ({ object, label: true }))];
    const sizes = new Map();
    for (const item of items) {
      const { quaternion, rotation, scale, userData } = item.object;
      const made = item.made ?? { position: userData.made, quaternion, scale };
      if (!item.label && !scale.equals(made.scale)) sizes.set(item.key.figure, round(scale.x, 3));
      const at = where(item);
      if (at.distanceTo(made.position) < 0.001 && quaternion.equals(made.quaternion)) continue;
      const [lat, lon] = toWGS84(at.x, at.z).map((v) => round(v, 6));
      let entry, match;
      if (item.label) {
        const label = userData.text.split(" ")[0];
        [entry, match] = [{ label, at: [lat, lon] }, (e) => e.label === label];
      } else {
        const { figure, from } = item.key;
        const [x, z] = [round(rotation.x, 3), round(rotation.z, 3)];
        entry = {
          ...item.key,
          to: [lat, lon, round(at.y + 250, 1)],
          heading: round(rotation.y, 3),
          ...(x && { x }),
          ...(z && { z }),
        };
        match = (e) => e.figure === figure && e.to && `${e.from}` === `${from}`;
      }
      const k = entries.findIndex(match);
      entries.splice(k < 0 ? entries.length : k, 1, entry);
    }
    for (const [figure, size] of sizes) {
      const k = entries.findIndex((e) => e.figure === figure && !e.to);
      const entry = size === 1 ? [] : [{ figure, size }];
      entries.splice(k < 0 ? entries.length : k, k < 0 ? 0 : 1, ...entry);
    }
    const value = (v) => (Array.isArray(v) ? `[${v.join(", ")}]` : JSON.stringify(v));
    const lines = entries.map((e) => {
      const fields = Object.entries(e).map(([k, v]) => `${k}: ${value(v)}`);
      const line = `  { ${fields.join(", ")} },`;
      return line.length <= WIDTH
        ? line
        : `  {\n${fields.map((f) => `    ${f},`).join("\n")}\n  },`;
    });
    const file = `${HEAD}export default [\n${lines.join("\n")}\n];\n`;
    const href = URL.createObjectURL(new Blob([file], { type: "text/javascript" }));
    Object.assign(document.createElement("a"), { href, download: "placement-data.js" }).click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  const pointAt = (x, y) =>
    raycaster.setFromCamera(
      new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1),
      camera,
    );
  function itemAt(x, y) {
    const items = [...figures, ...labels.list().map((object) => ({ object, label: true }))];
    const objects = items.map(({ object }) => object);
    pointAt(x, y);
    let hit = raycaster.intersectObjects(objects)[0]?.object;
    while (hit && !objects.includes(hit)) hit = hit.parent;
    if (hit) return items[objects.indexOf(hit)];
    // Else the smallest figure whose box the ray crosses, so a group is picked anywhere within it.
    let best = null;
    let least = AREA;
    for (const item of figures) {
      const { x, z } = boxOf(item.object).getSize(size);
      const extent = Math.max(x, z);
      if (extent < least && raycaster.ray.intersectsBox(box)) [best, least] = [item, extent];
    }
    return best;
  }
  // Pressing a figure or label picks it and drags it over the ground.
  const level = new THREE.Plane();
  const onLevel = new THREE.Vector3();
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    down = null;
    if (!on || e.button !== 0 || gizmo.axis) return;
    const item = itemAt(e.clientX, e.clientY);
    if (!item) {
      down = { x: e.clientX, y: e.clientY };
      return;
    }
    if (item.object !== picked?.object) pick(item);
    level.set(new THREE.Vector3(0, 1, 0), -item.object.position.y);
    if (!raycaster.ray.intersectPlane(level, onLevel)) return;
    drag = { offset: item.object.position.clone().sub(onLevel), orbit: orbit.enabled };
    orbit.enabled = false;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    pointAt(e.clientX, e.clientY);
    if (!raycaster.ray.intersectPlane(level, onLevel)) return;
    const { object } = picked;
    object.position.x = onLevel.x + drag.offset.x;
    object.position.z = onLevel.z + drag.offset.z;
    if (picked.label) labels.settle(object);
  });
  addEventListener("pointerup", (e) => {
    if (drag) orbit.enabled = drag.orbit;
    drag = null;
    // A click beside picks the building, bridge or tree there, else lets go.
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= CLICK) {
      pointAt(down.x, down.y);
      const fixed = fixedAt(raycaster);
      pick(fixed && { ...fixed, fixed: true });
    }
    down = null;
  });
  // Keys as the graffiti editor's (src/sprayer.js): moving the one picked over the ground as it is
  // seen, NUDGE px of the screen where it is; turning a figure; SHIFT times as far with Shift.
  const [ahead, aside, UP] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(0, 1, 0)];
  addEventListener("keydown", (e) => {
    if (!picked) return;
    if (e.code === "Escape") return pick(null);
    if (picked.fixed) return;
    const { object } = picked;
    const [x, y] = MOVES[e.code] ?? [0, 0];
    const turn = picked.label ? 0 : TURNS[e.code];
    const times = e.shiftKey ? SHIFT : 1;
    if (x || y) {
      // The screen's right over the ground, and away from it (also looking straight down).
      aside.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
      ahead.crossVectors(UP, aside);
      const far = camera.position.distanceTo(object.position);
      const step =
        (NUDGE * times * 2 * far * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) /
        innerHeight;
      object.position.addScaledVector(aside, x * step).addScaledVector(ahead, y * step);
      if (picked.label) labels.settle(object);
    } else if (turn) object.rotation.y += THREE.MathUtils.degToRad(turn * times);
    else return;
    e.preventDefault();
  });

  return {
    mount(box) {
      const button = (parent, title, click) => {
        const b = parent.appendChild(Object.assign(document.createElement("button"), { title }));
        b.addEventListener("click", click);
        return b;
      };
      buttons = box.appendChild(
        Object.assign(document.createElement("div"), { className: "row tools" }),
      );
      for (const [name, m, icon] of TOOLS)
        button(buttons, name, () => use(m)).innerHTML =
          `<svg viewBox="0 0 24 24"><path d="${icon}"/></svg>`;
      const row = box.appendChild(
        Object.assign(document.createElement("div"), { className: "row" }),
      );
      button(row, "", save).textContent = "Save";
      button(
        row,
        "",
        () => confirm("Discard all unsaved changes?") && location.reload(),
      ).textContent = "Reset";
      show();
    },
    enable(turned) {
      on = turned;
      if (!on) pick(null);
    },
    active: () => on,
    // The frame round the picked one where it is now; after all that moves.
    update() {
      if (!picked) return;
      if (picked.fixed) box.copy(picked.box);
      frame.visible = !(picked.fixed ? box : boxOf(picked.object)).isEmpty();
      frame.position.copy(box.min);
      frame.scale.copy(box.getSize(size));
      if (!picked.tag) return;
      if (picked.fixed)
        box.getCenter(top).setY(box.max.y); // over its box's top middle
      else {
        // Just above the green arrow, the gizmo sized as it sizes itself.
        const position = spot.setFromMatrixPosition(picked.object.matrixWorld);
        const eye = top.setFromMatrixPosition(camera.matrixWorld).distanceTo(position);
        const fov = Math.min((1.9 * Math.tan((Math.PI * camera.fov) / 360)) / camera.zoom, 7);
        top.set(0, (ABOVE * eye * fov * gizmo.size) / 4, 0);
        top.applyQuaternion(picked.object.quaternion).add(position);
      }
      top.project(camera);
      tag.hidden = top.z > 1;
      const [x, y] = [((top.x + 1) / 2) * innerWidth, ((1 - top.y) / 2) * innerHeight];
      tag.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    },
  };
}
