# basel3d

Die ganze Stadt Basel in 3D im Browser, gebaut mit three.js. Gebäude, Gelände, Luftbild und Bäume stammen von swisstopo.

## Starten

Eine statische Website ohne Build. three.js kommt per Import-Map von jsDelivr. GitHub Pages liefert das Repo direkt aus `main` aus. Lokal reicht ein beliebiger statischer Server im Repo-Ordner, etwa:

```
npx serve
```

`npm install` braucht es nur für die Konverter und Prettier.

Formatieren mit Prettier, Zeilenbreite 100 laut `.prettierrc`:

```
npm run format
```

## Struktur

```
basel3d/
├── index.html         Seite mit Import-Map für three.js
├── src/main.js        Viewer (three.js)
├── public/            fertige Modelldaten, die der Viewer lädt
│   ├── basel.glb      Gebäude (auch für Unity/Blender)
│   ├── bridges.glb    Brücken in 3D (Kanton Basel-Stadt + swissTLM3D, tools/bridges.mjs)
│   ├── terrain/       Gelände: heights.bin, terrain.json (swissALTI3D, tools/terrain.mjs)
│   ├── ground/        Bodenbilder, je 64 Kacheln (KTX2, 1 km, Name Spalte_Zeile)
│   │   ├── map/       Karte (OpenStreetMap, tools/map.mjs), lädt erst beim Umschalten
│   │   └── photo/     Luftbild (SWISSIMAGE, tools/terrain.mjs), wird beim Start gezeigt
│   ├── trees.bin      Baumstandorte (x, z)
│   ├── water.ktx2     Wassermaske des ganzen Gebiets für den Wasser-Shader (tools/map.mjs)
│   └── size.json      Grösse jeder Datei, für die Prozentanzeige beim Laden
├── tools/             Konverter, die public/ erzeugen
│   ├── area.mjs       gemeinsames Gebiet und Koordinaten
│   ├── swisstopo.mjs  Download-Hilfen (STAC-Katalog, einzelne swissTLM3D-Ebenen)
│   ├── buildings.mjs  swissBUILDINGS3D → basel.glb
│   ├── terrain.mjs    swissALTI3D + SWISSIMAGE → terrain/, ground/photo/
│   ├── osm.mjs        OpenStreetMap-Download, WGS84 → LV95, Strassenbreiten
│   ├── map.mjs        OpenStreetMap → ground/map/
│   ├── bsbridges.mjs  Brückenmodelle von Basel-Stadt laden und umrechnen
│   ├── bridges.mjs    Brücken von Basel-Stadt → bridges.glb
│   ├── tiles.mjs      schneidet ein Bild des Gebiets in KTX2-Kacheln (für ground/)
│   ├── trees.mjs      swissTLM3D Einzelbäume → trees.bin
│   └── size.mjs       → size.json, läuft nach jedem Konverter
└── data/              Rohdaten von swisstopo und OSM (nicht im Repo, ~5 GB, wird automatisch geladen)
```

## Daten neu erzeugen

`public/` ist fertig erzeugt. Neu bauen musst du die Daten nur, wenn du etwas am Gebiet oder an den Konvertern änderst. Jedes Skript lädt fehlende Rohdaten selbst nach `data/` herunter. Was schon da ist, wird nicht noch einmal geladen. `data/` kannst du jederzeit löschen.

1. **Gebäude:** `npm run buildings` nimmt swissBUILDINGS3D 3.0 als CityGML aus dem STAC-Katalog `data.geo.admin.ch`, die neueste Version pro Kartenblatt (etwa 480 MB). Das Skript:
   - nimmt nur Dach- und Wandflächen,
   - schneidet ein 8 × 8 km grosses Gebiet um die Stadt aus,
   - verschiebt die Landeskoordinaten (LV95) auf einen Nullpunkt in der Stadt,
   - teilt alles in 1-km-Kacheln auf,
   - komprimiert mit Meshopt (etwa 11 MB, 2,4 Mio. Dreiecke).
2. **Gelände und Luftbild:** `npm run terrain` lädt die Daten selbst nach `data/` herunter:
   - swissALTI3D aus dem STAC-Katalog, als Raster mit 10 m Abstand (Int16 in cm),
   - SWISSIMAGE aus dem WMTS-Dienst `wmts.geo.admin.ch` mit 1 m pro Pixel, zugeschnitten auf 1-km-Kacheln und als GPU-komprimierte KTX2-Texturen (ETC1S, 1024 px) gespeichert. Das dauert etwa 6 Minuten.
3. **Karte:** `npm run map` holt Strassen, Bahn, Gewässer und Grünflächen aus OpenStreetMap (Overpass-API, etwa 30 MB) und zeichnet daraus eine Karte ohne Text, Häuser und Bäume, in den gleichen Kacheln wie das Luftbild. Farben und Strassenbreiten stehen oben in `tools/map.mjs`. Dazu schreibt es `water.ktx2` (2048 px, etwa 4 m pro Pixel): eine Maske aller sichtbaren Gewässer und die Fliessrichtung aus den OSM-Flusslinien. Dort zeichnet der Boden-Shader im Viewer Wasser, dessen Muster mit hellen Lichtflecken flussabwärts treibt, auf Karte und Luftbild. Tunnels fehlen. Brücken, die in 3D gebaut werden (siehe unten), fehlen in der Karte, alle anderen sind flach eingezeichnet. Das dauert etwa 2 Minuten.
4. **Brücken:** `npm run bridges` nimmt die modellierten Brücken des Kantons Basel-Stadt (Amtliche Vermessung, Dienst 3D-Tiles BS, `https://3d.geo.bs.ch/cesium/tiles/av-bruecken/tileset.json`, etwa 10 MB in `data/bs-bruecken/`), mit Pfeilern, Bögen und Geländern. Das Skript rechnet sie aus Erdkoordinaten (ECEF) in die Szene um. Aufbauten wie das Käppelijoch auf der Mittleren Brücke kommen aus den swisstopo-Gebäuden und stehen genau auf der Fahrbahn.
   - Überquerungen von Rhein und Birs, die der Kanton nur teilweise (an der Kantonsgrenze) oder gar nicht modelliert hat, baut das Skript ganz aus swissTLM3D: eine einfache Fahrbahn mit Seitenwänden auf der gemessenen Linie, statt des Kantonsmodells. Das betrifft das Kraftwerk Birsfelden, die Dreiländerbrücke und die Birs-Brücken an der Grenze und in Baselland. Die swissTLM3D-Ebenen `TLM_STRASSE` und `TLM_EISENBAHN` kommen wie die Bäume per HTTP-Range aus dem ZIP (etwa 530 MB Download, 3 GB in `data/`).
   - Zusammen etwa 114'000 Dreiecke und 300 KB in `bridges.glb`. Alle gebauten Dreiecke landen auch in `data/bridges.bin`. Damit blendet `npm run map` die OSM-Brücken darunter aus, deshalb zuerst `npm run bridges` laufen lassen.
5. **Bäume:** `npm run trees` holt aus dem Landschaftsmodell swissTLM3D nur die Ebene `TLM_EINZELBAUM`. Die ganze Datei wäre 3,6 GB gross, deshalb lädt das Skript per HTTP-Range-Requests nur die nötigen Teile des ZIP herunter. Im Gebiet liegen etwa 86'500 Bäume. Der Viewer zeichnet sie instanziert, mit einem Mesh pro 1-km-Kachel. Aus der Nähe haben die Bäume einen Stamm, aus der Ferne nur eine einfache Krone.

## Steuerung

- **Ansicht:**
  - Ziehen verschiebt.
  - Rechte Maustaste oder Alt/Cmd + Ziehen dreht.
  - Das Mausrad zoomt.
  - Der Knopf oben rechts wechselt zwischen Karte und Luftbild.
- **Herumlaufen:** auf den Boden doppelklicken.
  - WASD oder die Pfeiltasten gehen, Shift rennt.
  - Die Maus sieht sich um.
  - Esc führt zurück zur Ansicht.

## Lizenz der Daten

- Gebäude, Gelände, Luftbild, Bäume: Quelle: Bundesamt für Landestopografie swisstopo. Open Government Data, frei nutzbar mit Quellenangabe.
- Brücken: Quelle: Geodaten Kanton Basel-Stadt. Öffentliche Geodaten mit Download-Dienst, CC BY 4.0.
- Karte und Gewässer: © OpenStreetMap-Mitwirkende, ODbL.
