// The Unterer Rheinweg's passage through the Mittlere Brücke's Kleinbasel end, whose walls the
// bridge model has but which swissALTI3D fills up to the deck, with the bank beside it. The
// viewer puts their own ground in its place (src/main.js): the passage's floor straight between
// its ends, level across its width and on to the bank's edge, from there falling to the Rhine.
// tools/map.mjs draws its road along it.
export const PASSAGE = {
  ends: [
    [47.56097, 7.590474],
    [47.560366, 7.591132],
  ], // WGS84, of its middle
  width: 8, // metres
  // The bank's edge on the Rhine side (WGS84), from north to south.
  bank: [
    [47.560951, 7.590442],
    [47.560821, 7.59051],
    [47.560702, 7.590589],
    [47.560483, 7.59087],
    [47.560275, 7.591162],
  ],
  water: 15, // metres from the middle to the Rhine's edge (swissALTI3D), where the bank ends
  reach: 20, // metres from the middle towards the Rhine that the ground spans, into the water
  blend: 5, // metres from its ends and its edge in the water over which it meets the terrain
  // Above it, the bridge's sidewalks at its end (WGS84, from the street onto the bridge): there
  // the pedestrians walk only these and the passage (tools/walks.mjs), from STREET metres beside
  // it on the street's side to reach on the Rhine's.
  sidewalks: [
    [
      [47.560799, 7.59087],
      [47.560635, 7.590561],
    ],
    [
      [47.560698, 7.591018],
      [47.560532, 7.590661],
    ],
  ],
  street: 16,
};
