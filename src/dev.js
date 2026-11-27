// "Dev" in the menu, remembered in this browser: while ticked, a panel at the left shows two tabs,
// "View" at first. "View" shows, below Copy stats, which copies it all, over a second (but at once
// after ticking it), the frames per second; the ms to draw a frame (so it shows the cost even
// where the screen's refresh rate caps the frames), split into the CPU's part (render, handing the
// work to the GPU) and the wait for the GPU to finish, timed every SAMPLE-th frame only, so the
// others run as usual; the triangles drawn and the draw calls. Below, a button steps through the
// SCALES of the resolution; a box per part hides and shows it, to see what it costs; then "Aerial"
// shows the aerial photo as the ground and "Riders". "Tools" holds the click modes Transform
// (src/placer.js), Graffiti and God mode. All of it lives here, the menu entry in
// index.html and the styles in style.css (#dev-box, #dev), so it can be taken out whole (but
// godAt, showRiders, src/sprayer.js and src/placer.js).
import { copy } from "./copy.js";

const KEY = "basel3d.devPanel"; // "1" (on) or "0"
const SAMPLE = 5;
const SCALES = [1, 0.75, 0.5]; // of the pixel ratio

// A function drawing a frame with render(), timed while ticked; parts: [[name, objects], …];
// aerial(on): shows the aerial photo or the map again, its promise done when it does; god(on):
// turns God mode on or off; riders(on): shows the riders on all vehicles or only on the one ridden;
// graffiti(on, box): turns the graffiti editor on or off, its panel in box (an element); placer:
// src/placer.js's.
export function createDev(renderer, render, parts, aerial, god, riders, graffiti, placer) {
  const box = document.getElementById("dev-box");
  try {
    box.checked = localStorage.getItem(KEY) === "1";
  } catch {} // storage blocked
  // Counted by hand while ticked, over all passes of render().
  renderer.info.autoReset = !box.checked;
  const element = (tag, properties) => Object.assign(document.createElement(tag), properties);
  const panel = element("div", { id: "dev", hidden: !box.checked });
  document.getElementById("panels").prepend(panel); // above the Points panel (src/points.js)
  const tabs = panel.appendChild(element("div", { className: "row tabs" }));
  const pages = Object.fromEntries(
    ["View", "Tools"].map((name) => [
      name,
      panel.appendChild(element("div", { className: "page" })),
    ]),
  );
  let mode = 0; // MODES' index
  const placing = () => placer.enable(box.checked && !pages.Tools.hidden && mode === 0);
  const show = (name) => {
    for (const [n, page] of Object.entries(pages)) page.hidden = n !== name;
    for (const tab of tabs.children) tab.ariaPressed = tab.textContent === name;
    placing();
  };
  for (const name of Object.keys(pages))
    tabs.appendChild(element("button", { textContent: name })).addEventListener("click", () => {
      const entered = pages[name].hidden;
      show(name);
      if (entered) choose(0);
    });
  show("View");
  let page = pages.View;
  const add = (tag, properties) => page.appendChild(element(tag, properties));
  const stats = add("div", { className: "stats" }); // a name and a value per row
  let shown = []; // the rows' text, for Copy
  const ratio = renderer.getPixelRatio();
  let scale = 0; // index in SCALES
  const resolution = add("button");
  const rescale = (index) => {
    renderer.setPixelRatio(ratio * SCALES[(scale = index)]);
    resolution.textContent = `Res ${SCALES[scale] * 100}%`;
  };
  rescale(0);
  resolution.addEventListener("click", () => rescale((scale + 1) % SCALES.length));
  const boxes = parts.map(([name, objects]) => {
    const label = add("label");
    const input = label.appendChild(element("input", { type: "checkbox", checked: true }));
    label.append(name);
    input.addEventListener("change", () => {
      for (const object of objects) object.visible = input.checked;
    });
    return input;
  });
  // A box below, not ticked, calling change(ticked) when ticked or unticked.
  const toggle = (name, change) => {
    const label = add("label");
    const input = label.appendChild(element("input", { type: "checkbox" }));
    label.append(name);
    input.addEventListener("change", () => change(input.checked));
    return input;
  };
  const photo = toggle("Aerial", async (on) => {
    photo.disabled = true; // until it is shown
    await aerial(on);
    photo.disabled = false;
  });
  const editor = element("div", { id: "spray", hidden: true });
  document.getElementById("panels").after(editor); // bottom right (style.css)
  const spraying = (on) => {
    editor.hidden = !on;
    graffiti(on, editor);
  };
  const riding = toggle("Riders", riders);
  page = pages.Tools;
  placer.mount(page);
  // What a click in the scene does, one at a time.
  const MODES = [
    ["Transform", () => {}],
    ["Graffiti", spraying],
    ["God mode", god],
  ];
  const buttons = MODES.map(([textContent], k) => {
    const button = element("button", { textContent, className: "tool" });
    button.addEventListener("click", () => choose(k));
    return page.insertBefore(button, page.lastElementChild);
  });
  const choose = (k) => {
    MODES[mode][1](false);
    mode = k;
    MODES[k][1](true);
    buttons.forEach((b, i) => (b.ariaPressed = i === k));
    placing();
  };
  choose(0);
  // At the top, copies the numbers and settings (src/copy.js); where it cannot, selects the
  // numbers to copy by hand.
  const button = pages.View.insertBefore(element("button", { textContent: "Copy stats" }), stats);
  button.addEventListener("click", () => {
    const settings = parts.map(([name], i) => `${name} ${boxes[i].checked ? "on" : "off"}`);
    const text = [...shown, ...settings, `Resolution ${SCALES[scale] * 100}%`];
    copy(text.join("\n")).then((done) => {
      if (!done) return getSelection().selectAllChildren(stats);
      button.textContent = "Copied";
      setTimeout(() => (button.textContent = "Copy stats"), 1500);
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
    riders((riding.checked = false));
    choose(0);
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
      ["Calls", renderer.info.render.calls],
    ];
    stats.replaceChildren(...rows.flat().map((textContent) => element("span", { textContent })));
    shown = rows.map((row) => row.join(" "));
    [frames, timed, cpu, gpu, since, fresh] = [0, 0, 0, 0, now, false];
  };
}
