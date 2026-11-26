// The Dev panel's Move, Rotate and Scale tools for figures and museum labels.
import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { toWGS84 } from "./geo.js";
import PLACEMENTS from "./placement-data.js";

const CLICK = 5; // px
const WIDTH = 100; // .prettierrc's printWidth
const HEAD = `// Written by the Move tool (src/placer.js). Figures: { figure, from, to: [latitude, longitude,
// metres above sea], heading, x, z }; a kind's one size: { figure, size }; labels: { label, at }.
`;
// [name, key, mode, SVG icon path]
const TOOLS = [
  [
    "Move",
    "KeyW",
    "translate",
    "M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3",
  ],
  [
    "Rotate",
    "KeyE",
    "rotate",
    "M19 9A8 8 0 0 0 5 8M5 3.5V8h4.5M5 15a8 8 0 0 0 14 1M19 20.5V16h-4.5",
  ],
  ["Scale", "KeyR", "scale", "M4 4h16v16H4zM8 16l8-8M11 8h5v5"],
];

export function createPlacer({ renderer, camera, orbit, scene, figures, labels }) {
  const canvas = renderer.domElement;
  const raycaster = new THREE.Raycaster();
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
      // The whole kind, city and museum, has one size.
      for (const figure of figures)
        if (figure.key.figure === picked.key.figure) figure.object.scale.copy(object.scale);
    }
  });

  function pick(item) {
    picked = item;
    show();
    if (!picked) {
      gizmo.detach();
      gizmo.getHelper().removeFromParent();
      return;
    }
    gizmo.setMode(picked.label ? "translate" : mode);
    gizmo.setSpace(picked.label ? "world" : "local");
    gizmo.showY = !picked.label;
    gizmo.attach(picked.object);
    scene.add(gizmo.getHelper());
  }
  function show() {
    if (!buttons) return;
    TOOLS.forEach(([, , m], k) => {
      const usable = picked && (!picked.label || m === "translate");
      buttons.children[k].disabled = !usable;
      buttons.children[k].ariaPressed = usable && (picked.label || m === mode);
    });
  }
  function use(m) {
    if (!picked || (picked.label && m !== "translate")) return;
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
      const { position, quaternion, rotation, scale, userData } = item.object;
      const made = item.made ?? { position: userData.made, quaternion, scale };
      if (!item.label && !scale.equals(made.scale)) sizes.set(item.key.figure, round(scale.x, 3));
      if (position.equals(made.position) && quaternion.equals(made.quaternion)) continue;
      const [lat, lon] = toWGS84(position.x, position.z).map((v) => round(v, 6));
      let entry, match;
      if (item.label) {
        const label = userData.text.split(" ")[0];
        [entry, match] = [{ label, at: [lat, lon] }, (e) => e.label === label];
      } else {
        const { figure, from } = item.key;
        const [x, z] = [round(rotation.x, 3), round(rotation.z, 3)];
        entry = {
          ...item.key,
          to: [lat, lon, round(position.y + 250, 1)],
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
    return hit ? items[objects.indexOf(hit)] : null;
  }
  // Pressing a figure or label picks it and drags it over the ground; a click beside lets go.
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
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= CLICK) pick(null);
    down = null;
  });
  addEventListener("keydown", (e) => {
    if (!picked) return;
    if (e.code === "Escape") return pick(null);
    const tool = TOOLS.find(([, key]) => key === e.code);
    if (tool) use(tool[2]);
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
      for (const [name, key, m, icon] of TOOLS)
        button(buttons, `${name} (${key.slice(3)})`, () => use(m)).innerHTML =
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
  };
}
