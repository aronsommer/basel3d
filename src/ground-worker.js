// Draws the map's tiles for src/ground.js off the page's thread. First message: { files, origin }
// (src/groundmap.js); then { column, row, px } each, answered by the same with ground and deck
// (null without decks) as ImageBitmaps.
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
  const { column, row, px } = data;
  const tile = await map.draw(column, row, px);
  const ground = tile.ground.transferToImageBitmap();
  const deck = tile.deck?.transferToImageBitmap() ?? null;
  postMessage({ column, row, px, ground, deck }, deck ? [ground, deck] : [ground]);
};
