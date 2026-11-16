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
│   ├── bridges.glb    Brücken über Rhein und Birs in 3D (swissTLM3D, tools/bridges.mjs)
│   ├── terrain/       Gelände: heights.bin, terrain.json (swissALTI3D, tools/terrain.mjs)
│   ├── ground/        Bodenbilder, je 64 Kacheln (KTX2, 1 km, Name Spalte_Zeile)
│   │   ├── map/       Karte (OpenStreetMap, tools/map.mjs), wird beim Start gezeigt
│   │   └── photo/     Luftbild (SWISSIMAGE, tools/terrain.mjs), lädt erst beim Umschalten
│   ├── trees.bin      Baumstandorte (x, z)
│   ├── water.ktx2     Wassermaske des ganzen Gebiets für den Wasser-Shader (tools/map.mjs)
│   └── size.json      Grösse jeder Datei, für die Prozentanzeige beim Laden
├── tools/             Konverter, die public/ erzeugen
│   ├── area.mjs       gemeinsames Gebiet und Koordinaten
│   ├── swisstopo.mjs  Download-Hilfen (STAC-Katalog, einzelne swissTLM3D-Ebenen) und Shapefile-Leser
│   ├── buildings.mjs  swissBUILDINGS3D → basel.glb
│   ├── terrain.mjs    swissALTI3D + SWISSIMAGE → terrain/, ground/photo/
│   ├── osm.mjs        OpenStreetMap-Download und gemeinsame Hilfen für map.mjs und bridges.mjs
│   ├── map.mjs        OpenStreetMap → ground/map/
│   ├── bridges.mjs    swissTLM3D-Brücken → bridges.glb
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
3. **Karte:** `npm run map` holt Strassen, Bahn, Gewässer und Grünflächen aus OpenStreetMap (Overpass-API, etwa 30 MB) und zeichnet daraus eine Karte ohne Text, Häuser und Bäume, in den gleichen Kacheln wie das Luftbild. Farben und Strassenbreiten stehen oben in `tools/map.mjs`. Dazu schreibt es `water.ktx2` (2048 px, etwa 4 m pro Pixel): eine Maske aller sichtbaren Gewässer und die Fliessrichtung aus den OSM-Flusslinien. Dort zeichnet der Boden-Shader im Viewer Wasser, dessen Muster mit hellen Lichtflecken flussabwärts treibt, auf Karte und Luftbild. Tunnels fehlen, und die Brücken über Rhein und Birs entstehen in 3D (siehe unten). Alle anderen Brücken sind flach eingezeichnet. Das dauert etwa 2 Minuten.
4. **Brücken:** `npm run bridges` baut alle Brücken über Rhein und Birs in 3D, auch die Dreiländerbrücke und den Weg über das Kraftwerk Birsfelden (etwa 50 Stück, 3'300 Dreiecke, 16 KB). Sie stammen aus swissTLM3D, den Ebenen `TLM_STRASSE` und `TLM_EISENBAHN`, die wie die Bäume per HTTP-Range aus dem ZIP geholt werden (etwa 530 MB Download, 3,3 GB in `data/`). Die Fahrbahnhöhe ist gemessen, die Breite folgt aus der Strassenart beziehungsweise der Anzahl Gleise. Trams auf Strassenbrücken bekommen keine eigenen. Ob eine Brücke über Rhein oder Birs führt, entscheidet der Flusslauf aus OSM. Diese Brücken fehlen in der Karte.
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

Quelle: Bundesamt für Landestopografie swisstopo. Die Daten sind Open Government Data und frei nutzbar, wenn man die Quelle angibt.
