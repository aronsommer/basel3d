// "Dev panel" in the menu of the layers, remembered in this browser: while ticked, a panel at the
// left shows, below Copy stats, which copies it all, over a second (but at once after ticking it),
// the frames per second; the ms to draw a frame (so it shows the cost even where the screen's
// refresh rate caps the frames), split into the CPU's part (render, handing the work to the GPU)
// and the wait for the GPU to finish, timed every SAMPLE-th frame only, so the others run as usual;
// and the triangles drawn. Below, a box per part hides and shows it, to see what it costs; a button
// steps through the SCALES of the resolution. All of it lives here, the menu entry and the styles
// in index.html (#dev-box, #dev), so it can be taken out whole.
const KEY = "basel3d.dev"; // "1" (on) or "0"
const SAMPLE = 5;
const SCALES = [1, 0.75, 0.5]; // of the pixel ratio

// A function drawing a frame with render(), timed while ticked; parts: [[name, objects], …].
export function createDev(renderer, render, parts) {
  const box = document.getElementById("dev-box");
  try {
    box.checked = localStorage.getItem(KEY) === "1";
  } catch {} // storage blocked
  // Counted by hand while ticked, over all passes of render().
  renderer.info.autoReset = !box.checked;
  const element = (tag, properties) => Object.assign(document.createElement(tag), properties);
  const panel = document.body.appendChild(element("div", { id: "dev", hidden: !box.checked }));
  const add = (tag, properties) => panel.appendChild(element(tag, properties));
  const stats = add("div", { className: "stats" }); // a name and a value per row
  let shown = []; // the rows' text, for Copy
  const boxes = parts.map(([name, objects]) => {
    const label = add("label");
    const input = label.appendChild(element("input", { type: "checkbox", checked: true }));
    label.append(name);
    input.addEventListener("change", () => {
      for (const object of objects) object.visible = input.checked;
    });
    return input;
  });
  const ratio = renderer.getPixelRatio();
  let scale = 0; // index in SCALES
  const resolution = add("button");
  const rescale = (index) => {
    renderer.setPixelRatio(ratio * SCALES[(scale = index)]);
    resolution.textContent = `Res ${SCALES[scale] * 100}%`;
  };
  rescale(0);
  resolution.addEventListener("click", () => rescale((scale + 1) % SCALES.length));
  // At the top, copies the numbers and settings; where the page may not (not https), selects the
  // numbers to copy by hand.
  const copy = panel.insertBefore(element("button", { textContent: "Copy stats" }), stats);
  copy.addEventListener("click", () => {
    const settings = parts.map(([name], i) => `${name} ${boxes[i].checked ? "on" : "off"}`);
    const text = [...shown, ...settings, `Resolution ${SCALES[scale] * 100}%`];
    if (!navigator.clipboard) return getSelection().selectAllChildren(stats);
    navigator.clipboard.writeText(text.join("\n")).then(() => {
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy stats"), 1500);
    });
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
    for (const input of boxes) input.checked = true;
    for (const [, objects] of parts) for (const object of objects) object.visible = true;
    rescale(0);
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
    const rows = [
      ["FPS", Math.round((frames * 1000) / (now - since))],
      ["Draw", `${((cpu + gpu) / timed).toFixed(1)} ms`],
      ["CPU", `${(cpu / timed).toFixed(1)} ms`],
      ["GPU", `${(gpu / timed).toFixed(1)} ms`],
      ["Tris", `${(renderer.info.render.triangles / 1e6).toFixed(2)} M`],
    ];
    stats.replaceChildren(...rows.flat().map((textContent) => element("span", { textContent })));
    shown = rows.map((row) => row.join(" "));
    [frames, timed, cpu, gpu, since, fresh] = [0, 0, 0, 0, now, false];
  };
}
