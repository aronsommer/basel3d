# basel3d

The whole city of Basel in 3D in the browser, built with three.js. Buildings, terrain, aerial photo and trees come from swisstopo.

## Running

A static website with no build step. three.js comes from jsDelivr via an import map. GitHub Pages serves the repo directly from `main`. Locally, any static server in the repo folder will do, for example:

```
npx serve
```

`npm install` is only needed for the converters and Prettier.

Format with Prettier, line width 100 as set in `.prettierrc`:

```
npm run format
```

## Structure

```
basel3d/
├── index.html         page with the import map for three.js
├── style.css          styles of the page
├── fonts/Inter.woff2  UI font (Inter, variable)
├── src/main.js        viewer (three.js)
├── src/buildings.js   buildings and bridges as single objects: picking, hits, highlight, hide
├── src/city.js        the buildings' meshes from basel.bin
├── src/cityfile.js    reads basel.bin
├── src/pack.js        reads the packed numbers of the routes and basel.bin
├── src/terrain.js     reads terrain.bin: the terrain's meshes and its height at a point, for the viewer and the converters
├── src/ground.js      the map as the terrain's textures: each tile as sharp as its distance needs and finer squares round the view, drawn by the worker
├── src/ground-worker.js  draws the map's squares off the page's thread
├── src/groundmap.js   draws a square of the map from map.bin, soft.bin and the buildings' roofs (the shadows round them)
├── src/rails.js       the rails and sleepers on the map's tracks, worked out by the shader
├── src/passage.js     the Unterer Rheinweg's passage under the Mittlere Brücke, which swissALTI3D fills up to the deck: the viewer lays its own ground in place of the terrain there: a straight, level floor and the bank beside it, falling into the Rhine
├── src/explosions.js  blowing up a building or bridge: flying faces, fire, smoke, bang, scorched ground
├── src/facade.js      windows, shopfronts and balconies drawn onto the walls by the shader
├── src/highlight.js   the cyan of what can be clicked, under the mouse
├── src/rockets.js     the helicopter's rockets: flight, whoosh, hitting buildings, bridges and ground
├── src/sound.js       sounds made with Web Audio, without sound files
├── public/            finished model data loaded by the viewer
│   ├── basel.glb      buildings (for Unity/Blender; the viewer loads it only with ?glb, to compare)
│   ├── basel.bin      the same buildings packed smaller, loaded by the viewer
│   ├── bridges.glb    bridges in 3D (canton Basel-Stadt + swissTLM3D, tools/bridges.mjs)
│   ├── terrain/       terrain: terrain.bin, terrain.json (swissALTI3D, tools/terrain.mjs)
│   ├── ground/        the ground, shown per 1 km tile (named column_row)
│   │   ├── map.bin    the map's shapes (OpenStreetMap, tools/map.mjs), drawn by the viewer, shown at start unless the aerial photo was chosen
│   │   ├── soft.bin   what the aerial photo adds to the map, coarsely: lawn in gardens, the green areas' patches (tools/map.mjs)
│   │   ├── rails.bin  the map's tracks, for their rails (tools/map.mjs)
│   │   └── photo/     aerial photo (SWISSIMAGE, tools/terrain.mjs), 64 tiles (KTX2), loads only when first shown
│   ├── trees.bin      tree positions (Uint16 east, south in 1/8 m from the north-west corner)
│   ├── canopy.bin     trees on the photo's crowns (as trees.bin, plus height in dm; tools/map.mjs)
│   ├── water.ktx2     water mask of the whole area for the water shader (tools/map.mjs)
│   ├── trams.json     tram routes: lines with colour and start, operator (tools/paths.mjs)
│   ├── trams.bin      tram routes as loops, 3D points about every 4 m (tools/paths.mjs)
│   ├── trains.json    rail routes: lines with colour and start, operator (tools/paths.mjs)
│   ├── trains.bin     rail routes as loops, 3D points about every 4 m (tools/paths.mjs)
│   ├── cars.json/.bin circuits of the cars (tools/paths.mjs)
│   ├── ships.bin      circuit of the ships on the Rhine as 3D points (tools/ships.mjs)
│   ├── walks.bin      loops on the sidewalks around the inner city's blocks, for the pedestrians (tools/walks.mjs)
│   ├── names.json     quarters, towns and landmarks with their place (tools/names.mjs)
│   └── size.json      size and hash of each file, for the loading percentage and cache
├── tools/             converters that generate public/
│   ├── area.mjs       shared area and coordinates
│   ├── swisstopo.mjs  download helpers (STAC catalogue, single swissTLM3D layers, SWISSIMAGE tiles)
│   ├── buildings.mjs  swissBUILDINGS3D + SWISSIMAGE → basel.glb
│   ├── compact.mjs    basel.glb → basel.bin
│   ├── terrain.mjs    swissALTI3D + SWISSIMAGE → terrain/, ground/photo/
│   ├── osm.mjs        OpenStreetMap download, WGS84 → LV95, road widths
│   ├── map.mjs        OpenStreetMap + SWISSIMAGE + basel.glb + bridges → ground/map.bin, ground/soft.bin, ground/rails.bin, canopy.bin, water.ktx2
│   ├── bsbridges.mjs  loads and converts the bridge models of Basel-Stadt
│   ├── bridges.mjs    bridges of Basel-Stadt → bridges.glb
│   ├── tiles.mjs      cuts an image of the area into KTX2 tiles (for ground/)
│   ├── trees.mjs      swissTLM3D single trees → trees.bin
│   ├── paths.mjs      OSM lines and roads + terrain + bridges → trams.*, trains.*, cars.*
│   ├── ships.mjs      Rhine centre line + bridge piers → ships.bin
│   ├── walks.mjs      OSM street network → loops around its blocks in the inner city → walks.bin
│   ├── names.mjs      OSM places + landmarks chosen by OSM id → names.json
│   ├── heights.mjs    terrain height at a point, for the converters
│   ├── pack.mjs       packs whole numbers into few bytes, for terrain.bin, the routes and basel.bin (read by src/pack.js)
│   └── size.mjs       → size.json, runs after every converter
└── data/              raw data from swisstopo and OSM (not in the repo, ~5 GB, downloaded automatically)
```

**Cache.** Every script or stylesheet in `index.html` ends in `?v=__BUILD_TIMESTAMP__`; the deploy replaces it with its time and bundles `src/` into one minified `src/main.js` and the map's worker into `src/ground-worker.js` (esbuild), so a new deploy is never mixed with cached old files. Files in `public/` are loaded with the content hash from `size.json`, so after changing one by hand, run `node tools/size.mjs`.

## Regenerating the data

`public/` is already generated. You only need to rebuild the data if you change the area or the converters. Each script writes its part of `public/` and then `size.json`. Raw data goes to `data/`, which is not in the repo and can be deleted at any time.

**Order.** Some scripts read what others wrote and do not fetch it themselves, so run them in this order (each is described below or under "What moves"):

```sh
npm run terrain     # terrain + aerial photo; needed by buildings, map, trams, trains, cars, ships
npm run buildings   # roof colours from the aerial photo
npm run bridges     # needs nothing else
npm run trees       # needs nothing else
npm run map         # needs the aerial photo, basel.glb, data/bridges.bin and trees.bin
npm run trams && npm run trains && npm run cars && npm run ships   # need terrain and bridges
npm run names       # needs nothing else
```

Run out of order, a script stops with an error where a file it reads is missing (`public/terrain/`, `basel.glb`, `data/bridges.bin`, `trees.bin`), but not without the aerial photo: then the buildings get a default roof colour, and the map loses the patches in its green areas and turns the built-up land slightly green. So check that `data/swissimage/` is filled before `npm run buildings` and `npm run map`.

**Which data.** OpenStreetMap (cached in `data/osm.json`, `osm-churches.json`, `osm-trams.json`, `osm-trains.json`, `osm-names.json`), the aerial photo, the swissTLM3D layers and the canton's bridge models are downloaded once into `data/` and then reused, so they stay as they are until deleted. swissALTI3D and swissBUILDINGS3D are looked up in the STAC catalogue on every run: when swisstopo publishes a newer version of a tile, it is downloaded and used. Downloaded anew, everything comes in its current state, so the result can differ a little from the one in the repo. `data/reference/buildings.json` is not shared; without it the buildings take their roof colours from the aerial photo and guessed wall colours (see 2.).

1. **Terrain and aerial photo:** `npm run terrain` downloads the data to `data/` by itself:
   - swissALTI3D from the STAC catalogue, per 1 km tile as a mesh at most 1 m off it (about 750,000 triangles in all, `terrain.bin`, 0.75 MB): on a grid of 513 points a side (about 2 m apart), right-angled triangles halved along their longest side only where the ground needs it (as in mapbox/martini), stored as one bit per triangle and each new point's height in cm as how it differs from the middle of the side it halves. So quay walls, bridge ends, embankments and the roads under bridges keep their shape. The viewer draws it within 2 km of the camera, further away a grid of heights 40 m apart. Where swissALTI3D has no data (outside Switzerland) a 10 m grid filled from its edge stands in,
   - SWISSIMAGE from the WMTS service `wmts.geo.admin.ch` at 1 m per pixel, cut into 1 km tiles and stored as GPU-compressed KTX2 textures (ETC1S, 1024 px). This takes about 6 minutes.
2. **Buildings:** `npm run buildings` takes swissBUILDINGS3D 3.0 as CityGML from the STAC catalogue `data.geo.admin.ch`, the newest version per map sheet (about 480 MB). The script:
   - takes only roof and wall surfaces,
   - cuts out an 8 × 8 km area around the city,
   - shifts the Swiss coordinates (LV95) to an origin in the city,
   - splits everything into 1 km tiles,
   - colours each roof like the aerial photo (median of the pixels on it; flat roofs greyed), so run `npm run terrain` first,
   - gives each building a wall colour and a facade style (old town, modern, offices, glass, church, town hall, hall) from its size and roof shape, which `src/facade.js` draws as windows, shopfronts and balconies; buildings in the optional, not shared `data/reference/buildings.json` take its colours and names instead,
   - compresses with Meshopt (about 19 MB, 2.4 million triangles),
   - packs the same meshes into `basel.bin` (`tools/compact.mjs`, also `npm run compact`): the same vertices and triangles, with colour, number and facade values stored once per building or wall instead of per vertex, about 8 MB over the network instead of 13. `src/cityfile.js` reads it, `src/city.js` builds the meshes.
3. **Bridges:** `npm run bridges` takes the modelled bridges of the canton Basel-Stadt (official cadastral survey, service 3D-Tiles BS, `https://3d.geo.bs.ch/cesium/tiles/av-bruecken/tileset.json`, about 10 MB in `data/bs-bruecken/`), with piers, arches and railings. The script converts them from Earth coordinates (ECEF) into the scene. Structures such as the Käppelijoch on the Mittlere Brücke come from the swisstopo buildings and stand exactly on the deck.
   - Crossings of the Rhine and the Birs that the canton modelled only partly (at the canton border) or not at all are built entirely from swissTLM3D: a simple deck with side walls on the measured line, instead of the canton's model. This covers the Birsfelden power station, the Dreiländerbrücke and the Birs bridges at the border and in Baselland. The swissTLM3D layers `TLM_STRASSE` and `TLM_EISENBAHN` come from the ZIP via HTTP range requests, like the trees (about 530 MB download, 3 GB in `data/`).
   - Together about 114,000 triangles and 300 KB in `bridges.glb`. All built triangles also end up in `data/bridges.bin`, which `npm run map` (to draw the OSM bridges underneath on their own), `trams`, `trains`, `cars` and `ships` read, so run `npm run bridges` before them. In the viewer the faces looking up show the texture of their place, so a deck continues the road: in the map view the deck tiles (see 5.), in the aerial view the photo, which shows the decks itself. Sides and undersides stay stone.
4. **Trees:** `npm run trees` takes only the layer `TLM_EINZELBAUM` from the landscape model swissTLM3D. The whole file would be 3.6 GB, so the script downloads only the needed parts of the ZIP via HTTP range requests. The area holds about 86,500 trees. The viewer adds the trees `npm run map` plants on the crowns of the aerial photo (`canopy.bin`, see 5.), draws all instanced, with one mesh per 1 km tile, and varies each in height, width and green (yellow to blue green). Up close the trees have a trunk, from afar only a simple crown.
5. **Map:** `npm run map` fetches roads, rail, water and green areas from OpenStreetMap (Overpass API, about 30 MB) and writes them as shapes, without text and trees, into `ground/map.bin` (under 1 MB): areas and lines in drawing order, each with its colour and width. The viewer draws the map from them itself (`src/groundmap.js`, in a worker), so edges stay sharp: each 1 km tile with 256 to 2048 pixels across, as its distance from the camera needs (`src/ground.js`; phones and tablets stop at 1024), the nearest first, and again as the camera moves. Round the point the camera looks at it also draws three squares, each inside the next and twice as fine (64 to 512 m across, 2048 pixels each, down to 3 cm per pixel), which the terrain's shader lays over the tiles, so edges are sharp up close too; they follow the view and are drawn again once it rests. Muted colours about as bright as the photo, one grey for all roads with light sidewalks and dark kerbs, a darker strip for tram tracks on their own strip of asphalt (so a track OSM has beside the road does not lie on nothing), narrow dark strips for railway tracks on light gravel, so parallel ones stay apart, and woods and scrub in the same green as lawn, as their trees are 3D. What the aerial photo adds goes, at half the photo's sharpness (about 2 m per pixel, WebP, each tile's image with a pixel of its neighbours round it, so they join smoothly), into `ground/soft.bin` (about 3.4 MB): in green areas the photo's brightness pattern (relative to its surroundings) gives lawns, fields and woods their real patches; on the built-up land the photo's green pixels become lawn, so gardens and courtyards show. In woods (OSM forest and scrub) the tree crowns in the photo (green and either dark or rough, as sun and shade change within metres while lawn is smooth; filled and freed of thin lines) keep only 40 % of the photo's patches, so they do not double the 3D trees, and `canopy.bin` gets a 3D tree, 14 to 24 m high, on them about every 13 m where no single tree of `trees.bin` stands close and no building, so run `npm run trees`, `npm run buildings` and `npm run terrain` first; where the aerial photo is missing there are none. Around the buildings the viewer darkens the ground softly (contact shadows), from the roofs in `basel.bin`. On the tracks (`ground/rails.bin`, under 0.1 MB) it lays two rails each and sleepers under a railway's (`src/rails.js`): strips on the ground or on a bridge's deck on which the shader works them out, so they are sharp from any distance and fade where they would be thinner than a pixel. Colours and road widths are at the top of `tools/map.mjs`. It also writes `water.ktx2` (2048 px, about 4 m per pixel): a mask of all visible water and the flow direction from the OSM river lines. There the ground shader in the viewer draws water whose pattern drifts downstream with light patches, on both the map and the aerial photo. Tunnels are missing, but for the passage under the Mittlere Brücke (`src/passage.js`), drawn straight along it. Bridges built in 3D (see 3.) are left out of the map, so it shows what lies below them; their OSM roads are drawn on their own on sidewalk colour, for the decks, with the first 30 m of the ways and tracks going on from their ends, as the decks often reach further than the OSM bridge (only on the tiles with 3D bridges). All other bridges are drawn flat. This takes about 1½ minutes.

## What moves

Everything that moves is built in the viewer itself ([src/main.js](src/main.js)), in a low-poly style and without model files. It is moved every frame in `update` functions. The paths that must be correct are computed in advance by converters.

- **Trams, trains and cars** (`createMovers` with the values per kind in `KINDS`, paths from `tools/paths.mjs`: `npm run trams`, `trains`, `cars`):
  - Each path is a closed loop on which the vehicles run endlessly. They follow the network of OSM ways (one-way roads and roundabouts only in their direction), never turn back, and turn from one way segment to the next by at most 60° (trams, shallow switches), 45° (trains) or 120° (cars).
  - Trams and trains run their real lines from OpenStreetMap (raw data in `data/osm-trams.json`, `data/osm-trains.json`): per line the longest pair of relations there and back that can be closed, in the order of the relation. At the end of the line, and where the line leaves the area and comes back in, it continues over the network (turning loop); where OSM has none, straight across a gap of up to 100 m. Lines whose trams run on as another line (`through` in `KINDS`: 1 and 14 at Dreirosenbrücke, 15 and 16 at Bruderholz) share one loop, and the number changes at their shared terminal. The tram line colours are those of the TNW network map (`colours` in `KINDS`), the train line colours those of OSM. The tracks include all ways of the relations, also tracks under construction. All 13 tram lines run, in 11 loops; of the train lines, 13 that cannot be closed this way are dropped, 19 run.
  - Cars on circuits along motorways down to neighbourhood connector roads from `data/osm.json`, 1.8 m right of the way's centre. Each starts on a road not yet driven and continues at random, mostly straight ahead and preferably onto roads not yet driven, until it comes back to a stretch already driven; from there it is a loop (at least 1.5 km). As many circuits as needed until 90% of the roads are driven (at most 3000 attempts; today about 70%).
  - Height: the terrain; on bridges the 3D bridges, if their deck differs from the previous height by at most 3 m; over OSM bridges without a matching 3D deck straight from end to end; in tunnels of 100 m or more 20 m below the terrain (shorter underpasses, as the terrain has the ground under bridges, and passages through buildings at road level); smoothed. Each way decides bridge and tunnel by its own OSM tags (so the road on the Dreirosenbrücke stays on top and the motorway in the box below). Only for tracks does a bridge track up to 5 m beside also count, because OSM does not mark every track on a bridge.
  - Vehicles (values in `KINDS`): trams 4 cars of 8 m each, BVB green, BLT yellow. Trains 5 cars, white with a red band, a quarter of them blue goods trains (green and yellow only for trams). Cars in strong colours (easy to see), 15% lorries. Evenly spread, one tram per 1.5 km of loop, one train per 5 km, one car per 100 m: on circuits per 100 m of their share of the roads (a road shared by three circuits counts one third for each), so shared roads are not more crowded. Each car of a vehicle follows the path on its own.
  - Spacing rule: a vehicle stops if another one stands shortly ahead on its own path, checked in short steps up to 25 m (tram), 60 m (train), 9 m (car) ahead, so nothing runs into each other at switches and junctions either. Oncoming traffic on the other side does not count. Trams and trains have priority: they wait only for trams and trains, cars for all. At the start none is placed on another. If vehicles wait for each other in a ring, the first one moves on.
  - Vehicles more than 1.5 km from the camera check the spacing only every third frame, which saves computing time.
  - No real timetable.
- **Ships** (`createShips`, data from `npm run ships`): a circuit on the Rhine, downstream right and upstream left of the centre, turning at the north edge of the area and about 220 m before the Birsfelden power station. Where a lane would hit bridge piers (parts of the 3D bridges up to 4 m above the water) or the monster, it moves over to the nearest free passage. Every point keeps at least 10 m clearance, with ships at most 11 m wide. 20 ships (tanker, container ship, passenger ship, speedboat in turn, each tinted slightly differently) run at the same speed, evenly spread at the start, each at least 20 m behind the one ahead. All are at most 6 m high and fit under the bridges. Before a ferry's line a ship (or whale) stops unless the ferry stays out of its lane until it is past; a waiting whale does not leap.
- **Ferries** (`src/ferries.js`): Basel's four ferries (St. Johann "Ueli", Klingental "Vogel Gryff", Münster "Leu", St. Alban "Wild Maa") on their lines from OpenStreetMap (`route=ferry`), listed with their landings (and masts where they were placed by hand) in `LANDINGS` in `src/ferries.js`. Each hangs by a rope from a pulley on a cable 20 m upstream, sagging between two masts beyond the landings, at least 16 m above the water; its bow turns towards the other bank, the more the faster it goes, as the current pushes it over. Each crosses at 1.5 m/s on average and rests 15 s at each landing, for ever. With "Names" each shows its name. They can be ridden.
- **Basiliskbrunnen** (`src/basilisks.js`): the 31 basilisk fountains, green cast iron: a wide round basin on a slender column, and on its rim the basilisk with the Basel shield, the water running from a brass spout in its beak onto a grating. Those within 60 m of the Rhine face it. The places: 30 from the canton's list of fountains (data.bs.ch, dataset 100008, Industrielle Werke Basel), one more from OpenStreetMap. Each place is listed with its streets in the file. With "Names" each shows "Basiliskbrunnen".
- **Baselstab** (`src/baselstab.js`): the black crozier of Basel's arms as a flat shape (hook, three bands, foot; 65 points), simplified from an SVG of the arms, for flags and shields: on the ferries' flags and the basilisks' shields.
- **Monster** (`createSerpent`): in the Rhine in front of the Roche towers, head level with Building 2. Looks at the towers, rises and sinks, snaps every 10 s.
- **Helicopter** (`createHelicopter`): circles over the monster and the Roche towers, at 275–325 m, keeping at least 40 m from the monster and 50 m from the towers (calculation in the code).
- **Planes** (`createPlanes`): two airliners circle in an oval (5 × 3.6 km) over the city, at 700 and 950 m above sea level, in opposite directions so they are always in view. 1.5 times real size, without an airline.
- **Birds** (`createBirds`): 12 flocks of 50 birds circle over bridges, parks and squares (list `FLOCKS`), 40–80 m above the ground, flapping their wings. One draw call.
- **Size from afar** (`boost`): moving things are real size up to 600 m in front of the camera and grow linearly beyond that up to three times, so they can be seen from above. Trams, trains and ships grow only in width and height, so lengths and spacings stay right. Trams and trains at most 1.4 times in width, so neighbouring tracks (3.5 m and 4.5 m apart) never overlap.
- **Water** (`addWater`): a pattern drifting downstream (see Map).

## Controls

- **View:**
  - Dragging pans.
  - Right mouse button or Alt/Cmd + drag rotates.
  - The mouse wheel zooms.
  - The map is the ground. "Aerial" at the bottom of the Dev panel shows the aerial photo instead, until it is unticked or the page is loaded again.
  - The URL keeps the view, so reloading or a shared link shows the same. Format as on openstreetmap.org, with bearing and pitch as in MapLibre: `#map=zoom/latitude/longitude/bearing/pitch`, for example `#map=15.20/47.556321/7.591912/34/48`. Latitude and longitude (WGS84, 6 decimals) of the point looked at; the zoom of a web map (256 px tiles) that shows as much ground across the window height there; the bearing in degrees (0 north, 90 east) and the pitch in degrees (0 straight down), both optional. A link from a 2D map such as `#map=13/47.545829/7.640734` thus shows the same place from above.
- **Riding along:** click or tap a tram, train, car, ship, plane, the helicopter or the sea monster; it is highlighted under the mouse. A tap that stops the gliding map only stops it. The camera sits at the front in the driver's cab, on a ship above the wheelhouse, behind and above a plane or the helicopter, on the monster's head between its horns (swaying with it); the horizon stays level. While riding, a click or tap on another one changes to it, except while steering; a finger also finds one up to 25 px beside it, the helicopter can be hit up to 50 px from its middle. The helicopter can be steered: W/S or ↑/↓ tilt its nose, which stays when let go, A/D or ←/→ turn, also with the buttons at the bottom. Flying, it goes along the nose, from about 20° up to 45° down; tilting through level, the nose stops there until pressed anew, and it levels out at the highest height. Nothing keeps it off the ground: touching the ground, a building or a bridge, it flies apart in pieces in a blast and one is off, the camera staying where it was. Q or the stop button left of them stops it to hover on the spot and lets it go on; while stopped, the nose only aims, from level to about 70° down. A crosshair shows where the rockets would hit. After getting off it is back on its circle. The two planes are flown the same way, without stopping or firing, as is the fighter jet on the roof of the BIZ tower (`src/jet.js`), which fires rockets too. Holding Space, the left mouse button on the scene or the fire button fires rockets from its two pods; the buildings and bridges they hit blow up and stay so in this browser until "Rebuild Basel" in the menu. With "Mouse aim" ticked in the menu (only where there is a mouse), what fires aims at what is under the mouse instead of ahead, and the tank's turret turns towards it. Trams, trains and cars reaching a destroyed bridge vanish and are back at their start 20 s later (one ridden in gets off). The box at the top left counts the buildings and bridges still standing. The menu stays available. The button with the cross below the menu or Esc goes back to the view from before riding.
- **Menu** (top right, three lines): at the top "Names" and "Fullscreen" beside the menu's icon and below them "Mouse aim", below a line the loops of the trams, trains and cars and the course of the ships as lines (4 px, over everything), for checking; none at first. Tram lines are drawn in their colour, everything else in strong magenta. While a tram line is shown, everything but the trams is drawn in light grey, so the line colours stand out. Under "Trams" each tram line has its own checkbox in its colour, and "All" shows or hides all at once (ticked when all are shown). Every tram on a shown line carries its number in a round badge of the line's colour, so the change from 1 to 14 or from 15 to 16 can be seen. "Names" shows the quarters of Basel and the towns around (OSM `place=suburb`, `town`, `village`) on the ground and about twenty landmarks (`LANDMARKS` in `tools/names.mjs`, each by its OSM id, checked against Wikidata) just above their roof or bridge deck; landmarks only within 3 km of the camera (`npm run names`). Off at first; the browser remembers the choice (`localStorage`, key `basel3d.names`, value `1` or `0`). At the bottom, below a line, "Points" and "Dev" open their panels at the top left. "Names" and "Fullscreen", Trains to Walks, and Points and Dev stand two in a row; the "Rebuild Basel" button below needs no lines round it.

## Data licences

- Buildings, terrain, aerial photo, trees: source: Federal Office of Topography swisstopo. Open government data, free to use with attribution.
- Bridges: source: Geodaten Kanton Basel-Stadt. Public geodata with download service, CC BY 4.0.
- Map, water and ferries: © OpenStreetMap contributors, ODbL.
- Basiliskbrunnen: source: Industrielle Werke Basel (IWB), data.bs.ch. Free to use with attribution; commercial use only with their permission.
- Font: Inter by The Inter Project Authors, SIL Open Font License 1.1.

---

## License

Copyright (C) 2026 Aron Sommer.

This project is licensed under the GNU Affero General Public License v3.0 or later. See the [LICENSE](LICENSE) file for full details.
