// "Points panel" in the menu: while ticked, a panel at the left (below the Dev panel,
// src/dev.js, when both show) marks points on the scene with numbers. Record points: while
// recording, each click on the scene marks what is there; Undo takes back the last; Stop ends it.
// Paste points reads "latitude, longitude, altitude" lines from the clipboard (only over https or
// on localhost), marks them instead, numbered in their order, and moves the view to show them;
// other lines are skipped, and a clipboard without any keeps the marks. Copy points copies the
// marks as such lines. Unticking hides the marks. The tick and the marks are remembered in this
// browser.
import { copy } from "./copy.js";

const PANEL_KEY = "basel3d.pointsPanel"; // "1" (on) or "0"
const POINTS_KEY = "basel3d.points"; // the marks' lines, as Copy points copies them

// pointAt(x, y): the scene point at a screen point (px), or null; toText(point): its line;
// fromText(line): its point, or null; onScreen(point): { x, y, front }; show(points): moves the
// view to them (src/main.js).
export function createPoints(pointAt, toText, fromText, onScreen, show) {
  const box = document.getElementById("points-box");
  const layer = document.getElementById("badges");
  const panel = document
    .getElementById("panels")
    .appendChild(Object.assign(document.createElement("div"), { id: "points" }));
  const add = (textContent) =>
    panel.appendChild(Object.assign(document.createElement("button"), { textContent }));
  const paste = add("Paste points");
  const record = add("Record points");
  const undo = add("Undo");
  const copyAll = add("Copy points");
  const points = []; // { point, mark }
  let on = false;
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
  try {
    box.checked = localStorage.getItem(PANEL_KEY) === "1";
    (localStorage.getItem(POINTS_KEY) ?? "")
      .split("\n")
      .map(fromText)
      .filter(Boolean)
      .forEach(place);
  } catch {} // storage blocked
  // After each change: the panel while ticked; its buttons: while recording Stop and Undo, else
  // the others, Copy points disabled without marks; the tick and the marks stored.
  const sync = () => {
    panel.hidden = !box.checked;
    record.textContent = on ? "Stop" : "Record points";
    undo.hidden = !on;
    paste.hidden = copyAll.hidden = on;
    copyAll.disabled = !points.length;
    try {
      localStorage.setItem(PANEL_KEY, box.checked ? "1" : "0");
      localStorage.setItem(POINTS_KEY, lines());
    } catch {} // storage blocked
  };
  sync();

  box.addEventListener("change", sync);
  record.addEventListener("click", () => {
    on = !on;
    if (on) clear();
    sync();
  });
  undo.addEventListener("click", () => {
    points.pop()?.mark.remove();
    sync();
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

  return {
    // Marks the point at a click while recording; whether it did.
    click(x, y) {
      if (!on || panel.hidden) return false;
      const point = pointAt(x, y);
      if (point) place(point);
      sync();
      return true;
    },
    // Moves the marks to their points, after the camera's updateMatrixWorld.
    update() {
      for (const { point, mark } of points) {
        const { x, y, front } = onScreen(point);
        mark.hidden = !front || panel.hidden;
        mark.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
    },
  };
}
