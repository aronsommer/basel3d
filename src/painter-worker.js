// Paints graffiti (src/painter.js) for src/graffiti.js off the page's thread. First message:
// { fonts: [[family, bytes], …] }; then { id, art: [look, size] } or { id, car: [look, width,
// height, most] }, each answered by { id, image, scale }: image an ImageBitmap, upside down for a
// texture (flipY false) unless flip is false. Each painting is kept in this browser (Cache Storage,
// where the page may use it: over https or on localhost) and taken from there when asked again;
// the cache is named by this code's and the fonts' digest, so any change of them paints anew, and
// older ones are deleted.
import { art, carSide } from "./painter.js";

const PREFIX = "graffiti-"; // of the caches' names
// The SHA-256 of strings and byte arrays, as hex.
async function digest(parts) {
  const bytes = await new Blob(parts).arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}
// The cache for this code and fonts (null where there is none), the others deleted.
async function open(fonts) {
  if (!self.caches || !self.crypto?.subtle) return null;
  try {
    // This file, and src/painter.js beside it where it is a file of its own (not bundled in).
    const files = [import.meta.url, new URL("./painter.js", import.meta.url).href];
    const code = await Promise.all(
      files.map((url) =>
        fetch(url)
          .then((r) => (r.ok ? r.text() : ""))
          .catch(() => ""),
      ),
    );
    const name = PREFIX + (await digest([...code, ...fonts.map(([, bytes]) => bytes)]));
    for (const old of await caches.keys())
      if (old.startsWith(PREFIX) && old !== name) caches.delete(old);
    return await caches.open(name);
  } catch {
    return null; // not allowed here
  }
}

let ready = null; // the fonts loaded, then the cache (or null)
self.onmessage = async ({ data }) => {
  if (data.fonts) {
    const { fonts } = data;
    ready = Promise.all(
      fonts.map(async ([family, bytes]) =>
        self.fonts.add(await new FontFace(family, bytes.slice(0)).load()),
      ),
    ).then(() => open(fonts));
    return;
  }
  const cache = await ready;
  const imageOrientation = data.flip === false ? "from-image" : "flipY";
  const key =
    cache &&
    `${self.location.origin}/graffiti/${await digest([JSON.stringify([data.art, data.car])])}`;
  const kept = key && (await cache.match(key));
  if (kept) {
    const image = await createImageBitmap(await kept.blob(), { imageOrientation });
    const scale = Number(kept.headers.get("x-scale"));
    return self.postMessage({ id: data.id, image, scale }, [image]);
  }
  const [canvas, scale] = data.art ? [art(...data.art)] : carSide(...data.car);
  const image = await createImageBitmap(canvas, { imageOrientation });
  self.postMessage({ id: data.id, image, scale }, [image]);
  // Then kept, as a PNG: as painted.
  if (!key) return;
  const headers = { "x-scale": String(scale ?? "") };
  const blob = await canvas.convertToBlob();
  cache.put(key, new Response(blob, { headers })).catch(() => {}); // full: painted next time
};
