# Inventory

Everything placed in the city, found by going through every `scene.add` in `src/main.js`,
`src/explosions.js` and `src/rockets.js`, each kind with its id in the catalog (`src/catalog.js`)
and in the museum (`src/museum.js`; L landmarks, S scenes, A animals, V what one drives or flies, T
traffic, P people moving; a number after a dash is one of a kind's variants or groups). The museum shows every kind with an id,
built by the same code as in the city; it leaves out the ground and city, the effects and what
belongs to its building or place (no id below). Anything new placed in the city gets an id and a
place in the museum too.

## Ground and city

| What                                                                         | Where                | File                                      |
| ---------------------------------------------------------------------------- | -------------------- | ----------------------------------------- |
| Terrain, water on the Rhine, map or aerial photo as ground                   | whole area           | `terrain.js`, `ground.js`, `groundmap.js` |
| Buildings with drawn facades, blown up and rebuilt                           | whole area           | `buildings.js`, `facade.js`               |
| Bridges, the Käppelijoch on the Mittlere Brücke                              | Rhine                | `main.js`                                 |
| The passage under the Mittlere Brücke's Kleinbasel end                       | Unterer Rheinweg     | `passage.js`                              |
| Rails on the ground and the decks                                            | tram and train lines | `rails.js`                                |
| Trees (single and from the photo's crowns), none at UNTREED and by fountains | whole area           | `trees.js`, `main.js`                     |
| Sky, sun, day and night                                                      |                      | `sky.js`, `daylight.js`                   |
| Names of quarters, towns and landmarks                                       | whole area           | `main.js`                                 |

## Landmarks and decorations

| Id  | What                                     | Where                 | File                                 |
| --- | ---------------------------------------- | --------------------- | ------------------------------------ |
| L1  | 31 Basiliskbrunnen                       | all over the city     | `basilisks.js`, `catalog.js`         |
|     | St. Jakob-Park in FC Basel's colours     | St. Jakob             | `main.js`                            |
|     | Roche's buildings, a green roof grey     | Roche site            | `main.js`                            |
|     | Basel SBB: platform roofs, front, clocks | Basel SBB             | `main.js`, `station.js`, `clocks.js` |
|     | Badischer Bahnhof's platform roofs       | Badischer Bahnhof     | `main.js`                            |
|     | Fire station: grey, gates, name          | WGS84 47.5562, 7.5824 | `firestation.js`                     |
|     | Rainbow flags on the Münster's towers    | Münster               | `pride.js`                           |
|     | Elisabethenkirche in rainbow stripes     | Elisabethenkirche     | `main.js`, `pride.js`                |
|     | A building with old-town windows         |                       | `main.js`, `facade.js`               |
|     | Novartis Pavillon's light show           | Novartis Campus       | `pavilion.js`                        |
|     | "PUMA" mown into a lawn                  | Erlenmatt             | `lawn.js`                            |
|     | Graffiti (FCB pieces and tags)           | GRAFFITI list         | `graffiti.js`                        |

## Animals

| Id  | What                                                                                                                                                                             | Where                         | File                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------- |
| A1  | Zoo: giraffes, elephants, zebras, rhinos, penguins, hippos, seals, flamingos (by the hippos and amid the seals)                                                                  | Zoo Basel                     | `zoo.js`, `catalog.js`     |
| A1  | A crocodile                                                                                                                                                                      | Merian Gärten                 | `zoo.js`, `catalog.js`     |
| A1  | Wild boars, foxes, a wildcat, red deer, chamois, swans, ducks, geese, goats (twice), small monkeys, a lynx, donkeys, wolves (twice), a howling wolf, wisents with a calf (twice) | Lange Erlen                   | `zoo.js`, `catalog.js`     |
| S1  | A swan family, fed by the old man                                                                                                                                                | Rhine bank, St. Johann        | `zoo.js` (createSwans)     |
| A4  | 12 flocks of birds                                                                                                                                                               | bridges, parks, squares       | `birds.js`, `catalog.js`   |
| A2  | Whale families among the ships                                                                                                                                                   | Rhine                         | `ships.js`                 |
| A3  | The sea serpent                                                                                                                                                                  | Rhine before the Roche towers | `serpent.js`, `catalog.js` |
| P2  | Swan families beside the Rhine swimmers                                                                                                                                          | Rheinweg round                | `swimmers.js`              |

## People in scenes

| Id  | What                                                                       | Where                        | File                        |
| --- | -------------------------------------------------------------------------- | ---------------------------- | --------------------------- |
| S1  | The old man in a cap feeding the swans                                     | Rhine bank, St. Johann       | `catalog.js`                |
| S2  | Women sunbathing on towels, a yoga row and dancing friends, some on towels | around LV95 2610515, 1268548 | `catalog.js`                |
| S3  | Black men, each in other clothes                                           | Kleinbasel                   | `catalog.js` (MEN)          |
| S4  | Sex workers in a lane                                                      | Kleinbasel                   | `catalog.js` (WOMEN)        |
| S5  | Four friends dancing on each Roche tower                                   | Roche towers                 | `catalog.js`                |
| S6  | A girl on her pink bike, her sister on a tricycle                          | Erlenmatt                    | `bike.js`, `catalog.js`     |
| S7  | Football training: teams, goalkeepers, coaches, a throwing drill           | St. Jakob-Park's pitch       | `football.js`, `catalog.js` |
| S8  | A Fasnacht clique: drum major, pipers, drummers                            | Marktplatz                   | `fasnacht.js`, `catalog.js` |

## People moving around

| Id  | What                                                                                                                                           | Where               | File          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------- |
| P1  | Pedestrians in parties: alone, two, three, with a child (beside or on the shoulders), pram, buggy, dog, wheelchair (alone or pushed), crutches | inner city footways | `walkers.js`  |
| P2  | Rhine swimmers and joggers with dry bags                                                                                                       | Rheinweg round      | `swimmers.js` |
| P3  | Cyclists and e-scooter riders                                                                                                                  | Kleinbasel bank     | `runners.js`  |

## Vehicles one drives or flies

| Id  | What                               | Where                                 | File                          |
| --- | ---------------------------------- | ------------------------------------- | ----------------------------- |
| V1  | Police vans (one unmarked)         | St. Johann, Klybeck, Claraplatz       | `police.js`, `catalog.js`     |
| V2  | Ambulance                          | WGS84 47.5613, 7.5854                 | `ambulance.js`, `catalog.js`  |
| V3  | Turntable ladder fire truck        | fire station                          | `firetruck.js`, `catalog.js`  |
| V4  | Motorcycles (one poison green)     | Claraplatz                            | `motorcycle.js`, `catalog.js` |
| V5  | A quad                             | Claraplatz                            | `quad.js`, `catalog.js`       |
| V6  | Traxxas XRT                        | St. Johanns-Park                      | `xrt.js`, `catalog.js`        |
| V7  | Tank                               | Kaserne                               | `tank.js`, `catalog.js`       |
| V8  | Drone                              | over the Münster's roof               | `drone.js`, `catalog.js`      |
| V9  | Dinosaur                           | Merian Gärten                         | `dino.js`, `catalog.js`       |
| V10 | Rega H145 and AW109 on helipads    | Universitätsspital roof               | `rega.js`, `catalog.js`       |
| V11 | Fighter jet                        | BIZ tower roof                        | `jet.js`, `catalog.js`        |
| V12 | UFO                                | Novartis Campus                       | `ufo.js`, `catalog.js`        |
| V13 | Two airliners, circling            | over the city                         | `aircraft.js`, `catalog.js`   |
| V14 | Yellow attack helicopter, circling | over the serpent and the Roche towers | `aircraft.js`, `catalog.js`   |
| V15 | Fireboat                           | Rhine                                 | `boats.js`, `catalog.js`      |
| V16 | Police speedboat                   | Rhine                                 | `boats.js`, `catalog.js`      |

## Traffic one rides along

| Id  | What                                                                  | Where      | File                       |
| --- | --------------------------------------------------------------------- | ---------- | -------------------------- |
| T1  | Road vehicles: cars, SUVs, sports cars, vans, lorries, tippers, buses | roads      | `movers.js`, `vehicles.js` |
| T2  | Trams (Flexity)                                                       | tram lines | `movers.js`, `vehicles.js` |
| T3  | Trains: SBB coaches, goods wagons                                     | rail lines | `movers.js`, `vehicles.js` |
| T4  | Ships: tankers, container ships, passenger ships, speedboats          | Rhine      | `ships.js`                 |
| T5  | The four ferries                                                      | Rhine      | `ferries.js`               |

## Effects

| What                                        | File            |
| ------------------------------------------- | --------------- |
| Explosions, scorch marks, falling buildings | `explosions.js` |
| Rockets, missiles, shells                   | `rockets.js`    |
| Splashes round wheels on the Rhine          | `splash.js`     |

## Every number

Each plate in the museum, so a number names one thing; `npm run inventory` checks this list and
the ids above against the plates. The variants and groups after a dash follow the order of their
places (`catalog.js`), spots (`museum.js`) or turns (`movers.js`, `ships.js`); a change there
renumbers them, so this list goes with it.

A click on a plate pins where its kind (or variant) is in the city, if it keeps to one place;
the bigger plate "Pins" pins or unpins all at once, below the biggest, "Museum".

| Id    | Plate                                                    |
| ----- | -------------------------------------------------------- |
| L1    | Basiliskbrunnen                                          |
| S1    | Old man feeding swans                                    |
| S2    | Sunbathing, yoga and dancing                             |
| S3    | Men in Kleinbasel (all 30)                               |
| S4    | Women in Kleinbasel (all 16)                             |
| S5-1  | Friends dancing on the western Roche tower               |
| S5-2  | Friends dancing on the eastern Roche tower (other looks) |
| S6    | Girl on a bike and her sister                            |
| S7    | Football training                                        |
| S8    | Fasnacht clique                                          |
| A1-1  | Elephants                                                |
| A1-2  | Rhinos                                                   |
| A1-3  | Giraffes                                                 |
| A1-4  | Hippos                                                   |
| A1-5  | Zebras                                                   |
| A1-6  | Seals                                                    |
| A1-7  | Deer                                                     |
| A1-8  | Flamingos (by the hippos and amid the seals)             |
| A1-9  | Boars                                                    |
| A1-10 | Donkeys                                                  |
| A1-11 | Chamois                                                  |
| A1-12 | Goats (twice in the city)                                |
| A1-13 | Foxes                                                    |
| A1-14 | Crocodile                                                |
| A1-15 | Monkeys                                                  |
| A1-16 | Penguins                                                 |
| A1-17 | Swans                                                    |
| A1-18 | Ducks                                                    |
| A1-19 | Geese                                                    |
| A1-20 | Wildcat                                                  |
| A1-21 | Lynx                                                     |
| A1-22 | Howling wolf                                             |
| A1-23 | Wolf (twice in the city)                                 |
| A1-24 | Wisents                                                  |
| A2    | Whales (passing with the ships)                          |
| A3    | Sea serpent                                              |
| A4    | Birds                                                    |
| V1-1  | Police van                                               |
| V1-2  | Police van, unmarked                                     |
| V2    | Ambulance                                                |
| V3    | Fire truck                                               |
| V4-1  | Motorcycle                                               |
| V4-2  | Motorcycle, poison green                                 |
| V5    | Quad                                                     |
| V6    | Traxxas XRT                                              |
| V7    | Tank                                                     |
| V8    | Drone                                                    |
| V9    | Dinosaur                                                 |
| V10-1 | Rega helicopter H145                                     |
| V10-2 | Rega helicopter AW109                                    |
| V11   | Fighter jet                                              |
| V12   | UFO                                                      |
| V13   | Airliner                                                 |
| V14   | Attack helicopter                                        |
| V15   | Fireboat                                                 |
| V16   | Police boat                                              |
| T1-1  | Car                                                      |
| T1-2  | SUV                                                      |
| T1-3  | Sports car                                               |
| T1-4  | Van                                                      |
| T1-5  | Lorry                                                    |
| T1-6  | Tipper                                                   |
| T1-7  | Bus                                                      |
| T2-1  | Tram, BVB green                                          |
| T2-2  | Tram, BLT yellow                                         |
| T3-1  | Passenger train                                          |
| T3-2  | Goods train                                              |
| T4-1  | Tanker                                                   |
| T4-2  | Container ship                                           |
| T4-3  | Passenger ship                                           |
| T4-4  | Speedboat                                                |
| T5    | Ferry                                                    |
| P1    | Pedestrians                                              |
| P2    | Rhine swimmers (with swans)                              |
| P3-1  | Cyclists                                                 |
| P3-2  | Scooters                                                 |
