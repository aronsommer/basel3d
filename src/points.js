// "Points" in the menu: while ticked, a panel at the left (below the Dev panel,
// src/dev.js, when both show) marks points on the scene with numbers. Add points (Edit points once
// marked): while editing, each click on the scene marks what is there, after the marks so far;
// one on a mark picks it (magenta, saying how to go on), and then one on the scene moves it there,
// one on it again, on what it says or Esc drops the pick; Delete last removes the last, or the
// pick (then named by its number), numbering those after it anew; Done ends it. Clear points
// removes all marks. While Line is ticked, a line joins the marks in their order.
// Paste points reads "latitude, longitude, altitude" lines from the clipboard (only over https or
// on localhost), marks them instead, numbered in their order, and moves the view to show them;
// other lines are skipped, and a clipboard without any keeps the marks. Copy points copies the
// marks as such lines. Unticking hides the marks and line. The tick and the marks, not Line, are
// remembered in this browser. Apart from the panel, the quick copy (src/main.js: C, a right click,
// a held finger), but while editing, copies one such line and pins its spot with a mark without
// a number, "Coordinates copied" above it ("Release to copy" while a finger is held), until the
// next press.
import { copy } from "./copy.js";
import { checkLines } from "./lines.js";

const PANEL_KEY = "basel3d.pointsPanel"; // "1" (on) or "0"
const POINTS_KEY = "basel3d.points"; // the marks' lines, as Copy points copies them
export const TIP = 11 * Math.SQRT2; // px from a mark's middle down to its tip, on its point (style.css)
const HIT = 16; // px from a mark's middle a click picks it within

// Shows a mark with its tip at x, y while inside (onScreen), else hides it.
export function moveMark(mark, { x, y, inside }) {
  if (mark.hidden === inside) mark.hidden = !inside;
  if (!inside) return;
  mark.style.transform = `translate(${x}px, ${y - TIP}px) translate(-50%, -50%)`;
  mark.at = [x, y]; // for the names to keep clear of (src/main.js, updateNames)
}

// pointAt(x, y): the scene point at a screen point (px), or null; toText(point): its line;
// fromText(line): its point, or null; onScreen(point): { x, y, inside }; show(points): moves the
// view to them; overlay: the scene the line is drawn in; started(): called when editing starts
// (src/main.js).
export function createPoints(pointAt, toText, fromText, onScreen, show, overlay, started) {
  const box = document.getElementById("points-box");
  const layer = document.getElementById("badges");
  const panel = document
    .getElementById("panels")
    .appendChild(Object.assign(document.createElement("div"), { id: "points" }));
  const add = (textContent) =>
    panel.appendChild(Object.assign(document.createElement("button"), { textContent }));
  const edit = add(""); // named by sync
  const paste = add("Paste points");
  const deleteLast = add("Delete last");
  const copyAll = add("Copy points");
  const clearAll = add("Clear points");
  const label = panel.appendChild(document.createElement("label"));
  const lineBox = label.appendChild(
    Object.assign(document.createElement("input"), { type: "checkbox" }),
  );
  label.append("Line");
  const points = []; // { point, mark }
  let on = false;
  let route = null; // the line joining the marks, if shown
  let picked = null; // the entry in points picked to move or remove
  // Picks an entry (null: none), its mark magenta with the hint above it, as the quick copy's text,
  // Delete last named by its number.
  const hint = document.createElement("span");
  hint.append("Tap elsewhere to move", document.createElement("br"), "Tap here to cancel");
  const pick = (entry) => {
    picked?.mark.classList.remove("picked");
    picked = entry;
    deleteLast.textContent = entry ? `Delete ${points.indexOf(entry) + 1}` : "Delete last";
    if (!entry) return hint.remove();
    entry.mark.classList.add("picked");
    entry.mark.append(hint);
  };
  const clear = () => points.splice(0).forEach(({ mark }) => mark.remove());
  const place = (point) =>
    points.push({
      point,
      mark: layer.appendChild(
        Object.assign(document.createElement("div"), {
          textContent: points.length + 1,
          className: "mark",
        }),
      ),
    });
  const lines = () => points.map(({ point }) => toText(point)).join("\n");
  // The quick copy's pin, its text above it.
  const spot = layer.appendChild(
    Object.assign(document.createElement("div"), { className: "mark spot", hidden: true }),
  );
  const said = spot.appendChild(document.createElement("span"));
  let spotPoint = null; // the point pinned
  const pin = (point, text = "") => {
    spotPoint = point;
    said.textContent = text;
    moveMark(spot, onScreen(point));
    return point;
  };
  const unpin = () => {
    spotPoint = null;
    spot.hidden = true;
  };
  const copyPoint = (point) => {
    if (spotPoint !== point) pin(point);
    copy(toText(point)).then((done) => {
      if (spotPoint !== point) return; // unpinned or pinned elsewhere meanwhile
      if (done) said.textContent = "Coordinates copied";
      else unpin(); // not allowed: nothing to show
    });
  };
  try {
    box.checked = localStorage.getItem(PANEL_KEY) === "1";
    (localStorage.getItem(POINTS_KEY) ?? "")
      .split("\n")
      .map(fromText)
      .filter(Boolean)
      .forEach(place);
  } catch {} // storage blocked
  // After each change: the panel while ticked; its buttons: Add, Edit points or Done; Delete last
  // while editing, else Paste points; Delete last, Copy and Clear points disabled without marks;
  // the marks hidden while unticked (update shows them), their numbers smaller from 100 marks on
  // (style.css); the line rebuilt while it and Line are ticked; the pick dropped unless editing and
  // still marked; the tick and the marks stored, unless store is false.
  const sync = (store = true) => {
    panel.hidden = !box.checked;
    if (picked && !(on && !panel.hidden && points.includes(picked))) pick(null);
    if (route) {
      overlay.remove(route);
      route.geometry.dispose();
      route.material.dispose();
      route = null;
    }
    if (points.length > 1 && !panel.hidden && lineBox.checked) {
      route = checkLines(
        points.slice(1).flatMap(({ point: b }, i) => {
          const a = points[i].point;
          return [a.x, a.y, a.z, b.x, b.y, b.z];
        }),
      );
      overlay.add(route);
    }
    layer.classList.toggle("long", points.length >= 100);
    if (panel.hidden) for (const { mark } of points) mark.hidden = true;
    edit.textContent = on ? "Done" : points.length ? "Edit points" : "Add points";
    deleteLast.hidden = !on;
    paste.hidden = on;
    deleteLast.disabled = copyAll.disabled = clearAll.disabled = !points.length;
    if (!store) return;
    try {
      localStorage.setItem(PANEL_KEY, box.checked ? "1" : "0");
      localStorage.setItem(POINTS_KEY, lines());
    } catch {} // storage blocked
  };
  sync(false); // nothing stored before a change

  box.addEventListener("change", () => sync());
  lineBox.addEventListener("change", () => sync(false)); // nothing stored changes
  edit.addEventListener("click", () => {
    on = !on;
    if (on) started();
    sync();
  });
  deleteLast.addEventListener("click", () => {
    const at = picked ? points.indexOf(picked) : points.length - 1; // disabled without marks
    points.splice(at, 1)[0].mark.remove(); // the pick: sync drops it
    for (let i = at; i < points.length; i++) points[i].mark.textContent = i + 1;
    sync();
  });
  addEventListener("keydown", (e) => {
    if (e.code === "Escape" && picked) pick(null);
  });
  paste.addEventListener("click", () =>
    navigator.clipboard?.readText().then(
      (text) => {
        const pasted = text.split("\n").map(fromText).filter(Boolean);
        if (!pasted.length) return;
        clear();
        pasted.forEach(place);
        sync();
        show(pasted);
      },
      () => {}, // not allowed
    ),
  );
  copyAll.addEventListener("click", () =>
    copy(lines()).then((done) => {
      if (!done) return;
      copyAll.textContent = "Copied";
      setTimeout(() => (copyAll.textContent = "Copy points"), 1500);
    }),
  );
  clearAll.addEventListener("click", () => {
    clear();
    sync();
  });

  const editing = () => on && !panel.hidden;
  return {
    // Whether clicks mark points now.
    editing,
    // Ends editing, if on.
    stop() {
      if (!on) return;
      on = false;
      sync();
    },
    // While editing, on the pick or its hint (over all marks, style.css): drops the pick; on
    // another mark (the top one): picks it; elsewhere: moves the pick there, or marks the point
    // there; whether editing.
    click(x, y) {
      if (!editing()) return false;
      const near = ({ mark }) =>
        !mark.hidden && Math.hypot(mark.at[0] - x, mark.at[1] - TIP - y) < HIT;
      if (picked) {
        const { left, right, top, bottom } = hint.getBoundingClientRect();
        if (near(picked) || (x >= left && x <= right && y >= top && y <= bottom)) {
          pick(null);
          return true;
        }
      }
      const hit = points.findLastIndex(near);
      if (hit >= 0) {
        pick(points[hit]);
        return true;
      }
      const point = pointAt(x, y);
      if (!point) return true;
      if (!picked) place(point);
      else {
        picked.point = point;
        pick(null);
      }
      sync();
      return true;
    },
    // Pins the point at a screen point (px) without copying, saying "Release to copy"; it, or
    // null (also while editing).
    pinAt(x, y) {
      if (editing()) return null;
      const point = pointAt(x, y);
      return point && pin(point, "Release to copy");
    },
    // Copies the point's line and pins it, if not pinned already.
    copyPoint,
    // Copies the line of the point at a screen point (px) and pins it, if any, but while editing.
    copyAt(x, y) {
      if (editing()) return;
      const point = pointAt(x, y);
      if (point) copyPoint(point);
    },
    unpin,
    // Moves the pin and the marks to their points, after the camera's updateMatrixWorld; the
    // marks not while unticked.
    update() {
      if (spotPoint) moveMark(spot, onScreen(spotPoint));
      if (panel.hidden) return;
      for (const { point, mark } of points) moveMark(mark, onScreen(point));
    },
  };
}
