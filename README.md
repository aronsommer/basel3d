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
│   ├── trams.bin      Tramstrecken als Schlaufen, 3D-Punkte etwa alle 4 m (tools/paths.mjs)
│   ├── trains.json    Bahnstrecken: Linie, Betreiber, Farbe (tools/paths.mjs)
│   ├── trains.bin     Bahnstrecken als Schlaufen, 3D-Punkte etwa alle 4 m (tools/paths.mjs)
│   ├── cars.json/.bin Rundkurse der Autos (tools/paths.mjs)
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
  - Jeder Weg ist eine geschlossene Schlaufe, auf der die Fahrzeuge endlos fahren. Sie folgen dem Netz der OSM-Wege (Einbahnwege und Kreisel nur in ihrer Richtung), wenden nie und biegen von einem Wegstück zum nächsten höchstens um 60° (Trams, flache Weichen), 45° (Züge) oder 120° (Autos) ab.
  - Trams und Züge fahren ihre echten Linien aus OpenStreetMap (Rohdaten in `data/osm-trams.json`, `data/osm-trains.json`): pro Linie das längste Paar von Relationen hin und zurück, das sich schliessen lässt, in der Reihenfolge der Relation. Am Linienende und wo die Linie das Gebiet verlässt und wieder hereinkommt, geht es über das Netz weiter (Wendeschlaufe); wo OSM keine hat, gerade über eine Lücke bis 100 m (etwa an den Endstationen Dreirosenbrücke und Bruderholz). Zu den Gleisen gehören alle Wege der Relationen, auch Gleise im Bau. Alle 13 Tramlinien fahren; von den Zuglinien fallen 13 weg, die sich so nicht schliessen lassen, 19 fahren.
  - Autos auf Rundkursen durch die Autobahnen bis Quartierverbindungsstrassen aus `data/osm.json`, 1,8 m rechts der Wegmitte. Jeder beginnt auf einer noch nicht befahrenen Strasse und fährt zufällig weiter, meist geradeaus und lieber auf noch nicht befahrene Strassen, bis er auf ein schon gefahrenes Stück zurückkommt; ab dort ist es eine Schlaufe (mindestens 1,5 km). So viele Rundkurse, bis 90 % der Strassen befahren sind (höchstens 3000 Versuche; heute etwa 70 %).
  - Höhe: Gelände; auf Brücken die 3D-Brücken, wenn deren Fahrbahn höchstens 3 m von der bisherigen Höhe abweicht; über OSM-Brücken ohne passende 3D-Fahrbahn gerade von Ende zu Ende; in Tunneln ab 100 m 20 m unter dem Gelände (kürzere Unterführungen, die das 10-m-Gelände zuschüttet, und Gebäudedurchfahrten auf Strassenhöhe); geglättet. Brücke und Tunnel bestimmt jeder Weg mit seinen eigenen OSM-Merkmalen (so bleibt die Strasse auf der Dreirosenbrücke oben, die Autobahn im Kasten darunter). Nur bei Gleisen zählt auch ein Brückengleis bis 5 m daneben, weil OSM nicht jedes Gleis auf einer Brücke markiert.
  - Fahrzeuge (Werte in `KINDS`): Trams 4 Wagen à 8 m, BVB grün, BLT gelb. Züge 5 Wagen, weiss mit rotem Band, ein Viertel Güterzüge. Autos in kräftigen Farben (gut sichtbar), 15 % Lastwagen. Gleichmässig verteilt, ein Tram pro 1,5 km Schlaufe, ein Zug pro 5 km, ein Auto pro 100 m: bei Rundkursen pro 100 m ihres Anteils an den Strassen (eine Strasse, die sich drei Rundkurse teilen, zählt für jeden zu einem Drittel), damit geteilte Strassen nicht voller sind. Jeder Wagen folgt einzeln dem Weg.
  - Abstandsregel: Ein Fahrzeug hält, wenn auf dem eigenen Weg kurz voraus ein anderes steht, geprüft in kurzen Abständen bis 25 m (Tram), 60 m (Zug), 9 m (Auto) voraus, damit auch an Weichen und Kreuzungen nichts ineinanderfährt. Das Gegenüber auf der anderen Seite zählt nicht. Trams und Züge haben Vortritt: Sie warten nur auf Trams und Züge, Autos auf alle. Beim Start wird keines auf ein anderes gesetzt. Warten Fahrzeuge im Kreis aufeinander, fährt das erste los.
  - Fahrzeuge weiter als 1,5 km von der Kamera prüfen den Abstand nur jedes dritte Bild, das spart Rechenzeit.
  - Kein echter Fahrplan.
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
  - Die URL hält die Ansicht fest, so zeigt Neuladen oder ein geteilter Link dieselbe. Format wie bei openstreetmap.org, mit Richtung und Neigung wie bei MapLibre: `#map=Zoom/Breite/Länge/Richtung/Neigung`, etwa `#map=15.20/47.556321/7.591912/34/48`. Breite und Länge (WGS84, 6 Stellen) des angeschauten Punkts; der Zoom einer Webkarte (256-px-Kacheln), die dort gleich viel Boden über die Fensterhöhe zeigt; die Blickrichtung in Grad (0 Norden, 90 Osten) und die Neigung in Grad (0 senkrecht von oben), beide freiwillig. Ein Link einer 2D-Karte wie `#map=13/47.545829/7.640734` zeigt so denselben Ort von oben.
- **Mitfahren:** auf ein Tram, einen Zug oder ein Auto klicken (auf dem Handy doppelt tippen); unter der Maus wird es hervorgehoben. Die Kamera sitzt vorne im Führerstand. Esc (auf dem Handy ein Tipp) führt zurück zur Ansicht.
- **Menü „Linien“** (oben rechts, unter dem Knopf Karte/Luftbild und zugeklappt gleich gross): zeigt die Schlaufen der Trams, Züge und Autos und den Kurs der Schiffe als kräftige magenta Linien (4 px, über allem), zum Prüfen; am Anfang keine. Unter „Trams“ hat jede Tramlinie ein eigenes Häkchen, und „Alle“ zeigt oder verbirgt alle auf einmal (angehakt, wenn alle gezeigt werden). Die Taste **L** zeigt alles, oder blendet alles aus, wenn alles gezeigt wird.

## Lizenz der Daten

- Gebäude, Gelände, Luftbild, Bäume: Quelle: Bundesamt für Landestopografie swisstopo. Open Government Data, frei nutzbar mit Quellenangabe.
- Brücken: Quelle: Geodaten Kanton Basel-Stadt. Öffentliche Geodaten mit Download-Dienst, CC BY 4.0.
- Karte und Gewässer: © OpenStreetMap-Mitwirkende, ODbL.
