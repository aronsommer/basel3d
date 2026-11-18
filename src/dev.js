// "Dev info" in the menu of the layers, remembered in this browser: while ticked, a panel at the
// left shows, over a second (but at once after ticking it), the frames per second; the ms to draw
// a frame (so it shows the cost even where the screen's refresh rate caps the frames), split into
// the CPU's part (render, handing the work to the GPU) and the wait for the GPU to finish, timed
// every SAMPLE-th frame only, so the others run as usual; and the triangles drawn. Keys 1, 2, …
// then hide and show the parts, to see what each costs. All of it lives here, the menu entry in
// index.html (#dev-box, #dev), so it can be taken out whole.
const KEY = "basel3d.dev"; // "1" (on) or "0"
const SAMPLE = 5;

// A function drawing a frame with render(), timed while ticked; parts: [[name, objects], …].
export function createDev(renderer, render, parts) {
  const box = document.getElementById("dev-box");
  try {
    box.checked = localStorage.getItem(KEY) === "1";
  } catch {} // storage blocked
  // Counted by hand while ticked, over all passes of render().
  renderer.info.autoReset = !box.checked;
  const panel = document.body.appendChild(
    Object.assign(document.createElement("div"), { id: "dev", hidden: !box.checked }),
  );
  // A click or tap copies the lines, then shows "Copied" until the next update.
  panel.addEventListener("click", () =>
    navigator.clipboard?.writeText(panel.textContent).then(() => (panel.textContent = "Copied")),
  );
  addEventListener("keydown", (e) => {
    const part = box.checked && parts[Number(e.code.replace("Digit", "")) - 1];
    if (part) for (const object of part[1]) object.visible = !object.visible;
  });
  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  // Waits for the GPU to finish all it was given.
  const finish = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  let [frames, timed, cpu, gpu, since, fresh] = [0, 0, 0, 0, performance.now(), true];
  box.addEventListener("change", () => {
    try {
      localStorage.setItem(KEY, box.checked ? "1" : "0");
    } catch {} // storage blocked
    renderer.info.autoReset = !box.checked;
    panel.hidden = !box.checked;
    for (const [, objects] of parts) for (const object of objects) object.visible = true;
    [frames, timed, cpu, gpu, since, fresh] = [0, 0, 0, 0, performance.now(), true];
  });

  return () => {
    if (!box.checked) return render();
    renderer.info.reset();
    if (frames++ % SAMPLE) render();
    else {
      finish(); // the frames before, so only this one is timed
      const begin = performance.now();
      render();
      const handed = performance.now();
      finish();
      timed++;
      cpu += handed - begin;
      gpu += performance.now() - handed;
    }
    const now = performance.now();
    if (!fresh && now - since < 1000) return;
    panel.textContent = [
      `FPS: ${Math.round((frames * 1000) / (now - since))}`,
      `Draw: ${((cpu + gpu) / timed).toFixed(1)} ms`,
      `  CPU: ${(cpu / timed).toFixed(1)} ms`,
      `  GPU: ${(gpu / timed).toFixed(1)} ms`,
      `Triangles: ${(renderer.info.render.triangles / 1e6).toFixed(2)} M`,
      ...parts.map(([name, [object]], i) => `${i + 1} ${name}: ${object.visible ? "on" : "off"}`),
    ].join("\n");
    [frames, timed, cpu, gpu, since, fresh] = [0, 0, 0, 0, now, false];
  };
}
