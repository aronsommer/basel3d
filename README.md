<div align="center">

# Basel 3D

**[www.basel3d.com](https://www.basel3d.com/)**

</div>

The whole city of Basel in 3D in your browser. Walk, drive or fly through the streets, over the rooftops and along the Rhine.

## How it is made

- Plain JavaScript with three.js, without a framework. The page runs as it is, without a build step, and loads nothing from elsewhere: three.js is in `vendor/`.
- The converters in `tools/` turn open geodata into compact files in `public/`: terrain, buildings, aerial photo and trees from swisstopo, most bridges from the canton of Basel-Stadt, and the map, place names and routes from OpenStreetMap.
- Everything else, from trams to animals, is built in code without model files, and the sounds are made with Web Audio without sound files.
- The map is drawn in the browser from its shapes, in a worker, so it stays sharp up close.

## Important

- Every kind of vehicle, person or animal placed in the city gets an id in `src/catalog.js`, a place in the museum and its lines in `INVENTORY.md`; `npm run inventory` checks them.
- The viewer loads each file in `public/` with its hash from `public/size.json`: after changing one by hand, run `node tools/size.mjs`.
- The deploy (`.github/workflows/deploy.yml`) bundles `src/main.js` and the two workers; a new worker needs its own line there.
- The converters read each other's output: terrain first, as it also brings the aerial photo, then buildings, bridges and trees, then the rest.

## License

Copyright (C) 2026 Aron Sommer.

This project is licensed under the GNU Affero General Public License v3.0 or later. See the [LICENSE](LICENSE) file for full details. The fonts' licences are in [FONT-LICENSES.txt](FONT-LICENSES.txt).
