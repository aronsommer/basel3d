// Record clicks at the bottom of the Dev panel (src/dev.js): while recording, each click on
// the scene marks what is there with a number; Undo takes back the last; Stop & copy copies them
// all, "1 LV95 east, north, altitude" per line, and leaves the marks until the next recording.
import { copy } from "./copy.js";

// pointAt(x, y): the scene point at a screen point (px), or null; lv95(point): its text;
// onScreen(point): { x, y, front } (src/main.js).
export function createRecorder(pointAt, lv95, onScreen) {
  const panel = document.getElementById("dev");
  const layer = document.getElementById("badges");
  const button = (textContent, hidden = false) =>
    panel.appendChild(Object.assign(document.createElement("button"), { textContent, hidden }));
  const record = button("Record clicks");
  const undo = button("Undo", true);
  const points = []; // { point, mark }
  let on = false;

  record.addEventListener("click", () => {
    on = !on;
    record.textContent = on ? "Stop & copy" : "Record clicks";
    undo.hidden = !on;
    if (on) {
      for (const { mark } of points.splice(0)) mark.remove();
      return;
    }
    const text = points.map(({ point }, k) => `${k + 1} ${lv95(point)}`).join("\n");
    copy(text).then((done) => done && (record.textContent = "Copied"));
    setTimeout(() => !on && (record.textContent = "Record clicks"), 1500);
  });
  undo.addEventListener("click", () => points.pop()?.mark.remove());

  return {
    // Marks the point at a click while recording; whether it did.
    click(x, y) {
      if (!on || panel.hidden) return false;
      const point = pointAt(x, y);
      if (point) {
        const mark = Object.assign(document.createElement("div"), {
          textContent: points.length + 1,
          className: "mark",
        });
        points.push({ point, mark: layer.appendChild(mark) });
      }
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
