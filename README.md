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
│   ├── terrain/       Gelände (heights.bin, terrain.json) + 64 Luftbild-Kacheln
│   └── trees.bin      Baumstandorte (x, z)
├── tools/             Konverter, die public/ erzeugen
│   ├── area.mjs       gemeinsames Gebiet und Koordinaten
│   ├── swisstopo.mjs  Download-Hilfen (STAC-Katalog)
│   ├── buildings.mjs  swissBUILDINGS3D → basel.glb
│   ├── terrain.mjs    swissALTI3D + SWISSIMAGE → terrain/
│   └── trees.mjs      swissTLM3D Einzelbäume → trees.bin
└── data/              Rohdaten von swisstopo (nicht im Repo, ~2 GB, wird automatisch geladen)
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
   - swissALTI3D aus dem STAC-Katalog, als Raster mit 10 m Abstand,
   - SWISSIMAGE aus dem WMTS-Dienst `wmts.geo.admin.ch` mit 1 m pro Pixel, zugeschnitten auf 1-km-Kacheln.
3. **Bäume:** `npm run trees` holt aus dem Landschaftsmodell swissTLM3D nur die Ebene `TLM_EINZELBAUM`. Die ganze Datei wäre 3,6 GB gross, deshalb lädt das Skript per HTTP-Range-Requests nur die nötigen Teile des ZIP herunter. Im Gebiet liegen etwa 86'500 Bäume. Der Viewer zeichnet sie als einen instanzierten Low-Poly-Baum.

## Steuerung

- **Ansicht:**
  - Ziehen verschiebt.
  - Rechte Maustaste oder Alt/Cmd + Ziehen dreht.
  - Das Mausrad zoomt.
- **Herumlaufen:** auf den Boden doppelklicken.
  - WASD oder die Pfeiltasten gehen, Shift rennt.
  - Die Maus sieht sich um.
  - Esc führt zurück zur Ansicht.

## Lizenz der Daten

Quelle: Bundesamt für Landestopografie swisstopo. Die Daten sind Open Government Data und frei nutzbar, wenn man die Quelle angibt.
