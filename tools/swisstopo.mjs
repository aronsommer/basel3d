// Download helpers for swisstopo's STAC catalogue (data.geo.admin.ch).
import { existsSync, writeFileSync } from "node:fs";
import { BBOX_WGS84 } from "./area.mjs";

// Newest asset per tile in the area: Map tile → { year, href }. Item ids end in _<year>_<tile>.
export async function newestTiles(collection, assetSuffix) {
  const newest = new Map();
  let url = `https://data.geo.admin.ch/api/stac/v1/collections/${collection}/items?bbox=${BBOX_WGS84}&limit=100`;
  while (url) {
    const page = await (await fetch(url)).json();
    for (const item of page.features) {
      const match = item.id.match(/_(\d{4})_(\d{4}-\d{2,4})$/);
      const asset = Object.values(item.assets).find((a) => a.href.endsWith(assetSuffix));
      if (match && asset && !(newest.get(match[2])?.year >= match[1]))
        newest.set(match[2], { year: match[1], href: asset.href });
    }
    url = page.links.find((l) => l.rel === "next")?.href;
  }
  return newest;
}

// Downloads url to file unless it is already there; false if the server has no such file.
export async function download(url, file) {
  if (existsSync(file)) return true;
  const res = await fetch(url);
  if (!res.ok) return false;
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return true;
}

export async function forEachParallel(items, limit, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}
