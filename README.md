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
├── fonts/Inter.woff2  UI font (Inter, variable)
├── src/main.js        viewer (three.js)
├── public/            finished model data loaded by the viewer
│   ├── basel.glb      buildings (also for Unity/Blender)
│   ├── bridges.glb    bridges in 3D (canton Basel-Stadt + swissTLM3D, tools/bridges.mjs)
│   ├── terrain/       terrain: heights.bin, terrain.json (swissALTI3D, tools/terrain.mjs)
│   ├── ground/        ground images, 64 tiles each (KTX2, 1 km, named column_row)
│   │   ├── map/       map (OpenStreetMap, tools/map.mjs), loads only when first shown
│   │   └── photo/     aerial photo (SWISSIMAGE, tools/terrain.mjs), shown at start unless the map was chosen
│   ├── trees.bin      tree positions (x, z)
│   ├── water.ktx2     water mask of the whole area for the water shader (tools/map.mjs)
│   ├── trams.json     tram routes: line, operator, colour (tools/paths.mjs)
│   ├── trams.bin      tram routes as loops, 3D points about every 4 m (tools/paths.mjs)
│   ├── trains.json    rail routes: line, operator, colour (tools/paths.mjs)
│   ├── trains.bin     rail routes as loops, 3D points about every 4 m (tools/paths.mjs)
│   ├── cars.json/.bin circuits of the cars (tools/paths.mjs)
│   ├── ships.bin      circuit of the ships on the Rhine as 3D points (tools/ships.mjs)
│   └── size.json      size of each file, for the loading percentage
├── tools/             converters that generate public/
│   ├── area.mjs       shared area and coordinates
│   ├── swisstopo.mjs  download helpers (STAC catalogue, single swissTLM3D layers)
│   ├── buildings.mjs  swissBUILDINGS3D → basel.glb
│   ├── terrain.mjs    swissALTI3D + SWISSIMAGE → terrain/, ground/photo/
│   ├── osm.mjs        OpenStreetMap download, WGS84 → LV95, road widths
│   ├── map.mjs        OpenStreetMap → ground/map/
│   ├── bsbridges.mjs  loads and converts the bridge models of Basel-Stadt
│   ├── bridges.mjs    bridges of Basel-Stadt → bridges.glb
│   ├── tiles.mjs      cuts an image of the area into KTX2 tiles (for ground/)
│   ├── trees.mjs      swissTLM3D single trees → trees.bin
│   ├── paths.mjs      OSM lines and roads + terrain + bridges → trams.*, trains.*, cars.*
│   ├── ships.mjs      Rhine centre line + bridge piers → ships.bin
│   ├── heights.mjs    terrain height at a point, for the converters
│   └── size.mjs       → size.json, runs after every converter
└── data/              raw data from swisstopo and OSM (not in the repo, ~5 GB, downloaded automatically)
```

## Regenerating the data

`public/` is already generated. You only need to rebuild the data if you change the area or the converters. Each script downloads missing raw data to `data/` by itself. Whatever is already there is not downloaded again. `data/` can be deleted at any time.

1. **Buildings:** `npm run buildings` takes swissBUILDINGS3D 3.0 as CityGML from the STAC catalogue `data.geo.admin.ch`, the newest version per map sheet (about 480 MB). The script:
   - takes only roof and wall surfaces,
   - cuts out an 8 × 8 km area around the city,
   - shifts the Swiss coordinates (LV95) to an origin in the city,
   - splits everything into 1 km tiles,
   - compresses with Meshopt (about 11 MB, 2.4 million triangles).
2. **Terrain and aerial photo:** `npm run terrain` downloads the data to `data/` by itself:
   - swissALTI3D from the STAC catalogue, as a grid with 10 m spacing (Int16 in cm),
   - SWISSIMAGE from the WMTS service `wmts.geo.admin.ch` at 1 m per pixel, cut into 1 km tiles and stored as GPU-compressed KTX2 textures (ETC1S, 1024 px). This takes about 6 minutes.
3. **Map:** `npm run map` fetches roads, rail, water and green areas from OpenStreetMap (Overpass API, about 30 MB) and draws a map from them without text, houses and trees, in the same tiles as the aerial photo. Colours and road widths are at the top of `tools/map.mjs`. It also writes `water.ktx2` (2048 px, about 4 m per pixel): a mask of all visible water and the flow direction from the OSM river lines. There the ground shader in the viewer draws water whose pattern drifts downstream with light patches, on both the map and the aerial photo. Tunnels are missing. Bridges built in 3D (see below) are missing from the map; all others are drawn flat. This takes about 4 minutes.
4. **Bridges:** `npm run bridges` takes the modelled bridges of the canton Basel-Stadt (official cadastral survey, service 3D-Tiles BS, `https://3d.geo.bs.ch/cesium/tiles/av-bruecken/tileset.json`, about 10 MB in `data/bs-bruecken/`), with piers, arches and railings. The script converts them from Earth coordinates (ECEF) into the scene. Structures such as the Käppelijoch on the Mittlere Brücke come from the swisstopo buildings and stand exactly on the deck.
   - Crossings of the Rhine and the Birs that the canton modelled only partly (at the canton border) or not at all are built entirely from swissTLM3D: a simple deck with side walls on the measured line, instead of the canton's model. This covers the Birsfelden power station, the Dreiländerbrücke and the Birs bridges at the border and in Baselland. The swissTLM3D layers `TLM_STRASSE` and `TLM_EISENBAHN` come from the ZIP via HTTP range requests, like the trees (about 530 MB download, 3 GB in `data/`).
   - Together about 114,000 triangles and 300 KB in `bridges.glb`. All built triangles also end up in `data/bridges.bin`. `npm run map` uses it to hide the OSM bridges underneath, so run `npm run bridges` first.
5. **Trees:** `npm run trees` takes only the layer `TLM_EINZELBAUM` from the landscape model swissTLM3D. The whole file would be 3.6 GB, so the script downloads only the needed parts of the ZIP via HTTP range requests. The area holds about 86,500 trees. The viewer draws them instanced, with one mesh per 1 km tile. Up close the trees have a trunk, from afar only a simple crown.

## What moves

Everything that moves is built in the viewer itself ([src/main.js](src/main.js)), in a low-poly style and without model files. It is moved every frame in `update` functions. The paths that must be correct are computed in advance by converters.

- **Trams, trains and cars** (`createMovers` with the values per kind in `KINDS`, paths from `tools/paths.mjs`: `npm run trams`, `trains`, `cars`):
  - Each path is a closed loop on which the vehicles run endlessly. They follow the network of OSM ways (one-way roads and roundabouts only in their direction), never turn back, and turn from one way segment to the next by at most 60° (trams, shallow switches), 45° (trains) or 120° (cars).
  - Trams and trains run their real lines from OpenStreetMap (raw data in `data/osm-trams.json`, `data/osm-trains.json`): per line the longest pair of relations there and back that can be closed, in the order of the relation. At the end of the line, and where the line leaves the area and comes back in, it continues over the network (turning loop); where OSM has none, straight across a gap of up to 100 m (for example at the terminals Dreirosenbrücke and Bruderholz). The tracks include all ways of the relations, also tracks under construction. All 13 tram lines run; of the train lines, 13 that cannot be closed this way are dropped, 19 run.
  - Cars on circuits along motorways down to neighbourhood connector roads from `data/osm.json`, 1.8 m right of the way's centre. Each starts on a road not yet driven and continues at random, mostly straight ahead and preferably onto roads not yet driven, until it comes back to a stretch already driven; from there it is a loop (at least 1.5 km). As many circuits as needed until 90% of the roads are driven (at most 3000 attempts; today about 70%).
  - Height: the terrain; on bridges the 3D bridges, if their deck differs from the previous height by at most 3 m; over OSM bridges without a matching 3D deck straight from end to end; in tunnels of 100 m or more 20 m below the terrain (shorter underpasses, which the 10 m terrain fills in, and passages through buildings at road level); smoothed. Each way decides bridge and tunnel by its own OSM tags (so the road on the Dreirosenbrücke stays on top and the motorway in the box below). Only for tracks does a bridge track up to 5 m beside also count, because OSM does not mark every track on a bridge.
  - Vehicles (values in `KINDS`): trams 4 cars of 8 m each, BVB green, BLT yellow. Trains 5 cars, white with a red band, a quarter of them goods trains. Cars in strong colours (easy to see), 15% lorries. Evenly spread, one tram per 1.5 km of loop, one train per 5 km, one car per 100 m: on circuits per 100 m of their share of the roads (a road shared by three circuits counts one third for each), so shared roads are not more crowded. Each car of a vehicle follows the path on its own.
  - Spacing rule: a vehicle stops if another one stands shortly ahead on its own path, checked in short steps up to 25 m (tram), 60 m (train), 9 m (car) ahead, so nothing runs into each other at switches and junctions either. Oncoming traffic on the other side does not count. Trams and trains have priority: they wait only for trams and trains, cars for all. At the start none is placed on another. If vehicles wait for each other in a ring, the first one moves on.
  - Vehicles more than 1.5 km from the camera check the spacing only every third frame, which saves computing time.
  - No real timetable.
- **Ships** (`createShips`, data from `npm run ships`): a circuit on the Rhine, downstream right and upstream left of the centre, turning at the north edge of the area and about 220 m before the Birsfelden power station. Where a lane would hit bridge piers (parts of the 3D bridges up to 4 m above the water) or the monster, it moves over to the nearest free passage. Every point keeps at least 10 m clearance, with ships at most 11 m wide. 20 ships (tanker, container ship, passenger ship, speedboat in turn, each tinted slightly differently) run at the same speed and evenly spread, so they cannot meet. All are at most 6 m high and fit under the bridges.
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
  - The button at the top right ("Map"/"Aerial") switches between map and aerial photo. The browser remembers the choice (`localStorage`, key `basel3d.ground`, value `map` or `photo`) and shows it on the next start.
  - The URL keeps the view, so reloading or a shared link shows the same. Format as on openstreetmap.org, with bearing and pitch as in MapLibre: `#map=zoom/latitude/longitude/bearing/pitch`, for example `#map=15.20/47.556321/7.591912/34/48`. Latitude and longitude (WGS84, 6 decimals) of the point looked at; the zoom of a web map (256 px tiles) that shows as much ground across the window height there; the bearing in degrees (0 north, 90 east) and the pitch in degrees (0 straight down), both optional. A link from a 2D map such as `#map=13/47.545829/7.640734` thus shows the same place from above.
- **Riding along:** click a tram, train or car (on a phone, double-tap); it is highlighted under the mouse. The camera sits at the front in the driver's cab. The "Get off" button at the top right, Esc or, on a phone, a tap goes back to the view.
- **"Lines" menu** (top right, below the map/aerial button and the same size when closed): shows the loops of the trams, trains and cars and the course of the ships as strong magenta lines (4 px, over everything), for checking; none at first. Under "Trams" each tram line has its own checkbox, and "All" shows or hides all at once (ticked when all are shown). The **L** key shows everything, or hides everything if everything is shown.

## Data licences

- Buildings, terrain, aerial photo, trees: source: Federal Office of Topography swisstopo. Open government data, free to use with attribution.
- Bridges: source: Geodaten Kanton Basel-Stadt. Public geodata with download service, CC BY 4.0.
- Map and water: © OpenStreetMap contributors, ODbL.
- Font: Inter by The Inter Project Authors, SIL Open Font License 1.1.
