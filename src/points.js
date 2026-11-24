// "Points" in the menu: while ticked, a panel at the left (below the Dev panel,
// src/dev.js, when both show) marks points on the scene with numbers. Record points: while
// recording, each click on the scene marks what is there, after the marks so far; Delete last
// removes the last; Done ends it. Clear points removes all marks.
// Paste points reads "latitude, longitude, altitude" lines from the clipboard (only over https or
// on localhost), marks them instead, numbered in their order, and moves the view to show them;
// other lines are skipped, and a clipboard without any keeps the marks. Copy points copies the
// marks as such lines. Unticking hides the marks. The tick and the marks are remembered in this
// browser.
import { copy } from "./copy.js";

const PANEL_KEY = "basel3d.pointsPanel"; // "1" (on) or "0"
const POINTS_KEY = "basel3d.points"; // the marks' lines, as Copy points copies them
export const TIP = 11 * Math.SQRT2; // px from a mark's middle down to its tip, on its point (style.css)

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
  const record = add("Record points");
  const paste = add("Paste points");
  const deleteLast = add("Delete last");
  const copyAll = add("Copy points");
  const clearAll = add("Clear points");
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
  // After each change: the panel while ticked; its buttons: Delete last while recording, else
  // Paste points; Delete last, Copy and Clear points disabled without marks; the marks hidden while
  // unticked (update shows them); the tick and the marks stored.
  const sync = () => {
    panel.hidden = !box.checked;
    if (panel.hidden) for (const { mark } of points) mark.hidden = true;
    record.textContent = on ? "Done" : "Record points";
    deleteLast.hidden = !on;
    paste.hidden = on;
    deleteLast.disabled = copyAll.disabled = clearAll.disabled = !points.length;
    try {
      localStorage.setItem(PANEL_KEY, box.checked ? "1" : "0");
      localStorage.setItem(POINTS_KEY, lines());
    } catch {} // storage blocked
  };
  sync();

  box.addEventListener("change", sync);
  record.addEventListener("click", () => {
    on = !on;
    sync();
  });
  deleteLast.addEventListener("click", () => {
    points.pop().mark.remove(); // disabled without marks
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
  clearAll.addEventListener("click", () => {
    clear();
    sync();
  });

  const recording = () => on && !panel.hidden;
  return {
    // Whether clicks mark points now.
    recording,
    // Marks the point at a click while recording; whether it did.
    click(x, y) {
      if (!recording()) return false;
      const point = pointAt(x, y);
      if (point) place(point);
      sync();
      return true;
    },
    // Moves the marks to their points, after the camera's updateMatrixWorld; nothing while
    // unticked.
    update() {
      if (panel.hidden) return;
      for (const { point, mark } of points) {
        const { x, y, front } = onScreen(point);
        mark.hidden = !front;
        mark.style.transform = `translate(${x}px, ${y - TIP}px) translate(-50%, -50%)`;
      }
    },
  };
}
