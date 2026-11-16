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
│   ├── trams.json     Tramstrecken: Linie, Betreiber, Farbe (tools/paths.mjs)
│   ├── trams.bin      Tramstrecken als 3D-Punkte alle 4 m (tools/paths.mjs)
│   ├── trains.json    Bahnstrecken: Linie, Betreiber, Farbe (tools/paths.mjs)
│   ├── trains.bin     Bahnstrecken als 3D-Punkte alle 4 m (tools/paths.mjs)
│   ├── cars.json/.bin Strassen für die Autos (tools/paths.mjs)
│   ├── ships.bin      Rundkurs der Schiffe auf dem Rhein als 3D-Punkte (tools/ships.mjs)
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
│   ├── paths.mjs      OSM-Linien und -Strassen + Gelände + Brücken → trams.*, trains.*, cars.*
│   ├── ships.mjs      Rhein-Mittellinie + Brückenpfeiler → ships.bin
│   ├── heights.mjs    Geländehöhe an einem Punkt, für die Konverter
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

## Was sich bewegt

Alles Bewegte ist im Viewer ([src/main.js](src/main.js)) selbst gebaut, im Low-Poly-Stil und ohne Modelldateien. Bewegt wird es jedes Bild in `update`-Funktionen. Die Wege, die korrekt sein müssen, berechnen Konverter im Voraus.

- **Trams, Züge und Autos** (`createMovers` mit den Werten pro Art in `KINDS`, Wege aus `tools/paths.mjs`: `npm run trams`, `trains`, `cars`):
  - Trams und Züge auf allen Linien aus OpenStreetMap (Rohdaten in `data/osm-trams.json`, `data/osm-trains.json`), pro Linie und Richtung die längste Variante (Varianten, die zu 70 % auf derselben Strecke fahren, entfallen).
  - Autos auf Autobahnen bis Quartierverbindungsstrassen aus `data/osm.json`. Strassen gleichen Namens werden verbunden, Einbahnstrassen nur in ihrer Richtung, sonst beide Richtungen, jede 1,8 m rechts der Strassenmitte.
  - Höhe: Gelände; auf Brücken die 3D-Brücken, wenn deren Fahrbahn höchstens 3 m von der bisherigen Höhe abweicht; über OSM-Brücken ohne passende 3D-Fahrbahn gerade von Ende zu Ende; in Tunneln 20 m unter dem Gelände (Gebäudedurchfahrten auf Strassenhöhe); geglättet. Brücke und Tunnel bestimmt jeder Weg mit seinen eigenen OSM-Merkmalen (so bleibt die Strasse auf der Dreirosenbrücke oben, die Autobahn im Kasten darunter). Nur bei Gleisen zählt auch ein Brückengleis bis 5 m daneben, weil OSM nicht jedes Gleis auf einer Brücke markiert.
  - Fahrzeuge (Werte in `KINDS`): Trams 4 Wagen à 8 m, BVB grün, BLT gelb. Züge 5 Wagen, weiss mit rotem Band, ein Viertel Güterzüge. Autos in kräftigen Farben (gut sichtbar), alle 100 m eines, 15 % Lastwagen. Jeder Wagen folgt einzeln dem Weg.
  - Abstandsregel: Ein Fahrzeug hält, wenn auf dem eigenen Weg kurz voraus ein anderes steht, geprüft in kurzen Abständen bis 25 m (Tram), 60 m (Zug), 9 m (Auto) voraus, damit auch an Weichen und Kreuzungen nichts ineinanderfährt. Das Gegenüber auf der anderen Seite zählt nicht. Beim Start wird keines auf ein anderes gesetzt.
  - Fahrzeuge weiter als 1,5 km von der Kamera prüfen den Abstand nur jedes dritte Bild, das spart Rechenzeit.
  - Kein echter Fahrplan. Taste **L** zeigt alle Wege, Linien in ihrer Farbe, Strassen weiss.
- **Schiffe** (`createShips`, Daten aus `npm run ships`): ein Rundkurs auf dem Rhein, talwärts rechts und bergwärts links der Mitte, mit Wenden am Nordrand des Gebiets und etwa 220 m vor dem Kraftwerk Birsfelden. Wo eine Spur Brückenpfeiler (Teile der 3D-Brücken bis 4 m über dem Wasser) oder das Ungeheuer treffen würde, weicht sie zur nächsten freien Durchfahrt aus. Jeder Punkt hat mindestens 10 m Abstand, bei höchstens 11 m Schiffsbreite. 20 Schiffe (Tanker, Containerschiff, Passagierschiff, Schnellboot im Wechsel, jedes leicht anders eingefärbt) fahren gleich schnell und gleichmässig verteilt, können sich also nicht treffen. Alle sind höchstens 6 m hoch und passen unter den Brücken durch.
- **Ungeheuer** (`createSerpent`): im Rhein vor den Roche-Türmen, Kopf auf Höhe von Bau 2. Schaut zu den Türmen, hebt und senkt sich, schnappt alle 10 s zu.
- **Helikopter** (`createHelicopter`): kreist über Ungeheuer und Roche-Türmen, in 275–325 m Höhe, mit mindestens 40 m Abstand zum Ungeheuer und 50 m zu den Türmen (Rechnung im Code).
- **Flugzeuge** (`createPlanes`): zwei Linienflugzeuge kreisen in einem Oval (5 × 3,6 km) über der Stadt, auf 700 und 950 m ü. M., in entgegengesetzter Richtung, damit sie immer im Bild sind. 1,5-mal so gross wie echt, ohne Airline.
- **Vögel** (`createBirds`): 12 Schwärme à 50 Vögel kreisen über Brücken, Parks und Plätzen (Liste `FLOCKS`), 40–80 m über dem Boden, mit Flügelschlag. Ein Draw Call.
- **Grösse aus der Ferne** (`boost`): Bewegte Dinge sind bis 600 m vor der Kamera echt gross und wachsen dahinter linear bis aufs Dreifache, damit man sie von oben sieht. Trams, Züge und Schiffe wachsen nur in Breite und Höhe, damit Längen und Abstände stimmen. Trams und Züge höchstens 1,4-mal in der Breite, damit sich Nachbargleise (3,5 m bzw. 4,5 m) nie überdecken.
- **Wasser** (`addWater`): Muster, das flussabwärts treibt (siehe Karte).

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
- **Mitfahren:** auf ein Tram, einen Zug oder ein Auto doppelklicken. Die Kamera sitzt vorne im Führerstand. Esc führt zurück zur Ansicht.
- **Taste L:** zeigt alle Wege als Linien, zum Prüfen.

## Lizenz der Daten

- Gebäude, Gelände, Luftbild, Bäume: Quelle: Bundesamt für Landestopografie swisstopo. Open Government Data, frei nutzbar mit Quellenangabe.
- Brücken: Quelle: Geodaten Kanton Basel-Stadt. Öffentliche Geodaten mit Download-Dienst, CC BY 4.0.
- Karte und Gewässer: © OpenStreetMap-Mitwirkende, ODbL.
