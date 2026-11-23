# Inventory

Everything placed in the city, found by going through every `scene.add` (35 in `src/main.js`, 4 in
`src/explosions.js` and `src/rockets.js`). The basis for a catalog (one list the city and the
museum are both built from). The museum (`src/museum.js`) is not listed here.

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

| What                                     | Where                 | File                                 |
| ---------------------------------------- | --------------------- | ------------------------------------ |
| 31 Basiliskbrunnen                       | all over the city     | `basilisks.js`                       |
| St. Jakob-Park in FC Basel's colours     | St. Jakob             | `main.js`                            |
| Roche's buildings, a green roof grey     | Roche site            | `main.js`                            |
| Basel SBB: platform roofs, front, clocks | Basel SBB             | `main.js`, `station.js`, `clocks.js` |
| Badischer Bahnhof's platform roofs       | Badischer Bahnhof     | `main.js`                            |
| Fire station: grey, gates, name          | WGS84 47.5562, 7.5824 | `firestation.js`                     |
| Rainbow flags on the Münster's towers    | Münster               | `pride.js`                           |
| Elisabethenkirche in rainbow stripes     | Elisabethenkirche     | `main.js`, `pride.js`                |
| A building with old-town windows         |                       | `main.js`, `facade.js`               |
| Novartis Pavillon's light show           | Novartis Campus       | `pavilion.js`                        |
| "PUMA" mown into a lawn                  | Erlenmatt             | `lawn.js`                            |
| Graffiti (FCB pieces and tags)           | GRAFFITI list         | `graffiti.js`                        |

## Animals

| What                                                                                                                 | Where                         | File                   |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------- |
| Zoo: giraffes, elephants, zebras, rhinos, penguins, hippos, seals, flamingos, howler and small monkeys               | Zoo Basel                     | `zoo.js`               |
| A crocodile                                                                                                          | Merian Gärten                 | `zoo.js`               |
| Wild boars, foxes, a wildcat, red deer, chamois, swans, ducks, geese, goats (twice), a lynx, donkeys, wolves (twice) | Lange Erlen                   | `zoo.js`               |
| A swan family, fed by the old man                                                                                    | Rhine bank, St. Johann        | `zoo.js` (createSwans) |
| 12 flocks of birds                                                                                                   | bridges, parks, squares       | `birds.js`             |
| Whale families among the ships                                                                                       | Rhine                         | `ships.js`             |
| The sea serpent                                                                                                      | Rhine before the Roche towers | `serpent.js`           |

## People in scenes

| What                                                             | Where                        | File                   |
| ---------------------------------------------------------------- | ---------------------------- | ---------------------- |
| Black men, each in other clothes                                 | Kleinbasel                   | `main.js` (MEN)        |
| Sex workers in a lane                                            | Kleinbasel                   | `main.js` (WOMEN)      |
| Women sunbathing on towels                                       |                              | `main.js` (SUNBATHERS) |
| A yoga row and dancing friends, some on towels                   | around LV95 2610515, 1268548 | `main.js` (friends)    |
| The old man in a cap feeding the swans                           | Rhine bank, St. Johann       | `main.js`              |
| Four friends dancing on each Roche tower                         | Roche towers                 | `main.js`              |
| A Fasnacht clique: drum major, pipers, drummers                  | Marktplatz                   | `fasnacht.js`          |
| Football training: teams, goalkeepers, coaches, a throwing drill |                              | `football.js`          |
| A girl on her pink bike, her sister on a tricycle                | Erlenmatt                    | `bike.js`              |

## People moving around

| What                                                                                                                                           | Where               | File          |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------- |
| Pedestrians in parties: alone, two, three, with a child (beside or on the shoulders), pram, buggy, dog, wheelchair (alone or pushed), crutches | inner city footways | `walkers.js`  |
| Rhine swimmers and joggers with dry bags                                                                                                       | Rheinweg round      | `swimmers.js` |
| Cyclists and e-scooter riders                                                                                                                  | Kleinbasel bank     | `runners.js`  |

## Vehicles one drives or flies

| What                                   | Where                                 | File                       |
| -------------------------------------- | ------------------------------------- | -------------------------- |
| Police vans (one unmarked)             | St. Johann, Klybeck, Claraplatz       | `police.js`                |
| Ambulance                              | WGS84 47.5613, 7.5854                 | `ambulance.js`             |
| Turntable ladder fire truck            | fire station                          | `firetruck.js`             |
| Motorcycles (one poison green), a quad | Claraplatz                            | `motorcycle.js`, `quad.js` |
| Traxxas XRT                            | St. Johanns-Park                      | `xrt.js`                   |
| Tank                                   | Kaserne                               | `tank.js`                  |
| Dinosaur                               | Merian Gärten                         | `dino.js`                  |
| Drone                                  | over the Münster's roof               | `drone.js`                 |
| Fireboat, police speedboat             | Rhine                                 | `boats.js`                 |
| Rega H145 and AW109 on helipads        | Universitätsspital roof               | `rega.js`                  |
| Fighter jet                            | BIZ tower roof                        | `jet.js`                   |
| UFO                                    | Novartis Campus                       | `ufo.js`                   |
| Yellow attack helicopter, circling     | over the serpent and the Roche towers | `aircraft.js`              |
| Two airliners, circling                | over the city                         | `aircraft.js`              |

## Traffic one rides along

| What                                                                  | Where      | File                       |
| --------------------------------------------------------------------- | ---------- | -------------------------- |
| Trams (Flexity)                                                       | tram lines | `movers.js`, `vehicles.js` |
| Trains: SBB coaches, goods wagons                                     | rail lines | `movers.js`, `vehicles.js` |
| Road vehicles: cars, SUVs, sports cars, vans, lorries, tippers, buses | roads      | `movers.js`, `vehicles.js` |
| Ships: tankers, container ships, passenger ships, speedboats          | Rhine      | `ships.js`                 |
| The four ferries                                                      | Rhine      | `ferries.js`               |

## Effects

| What                                        | File            |
| ------------------------------------------- | --------------- |
| Explosions, scorch marks, falling buildings | `explosions.js` |
| Rockets, missiles, shells                   | `rockets.js`    |
| Splashes round wheels on the Rhine          | `splash.js`     |
