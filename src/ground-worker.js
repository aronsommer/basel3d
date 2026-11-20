// Draws squares of the map for src/ground.js off the page's thread. First message: { files,
// origin } (src/groundmap.js); then { id, x, y, extent, px } each (metres from the map's
// north-west corner), answered by { id, ground, deck } (deck: null but for a tile with decks) as
// ImageBitmaps.
import { createGroundMap } from "./groundmap.js";

let map = null;
self.onmessage = async ({ data }) => {
  if (data.files) {
    map = createGroundMap(data.files, data.origin, {
      canvas: (width, height) => new OffscreenCanvas(width, height),
      image: (bytes) => createImageBitmap(new Blob([bytes], { type: "image/webp" })),
      Path2D,
      ImageData,
    });
    return;
  }
  const square = await map.draw(data.x, data.y, data.extent, data.px);
  const ground = square.ground.transferToImageBitmap();
  const deck = square.deck?.transferToImageBitmap() ?? null;
  postMessage({ id: data.id, ground, deck }, deck ? [ground, deck] : [ground]);
};
