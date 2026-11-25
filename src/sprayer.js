// The graffiti editor, "Graffiti" in the Dev panel (src/dev.js): while ticked, a click on a
// graffito (src/graffiti.js), not behind a building, picks it, framed in MAGENTA with a dot at each
// corner; dragging it moves it, dragging a dot turns and sizes it round its middle. New puts a tag,
// picked, in the middle of the view, facing the camera, NEW as wide as it is far; it lies on
// nothing till dragged. Any one moved or changed goes over all others. Dragged, each lies on the
// side seen of what is there, a wall, roof, bridge or the ground (lay): upright on a wall,
// elsewhere keeping the way it pointed, at first the screen's top (surfaceAt), so moving it turns
// it not; let go, it stands before the highest of what is behind it (settle). Its panel sets the
// one picked's text (a line each), its style (STYLES, as tiles; a tag's colour too) and its size (a
// slider in the middle, up to SCALE times either way); Delete (or Del) takes it away. The arrows or
// WASD move it along its text and across it, as it lies, as far as NUDGE px of the screen there,
// Q/E turn it a degree to the left or right, SHIFT times as far with Shift, Escape or a click
// beside them lets it go. Save downloads src/graffiti-data.js with every graffito as it is now, to
// put in place of the old one; Reset, asked, loads the page anew without what is unsaved. Clicks on
// the scene do nothing else meanwhile (active).
import * as THREE from "three";
import { toWGS84 } from "./geo.js";
import { MAGENTA } from "./lines.js";
import {
  STYLES,
  artOf,
  graffitoMesh,
  lay,
  orientationOf,
  paintOn,
  placeOf,
  styled,
} from "./graffiti.js";

const NUDGE = 8; // px of the screen a key moves the one picked, SHIFT times as far with Shift
const SHIFT = 5; // times as far or round with Shift
const SAMPLE = "STYLE"; // a new one's text, and the style tiles'
// Keys moving the one picked: along its text and across it.
const MOVES = {
  ArrowUp: [0, 1],
  KeyW: [0, 1],
  ArrowDown: [0, -1],
  KeyS: [0, -1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};
const FLAT = 0.999; // of a face's normal's height: as flat as that, it counts as level
const WALL = 0.3; // of a face's normal's height: below that, a wall, a graffito on it upright
const GRAB = 14; // px from a corner's dot, pressing turns the one picked
// Its plane's corners (lay), where the dots are.
const CORNERS = [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0];
const NEW = 0.15; // a new one's width per metre from the camera
const AHEAD = 0.9; // of the way to what is in the middle of the view, a new one floats
const SCALE = 10; // the size slider's ends: so many times smaller or bigger than at its middle
// The fields of a graffito's entry (src/graffiti-data.js) that are not its look.
const OTHER = new Set(["text", "style", "location", "facing", "lean", "width", "tilt"]);
// The head of src/graffiti-data.js, as Save writes it.
const HEAD = `// Every graffito placed with the graffiti editor (src/sprayer.js), which saves this file whole: per
// graffito its text, style (its number in src/graffiti.js, STYLES), location (latitude, longitude,
// metres above sea of its middle), facing (compass degrees it faces, 0 north), lean (degrees its
// face looks up: 0 on a wall, 90 lying flat), width (metres), tilt (degrees turned to the left) and
// any of its look it has other than its style's.
`;
// The look's fields holding colours (0xrrggbb), written so.
const COLOURS = new Set(["plain", "outline", "face", "faces", "letters", "ink", "back", "stripes"]);
const WIDTH = 100; // .prettierrc's printWidth

// A value as JavaScript on one line, as Prettier writes it: numbers under a colour's name as
// 0xrrggbb, a string in the quotes needing fewer escapes (double if as few).
function js(value, colour = false) {
  if (Array.isArray(value)) return `[${value.map((v) => js(v, colour)).join(", ")}]`;
  if (value && typeof value === "object") {
    const fields = Object.entries(value).map(
      ([k, v]) => `${k}: ${js(v, colour || COLOURS.has(k))}`,
    );
    return fields.length ? `{ ${fields.join(", ")} }` : "{}";
  }
  if (typeof value === "number" && colour) return `0x${value.toString(16).padStart(6, "0")}`;
  // In single quotes if it holds more double ones than single ones.
  const count = (mark) => (typeof value === "string" ? value.split(mark).length - 1 : 0);
  if (count('"') > count("'")) {
    const inner = JSON.stringify(value).slice(1, -1).replaceAll('\\"', '"');
    return `'${inner.replaceAll("'", "\\'")}'`;
  }
  return JSON.stringify(value);
}
// Whether Prettier breaks this array however short: of more than one, each an array (or each an
// object) of more than one.
const matrix = (value) =>
  Array.isArray(value) &&
  value.length > 1 &&
  value.every(
    (v) =>
      v &&
      typeof v === "object" &&
      Array.isArray(v) === Array.isArray(value[0]) &&
      Object.keys(v).length > 1,
  );
// head, value and end on one line at indent spaces as Prettier lays them out: so if it fits in
// WIDTH (and is no matrix), else value broken, an array of numbers filled line by line, any other
// an item or field a line.
function laid(head, value, indent, colour, end) {
  const pad = " ".repeat(indent);
  const line = `${pad}${head}${js(value, colour)}${end}`;
  if ((line.length <= WIDTH && !matrix(value)) || !value || typeof value !== "object") return line;
  const inner = " ".repeat(indent + 2);
  let items;
  if (Array.isArray(value) && value.every((v) => typeof v === "number")) {
    items = [""];
    for (const item of value.map((v) => js(v, colour))) {
      const next = items.at(-1) ? `${items.at(-1)}, ${item}` : item;
      if (items.at(-1) && `${inner}${next},`.length > WIDTH) items.push(item);
      else items[items.length - 1] = next;
    }
    items = items.map((item) => `${inner}${item},`);
  } else if (Array.isArray(value)) items = value.map((v) => laid("", v, indent + 2, colour, ","));
  else
    items = Object.entries(value).map(([k, v]) =>
      laid(`${k}: `, v, indent + 2, colour || COLOURS.has(k), ","),
    );
  const [open, close] = Array.isArray(value) ? "[]" : "{}";
  return `${pad}${head}${open}\n${items.join("\n")}\n${pad}${close}${end}`;
}
// src/graffiti-data.js with these entries, as Prettier writes it.
export const fileOf = (entries) => `${HEAD}${laid("export default ", entries, 0, false, ";")}\n`;

// scene: where new ones go; surfaces: what they may lie on (the buildings', bridges' and terrain's
// objects); meshes(): the graffiti's meshes (createGraffiti), new ones added to it. Returns {
// move(on, box): ticks or unticks it, its panel in box (an element); active(): whether ticked }.
export function createSprayer({ renderer, camera, orbit, scene, surfaces, meshes }) {
  const raycaster = new THREE.Raycaster();
  const canvas = renderer.domElement;
  let state = null; // while ticked: { picked, place, drag }
  let ui = null; // the panel's elements, made once
  // Round the one picked, as its plane (lay) is: a child of it.
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)),
    new THREE.LineBasicMaterial({ color: MAGENTA, depthTest: false }),
  );
  frame.renderOrder = 1e9; // over every graffito (their renderOrder)
  // A dot at each corner, to turn it by.
  const dots = new THREE.Points(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(CORNERS, 3),
    ),
    new THREE.PointsMaterial({
      color: MAGENTA,
      size: 10,
      sizeAttenuation: false,
      depthTest: false,
    }),
  );
  dots.renderOrder = 1e9;
  frame.add(dots);

  const rayAt = (x, y) =>
    raycaster.setFromCamera(
      new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1),
      camera,
    );
  // The side seen of what is at a screen point (surfaces): { point, n, up } as lay takes them, or
  // null under an overhang or where nothing is. up: on a wall straight up; else was (the up it had)
  // laid on it, so it does not turn, if that is not across it; else the screen's top laid on it (so
  // not up each slope of a rippled roof), else up the slope.
  function surfaceAt(x, y, was) {
    rayAt(x, y);
    const hit = raycaster.intersectObjects(surfaces)[0];
    if (!hit?.face) return null;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (n.dot(raycaster.ray.direction) > 0) n.negate();
    if (n.y < -0.2) return null;
    if (n.y > FLAT) n.set(0, 1, 0);
    const onto = (v) => v.addScaledVector(n, -v.dot(n));
    let up = onto(new THREE.Vector3(0, 1, 0));
    const top = onto(new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion));
    if (n.y >= WALL && was && onto(was.clone()).length() > WALL) up = onto(was.clone());
    else if (n.y >= WALL && top.length() > WALL) up = top;
    return { point: hit.point, n, up: up.normalize(), on: hit.object };
  }

  // What a graffito is, to change: { style, text, own } (own: its fields over its style's look),
  // its entry's or, if new, its own.
  function editOf(mesh) {
    if (mesh.userData.edit) return mesh.userData.edit;
    const entry = mesh.userData.graffito;
    const look = Object.fromEntries(Object.entries(entry).filter(([k]) => !OTHER.has(k)));
    const { style, text } = entry;
    return (mesh.userData.edit = { style, text, own: look });
  }
  // Picks a graffito, or none; its place with what it lies on (on: what is just behind its middle,
  // if anything), so settling looks there alone.
  function pick(mesh) {
    if (mesh) mesh.add(frame);
    else frame.removeFromParent();
    state.picked = mesh;
    state.place = mesh && placeOf(mesh);
    if (mesh) {
      const { at, n } = state.place;
      probe.set(at.clone().addScaledVector(n, REACH), n.clone().negate());
      probe.far = 2 * REACH;
      state.place.on = probe.intersectObjects(surfaces)[0]?.object;
    }
    show();
  }
  // Lays the one picked at its place again, over all others: drawn last (renderOrder) and last in
  // meshes(), so saved last too.
  function relay() {
    const { picked, place } = state;
    lay(picked, picked.userData.aspect, place.at, place.n, place.up, place.width, place.tilt);
    picked.material.depthTest = !picked.userData.floating; // over all while on nothing
    const all = meshes();
    const top = Math.max(0, ...all.filter((m) => m !== picked).map((m) => m.renderOrder));
    if (picked.renderOrder <= top) picked.renderOrder = top + 1;
    if (all.at(-1) !== picked) all.push(...all.splice(all.indexOf(picked), 1));
    show();
  }
  // Paints the one picked anew as its edit says, as wide as before.
  function repaint() {
    const { picked } = state;
    const { style, text, own } = editOf(picked);
    paintOn(picked, ...styled(style, { ...own, text }));
    relay();
    settle();
  }
  // Moves the one picked out along its normal till nothing behind it (SETTLE × SETTLE points across
  // it, each looked for within REACH m along its normal on what it was dragged onto, place.on, else
  // on all surfaces) stands out through it, as a bay of a wall or a bump of a roof, or back onto the
  // highest; it does not tilt.
  const [SETTLE, REACH] = [4, 2];
  const [probe, side, top, back] = [
    new THREE.Raycaster(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  function settle() {
    const { picked, place } = state;
    if (!picked) return;
    const { at, n, up, width, tilt } = place;
    const turn = THREE.MathUtils.degToRad(tilt);
    side.crossVectors(up, n).applyAxisAngle(n, turn);
    top.copy(up).applyAxisAngle(n, turn);
    back.copy(n).negate();
    const high = width / picked.userData.aspect;
    let out = -Infinity; // the highest under it, metres out of it
    for (let i = 0; i < SETTLE; i++)
      for (let j = 0; j < SETTLE; j++) {
        const [a, b] = [(i / (SETTLE - 1) - 0.5) * width, (j / (SETTLE - 1) - 0.5) * high];
        probe.set(
          at.clone().addScaledVector(side, a).addScaledVector(top, b).addScaledVector(n, REACH),
          back,
        );
        probe.far = 2 * REACH;
        const hit = probe.intersectObjects(place.on ? [place.on] : surfaces)[0];
        if (hit) out = Math.max(out, REACH - hit.distance);
      }
    if (out === -Infinity) return;
    at.addScaledVector(n, out);
    relay();
  }
  // A new tag, picked, in the middle of the view, as far as the view's centre (orbit.target) but
  // before anything nearer there (AHEAD of the way to it), facing the camera upright on the
  // screen, NEW as wide as it is far; it lies on nothing, drawn over all (floating), till it is
  // dragged (follow).
  function spray() {
    const edit = { style: 1, text: SAMPLE, own: {} }; // a tag
    const mesh = graffitoMesh(...styled(edit.style, { text: edit.text }));
    Object.assign(mesh.userData, { edit, tilt: 0, floating: true });
    rayAt(innerWidth / 2, innerHeight / 2);
    const nearer = raycaster.intersectObjects(surfaces)[0]?.distance ?? Infinity;
    const far = Math.min(camera.position.distanceTo(orbit.target), AHEAD * nearer);
    const n = camera.getWorldDirection(new THREE.Vector3()).negate();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const at = camera.position.clone().addScaledVector(n, -far);
    lay(mesh, mesh.userData.aspect, at, n, up, NEW * far);
    scene.add(mesh);
    meshes().push(mesh);
    pick(mesh);
    relay(); // over all others
  }
  // Lays the one picked on what is at a screen point, if anything.
  function follow(x, y) {
    const { place } = state;
    const under = surfaceAt(x, y, place.up);
    if (!under) return;
    [place.at, place.n, place.up, place.on] = [under.point, under.n, under.up, under.on];
    state.picked.userData.floating = false;
    relay();
  }
  // Takes the one picked away.
  function remove() {
    const mesh = state.picked;
    if (!mesh) return;
    pick(null);
    scene.remove(mesh);
    meshes().splice(meshes().indexOf(mesh), 1);
    mesh.material.map?.dispose();
    mesh.material.dispose();
  }

  // A graffito's entry in src/graffiti-data.js, where it lies now.
  function entryOf(mesh) {
    const { style, text, own } = editOf(mesh);
    const { at, n, up, width, tilt } = placeOf(mesh);
    const [lat, lon] = toWGS84(at.x, at.z);
    const turned = orientationOf(n, up, tilt);
    const round = (value, digits) => Number(value.toFixed(digits));
    return {
      text,
      style,
      location: [round(lat, 7), round(lon, 7), round(at.y + 250, 2)],
      facing: round(turned.facing, 2),
      lean: round(turned.lean, 2),
      width: round(width, 2),
      tilt: round(turned.tilt, 2),
      ...own,
    };
  }
  // Downloads src/graffiti-data.js anew with every graffito as it is now.
  function save() {
    const file = fileOf(meshes().map(entryOf));
    const href = URL.createObjectURL(new Blob([file], { type: "text/javascript" }));
    Object.assign(document.createElement("a"), { href, download: "graffiti-data.js" }).click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  // The panel, always alike: New and Delete, text, the styles as tiles (each SAMPLE painted at
  // TILE px, one a task, its number left of it), a tag's colour and size; what changes the one
  // picked off while none is.
  const TILE = 40;
  function makePanel(box) {
    const make = (parent, tag, properties = {}) =>
      parent.appendChild(Object.assign(document.createElement(tag), properties));
    const buttons = make(box, "div", { className: "row" });
    const add = make(buttons, "button", { textContent: "New" });
    const drop = make(buttons, "button", { textContent: "Delete" });
    const keep = make(buttons, "button", { textContent: "Save" });
    const reset = make(buttons, "button", { textContent: "Reset" });
    const text = make(box, "textarea", { rows: 2, placeholder: "Text" });
    const grid = make(box, "div", { className: "styles" });
    // Each with its number left of it.
    const tiles = STYLES.map((_, k) => {
      const cell = make(grid, "div");
      make(cell, "span", { textContent: k + 1 });
      return make(cell, "button");
    });
    (async () => {
      for (const [k, { kind, look }] of STYLES.entries()) {
        tiles[k].append(artOf(kind, { ...look, text: SAMPLE }, TILE));
        await new Promise((go) => setTimeout(go));
      }
    })();
    const tag = make(box, "div", { className: "row" });
    tag.append("Tag color");
    const colour = make(tag, "input", { type: "color" });
    const size = make(box, "div", { className: "row" });
    size.append("Size");
    const sizer = make(size, "input", { type: "range", min: 0, max: 1, step: 0.001, value: 0.5 });
    // Typing here moves nothing and copies nothing.
    box.addEventListener("keydown", (e) => e.stopPropagation());
    let typing = 0; // timeout: repainted a moment after the last key
    text.addEventListener("input", () => {
      editOf(state.picked).text = text.value.toUpperCase(); // the fonts' capitals
      clearTimeout(typing);
      typing = setTimeout(() => state?.picked && repaint(), 200);
    });
    tiles.forEach((tile, k) =>
      tile.addEventListener("click", () => {
        Object.assign(editOf(state.picked), { style: k + 1, own: {} });
        repaint();
      }),
    );
    colour.addEventListener("input", () => {
      editOf(state.picked).own.plain = parseInt(colour.value.slice(1), 16);
      repaint();
    });
    // From its middle, as wide as when the slider was taken (from) times up to SCALE either way;
    // let go, back in the middle.
    let from = null;
    sizer.addEventListener("input", () => {
      from ??= state.place.width;
      state.place.width = from * SCALE ** (2 * sizer.valueAsNumber - 1);
      relay();
    });
    sizer.addEventListener("change", () => {
      from = null;
      sizer.value = 0.5;
      settle();
    });
    add.addEventListener("click", spray);
    drop.addEventListener("click", remove);
    keep.addEventListener("click", save);
    // The page loads anew, so src/graffiti-data.js as it is.
    reset.addEventListener("click", () => {
      if (confirm("Discard all unsaved changes?")) location.reload();
    });
    return { text, tiles, colour, sizer, drop };
  }
  // The panel as for the one picked, if any.
  function show() {
    const { picked, place } = state;
    const { text, tiles, colour, sizer, drop } = ui;
    for (const field of [text, ...tiles, colour, sizer, drop]) field.disabled = !picked;
    if (!picked) {
      text.value = "";
      for (const tile of tiles) tile.classList.remove("on");
      return;
    }
    const edit = editOf(picked);
    if (document.activeElement !== text) text.value = edit.text;
    // Its style framed; a tag's colour its own, else its style's.
    const { look } = STYLES[edit.style - 1];
    tiles.forEach((tile, k) => tile.classList.toggle("on", k === edit.style - 1));
    colour.disabled = look.plain === undefined;
    colour.value = `#${(edit.own.plain ?? look.plain ?? 0).toString(16).padStart(6, "0")}`;
  }

  // Turns and sizes the one picked as its corner grabbed (turn) is dragged round its middle, in its
  // plane: as far round, as many times as wide as it is from the middle.
  const [plane, onPlane, right] = [new THREE.Plane(), new THREE.Vector3(), new THREE.Vector3()];
  // Where a screen point is round the one picked's middle, in its plane: { angle, far }.
  function roundAt(x, y) {
    const { at, n, up } = state.place;
    rayAt(x, y);
    plane.setFromNormalAndCoplanarPoint(n, at);
    if (!raycaster.ray.intersectPlane(plane, onPlane)) return null;
    onPlane.sub(at);
    const angle = Math.atan2(onPlane.dot(up), onPlane.dot(right.crossVectors(up, n)));
    return { angle, far: onPlane.length() };
  }
  function turnTo(x, y) {
    const now = roundAt(x, y);
    if (!now) return;
    const { from, tilt, width } = state.drag.turn;
    state.place.tilt = Number((tilt + THREE.MathUtils.radToDeg(now.angle - from.angle)).toFixed(1));
    state.place.width = (width * now.far) / from.far;
    relay();
  }
  // Whether a screen point is within GRAB px of a corner's dot of the one picked.
  const corner = new THREE.Vector3();
  function onCorner(x, y) {
    const { picked } = state;
    if (!picked) return false;
    for (let i = 0; i < CORNERS.length; i += 3) {
      corner.fromArray(CORNERS, i).applyMatrix4(picked.matrixWorld).project(camera);
      const [cx, cy] = [((corner.x + 1) / 2) * innerWidth, ((1 - corner.y) / 2) * innerHeight];
      if (corner.z < 1 && Math.hypot(cx - x, cy - y) < GRAB) return true;
    }
    return false;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!state || e.button !== 0) return;
    if (onCorner(e.clientX, e.clientY)) {
      const from = roundAt(e.clientX, e.clientY);
      if (!from?.far) return;
      const { tilt, width } = state.place;
      state.drag = {
        orbit: orbit.enabled,
        x: e.clientX,
        y: e.clientY,
        turn: { from, tilt, width },
      };
      orbit.enabled = false;
      return;
    }
    rayAt(e.clientX, e.clientY);
    const hit = raycaster.intersectObjects(
      meshes().filter((m) => m.visible),
      false,
    )[0]; // not frame
    // None behind a building or bridge (a graffito stands at most 3 m before its wall).
    const before = hit && raycaster.intersectObjects(surfaces)[0];
    if (!hit || before?.distance < hit.distance - 3)
      return (missed = { x: e.clientX, y: e.clientY });
    pick(hit.object);
    state.drag = { orbit: orbit.enabled, x: e.clientX, y: e.clientY };
    orbit.enabled = false;
  });
  // The one dragged follows the pointer, once a frame; only once CLICK px from where the button
  // went down.
  let slid = null; // the last pointermove since
  canvas.addEventListener("pointermove", (e) => {
    const drag = state?.drag;
    if (!drag || (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < CLICK))
      return;
    const waiting = slid;
    slid = e;
    if (waiting) return;
    requestAnimationFrame(() => {
      if (state?.drag) state.drag.moved = true;
      if (state?.drag?.turn) turnTo(slid.clientX, slid.clientY);
      else if (state?.drag) follow(slid.clientX, slid.clientY);
      slid = null;
    });
  });
  // A click beside every graffito (the button let go within CLICK px of where it went down) lets
  // the one picked go; dragging the view does not.
  const CLICK = 5; // px
  let missed = null; // where the button went down beside them
  canvas.addEventListener("pointerup", (e) => {
    if (state && missed && Math.hypot(e.clientX - missed.x, e.clientY - missed.y) < CLICK)
      pick(null);
    missed = null;
  });
  // Settles the one picked if it moved (not just picked).
  const letGo = () => {
    if (!state?.drag) return;
    const { orbit: on, moved } = state.drag;
    orbit.enabled = on;
    state.drag = null;
    if (moved) settle();
  };
  addEventListener("pointerup", letGo);
  addEventListener("keydown", (e) => {
    if (!state?.picked) return;
    if (["Delete", "Backspace"].includes(e.code) && !e.repeat) return remove();
    if (e.code === "Escape") return pick(null);
    const { place } = state;
    const [x, y] = MOVES[e.code] ?? [0, 0];
    const turn = { KeyQ: 1, KeyE: -1 }[e.code];
    const times = e.shiftKey ? SHIFT : 1;
    if (x || y) {
      // Its own way: along its text and across it, as it lies, however it is seen; NUDGE px of the
      // screen where it is.
      const { quaternion } = state.picked;
      const far = camera.position.distanceTo(place.at);
      const px = (2 * far * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / innerHeight;
      const step = NUDGE * times * px;
      place.at.addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion), x * step);
      place.at.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion), y * step);
      relay();
    } else if (turn) {
      place.tilt += turn * times;
      relay();
    } else return;
    e.preventDefault();
    settle();
  });

  return {
    move(on, box) {
      if (on) {
        ui ??= makePanel(box);
        state = { picked: null, place: null, drag: null };
        return show();
      }
      if (!state) return; // not ticked before
      letGo();
      pick(null);
      state = null;
    },
    active: () => state !== null,
  };
}
