// The catalog: what is placed in the city (INVENTORY.md), each kind once, under an id given to no
// other, ever (L landmarks, A animals, S scenes, P people moving, V what one drives or flies, T
// traffic): its name, its places in the city (scene x, z, …) and make(places, city), which builds
// it there and returns { objects: for the scene, … what else others need of it }; city: what the
// maker takes from src/main.js. src/main.js builds each at its places (build); kinds not yet here
// it still builds itself.
import * as THREE from "three";
import { BASILISKS, createBasilisks } from "./basilisks.js";
import { createBike } from "./bike.js";
import { createClique } from "./fasnacht.js";
import { createTraining } from "./football.js";
import { LV95, fromWGS84 } from "./geo.js";
import { TOSS, createPeople, mix } from "./people.js";
import { createPolice } from "./police.js";
import { createSwans, createZoo } from "./zoo.js";

const at = (lat, lon) => {
  const [x, z] = fromWGS84(lat, lon);
  return { x, z };
};
const lv95 = ([e, n]) => ({ x: e - LV95[0], z: LV95[1] - n });
// The middle of scene points ({ x, z }).
const middleOf = (points) => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  z: points.reduce((sum, p) => sum + p.z, 0) / points.length,
});
// These points moved by (dx, dz).
const moved = (points, dx, dz) => points.map((p) => ({ ...p, x: p.x + dx, z: p.z + dz }));

// The old man in a cap sitting on a cloth (S1), tilted forward with the slope, tossing bread to
// a swan family that looks at him: a cygnet among its parents. Each swan metres east and south of
// him, as on the Rhine's bank in St. Johann, and its size; elsewhere turned by turn radians about
// him.
const FEEDER = at(47.565768, 7.583695);
const FAMILY = [
  [47.565727, 7.583781, 1.5],
  [47.565771, 7.583791, 0.9],
  [47.565822, 7.583738, 1.5],
].map(([lat, lon, size]) => {
  const { x, z } = at(lat, lon);
  return [x - FEEDER.x, z - FEEDER.z, size];
});
const OLD_MAN = {
  body: "man",
  skin: 0xe8c4a8,
  hair: 0xd0d0d0,
  top: 0x6b5a45,
  bottom: 0x8a8070,
  shoes: 0x3a2a1c,
  hat: 0x2f3b4c,
  head: "cap",
};
function feeder({ x, z, turn = 0 }, { heightAt, towel, TOWEL }) {
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const family = FAMILY.map(([dx, dz, size]) => {
    const [sx, sz] = [x + dx * c + dz * s, z - dx * s + dz * c];
    const heading = Math.atan2(x - sx, z - sz);
    return { x: sx, y: heightAt(sx, sz), z: sz, heading, size, young: size < 1 };
  });
  // Facing the cygnet, tilted as the ground falls over 1 m that way.
  const facing = Math.atan2(family[1].x - x, family[1].z - z);
  const y = heightAt(x, z);
  const tilt = Math.atan(y - heightAt(x + Math.sin(facing), z + Math.cos(facing)));
  const man = { x, y, z, heading: facing, tilt };
  // The bread leaves his right hand (as src/people.js has it sitting, leaning back, the arm ahead)
  // each time his arm is furthest ahead (phase 0).
  const hand = new THREE.Vector3(-0.28, 0.83, 0.31)
    .applyEuler(new THREE.Euler(tilt, facing, 0, "YXZ"))
    .add(new THREE.Vector3(x, y + TOWEL, z));
  const swans = createSwans(family, hand, (2 * Math.PI) / TOSS, Math.PI / 2 / TOSS);
  const cloth = new THREE.BoxGeometry(1.1, 0.02, 1.5).translate(0, TOWEL - 0.01, 0.35);
  return {
    objects: [
      ...swans.meshes,
      towel(man, 0x24539e, cloth),
      ...createPeople([{ ...man, y: y + TOWEL, pose: "sit" }], [OLD_MAN]),
    ],
    update: swans.update,
  };
}

// Women in bikinis in a park (S2), round LV95 2610513, 1268550: on their backs on beach towels
// (towel, 0.9 by 2 m), one sunbathing, her head to the south, on a blue towel, one making a snow
// angel, her head to the north, on a red one; their friends: three doing yoga in a row facing
// west, one lying on her back on a pink towel, her head to the east, spreading her arms and legs
// up, SLIDE metres back on it from its foot, two dancing facing each other. Each [LV95 east,
// north, heading, pose, look, its towel's colour if on one], made metres east and south of their
// middle (PARK); elsewhere all turned by turn radians about it. The friends' looks (FRIENDS) are
// those of the women dancing on the Roche towers too (S5).
const BIKINI = {
  body: "swim",
  skin: 0xe8b996,
  hair: 0x7a3a1a,
  top: 0xe8175d,
  bottom: 0xe8175d,
  head: "long",
};
const ANGEL = { ...BIKINI, skin: 0xf1c7a5, hair: 0xe2c46e, top: 0x111111, bottom: 0x111111 };
const FRIENDS = mix(
  {
    body: ["swim"],
    skin: [0xf1c7a5, 0x8a5634, 0xd9a27a, 0xf6d5b8, 0xc58c5c],
    hair: [0x111111, 0xe2c46e, 0x2a1d14, 0x7a3a1a],
    top: [0x1e88e5, 0xffd600, 0x111111, 0x00bcd4, 0xff6f00],
    bottom: [0x1e88e5, 0xffd600, 0x111111, 0x00bcd4, 0xff6f00],
    head: ["long", "long", "hair", "long", "long"],
  },
  6,
);
const SLIDE = 0.5;
const PARK = (() => {
  const women = [
    [2610512.9, 1268549.5, 0, "lie", BIKINI, 0x1e88e5],
    [2610510.6, 1268549.7, Math.PI, "angel", ANGEL, 0xd32f2f],
    [2610515.3, 1268549.5, -Math.PI / 2, "yoga", FRIENDS[0]],
    [2610515.3, 1268548.5, -Math.PI / 2, "yoga", FRIENDS[1]],
    [2610515.3, 1268547.5, -Math.PI / 2, "yoga", FRIENDS[2]],
    [2610513, 1268550.8, Math.PI / 2, "up", FRIENDS[3], 0xec407a],
    [2610510.8, 1268552.2, Math.PI / 2, "dance", FRIENDS[4]],
    [2610512.2, 1268552.2, -Math.PI / 2, "dance", FRIENDS[5]],
  ].map(([e, n, ...rest]) => [e - LV95[0], LV95[1] - n, ...rest]);
  const middle = [0, 1].map((k) => women.reduce((sum, w) => sum + w[k], 0) / women.length);
  return {
    middle: { x: middle[0], z: middle[1] },
    women: women.map(([x, z, ...rest]) => [x - middle[0], z - middle[1], ...rest]),
  };
})();
function park({ x, z, turn = 0 }, { parked, towel, TOWEL }) {
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const places = parked(
    PARK.women.map(([dx, dz, heading, pose]) => ({
      x: x + dx * c + dz * s,
      z: z - dx * s + dz * c,
      heading: heading + turn,
      pose,
    })),
  );
  const towels = PARK.women.flatMap(([, , , , , colour], k) =>
    colour === undefined ? [] : [towel(places[k], colour)],
  );
  // On a towel, raised onto it; legs up, slid back on it.
  const lying = places.map((p, k) => {
    if (PARK.women[k][5] === undefined) return p;
    const slide = p.pose === "up" ? SLIDE : 0;
    const [sx, sz] = [Math.sin(p.heading) * slide, Math.cos(p.heading) * slide];
    return { ...p, x: p.x - sx, y: p.y + TOWEL, z: p.z - sz };
  });
  return [
    ...towels,
    ...createPeople(
      lying,
      PARK.women.map(([, , , , look]) => look),
    ),
  ];
}

// Black men in Kleinbasel (S3), each in other clothes, some with a cap or beanie, some
// facing a point of their own.
const MEN = [
  [2611652.0, 1267913.7],
  [2611650.0, 1267913.0],
  [2611649.8, 1267914.9],
  [2611651.4, 1267915.3],
  [2611638.7, 1267929.8],
  [2611592.6, 1267974.9],
  [2611589.4, 1267977.4],
  [2611558.4, 1267983.2],
  [2611520.5, 1268060.2],
  [2611513.8, 1268085.4],
  [2611507.0, 1268105.0],
  [2611496.3, 1268113.9],
  [2611502.3, 1268125.4],
  [2611491.6, 1268139.5],
  [2611491.0, 1268184.5],
  [2611491.9, 1268221.2],
  [2611491.5, 1268228.4],
  [2611510.1, 1268207.5],
  [2611479.0, 1268301.9],
  [2611480.1, 1268309.8],
  [2611476.2, 1268320.4],
  [2611498.4, 1268292.8],
  [2611494.9, 1268305.5],
  [2611689.5, 1267931.0],
  [2611698.6, 1267929.3],
  [2611708.8, 1267932.1],
  [2611709.9, 1267942.5],
  [2611722.2, 1267940.4],
  [2611599.3, 1267967.0, [2611590.3, 1267962.5]], // facing the Untere Rebgasse
  [2611623.5, 1267941.5, [2611616.0, 1267932.8]],
];
const MEN_LOOKS = mix(
  {
    body: ["man"],
    skin: [0x4a2c1a, 0x5a3520, 0x3d2416, 0x6b4128, 0x7a4a2a],
    hair: [0x111111],
    top: [0xffffff, 0x1e7d4a, 0x111111, 0xf2c94c, 0xc0392b, 0x1e88e5, 0x6b6b6b, 0xff6f00],
    bottom: [0x3b4d6b, 0x222222, 0x6b6b6b, 0x1d1d1d, 0xc2a878, 0x2f4f2f, 0x4a5d7a],
    shoes: [0xffffff, 0x111111, 0xeeeeee, 0x1d1d1d],
    head: ["cap", "hair", "beanie", "backcap", "hair", "beanie"],
    hat: [0xc0392b, 0, 0x111111, 0x1b2333, 0, 0x8b0000],
  },
  MEN.length,
);
// Sex workers in a lane in Kleinbasel (S4), from the top down, facing up it, each in other clothes.
const WOMEN = [
  [2611561.3, 1267979.2],
  [2611556.8, 1267977.7],
  [2611560.4, 1267982.1],
  [2611540.8, 1267967.4],
  [2611537.0, 1267968.0],
  [2611535.6, 1267964.4],
  [2611531.8, 1267965.0],
  [2611551.6, 1267974.2],
  [2611550.2, 1267970.7],
  [2611546.4, 1267971.2],
  [2611545.0, 1267967.7],
  [2611514.7, 1267958.2],
  [2611519.1, 1267957.5],
  [2611521.5, 1267961.1],
  [2611525.9, 1267960.4],
  [2611528.3, 1267964.1],
];
// Each [skin, hair, top, skirt, boots].
const WOMEN_LOOKS = [
  [0x8a5634, 0x111111, 0xff2d8a, 0x111111, 0xff2d8a], // pink and black
  [0xf1c7a5, 0xe2c46e, 0xe8e8e8, 0xd81b60, 0xe8e8e8], // white and pink
  [0xd9a27a, 0x7a2a1a, 0x8e24aa, 0x8e24aa, 0x111111], // purple
  [0xc58c5c, 0x111111, 0xd32f2f, 0xd32f2f, 0xd32f2f], // red
  [0xf1c7a5, 0x2a1d14, 0xffd600, 0x111111, 0x111111], // yellow and black
  [0x6b4128, 0x111111, 0x00bcd4, 0xffffff, 0xffffff], // turquoise and white
  [0xe8b996, 0xe2c46e, 0x111111, 0xd81b60, 0xd81b60], // black and pink
  [0xd9a27a, 0x111111, 0xc0c0c0, 0x111111, 0x111111], // silver and black
  [0x8a5634, 0x7a2a1a, 0x76ff03, 0x111111, 0x76ff03], // lime and black
  [0xf1c7a5, 0x7a2a1a, 0xff6f00, 0xff6f00, 0x111111], // orange
  [0xc58c5c, 0x2a1d14, 0x1e88e5, 0xe8e8e8, 0x1e88e5], // blue and white
  [0xe8b996, 0x111111, 0xffffff, 0xffffff, 0xffffff], // white
  [0x6b4128, 0xe2c46e, 0xffc107, 0xffc107, 0x111111], // gold
  [0xf1c7a5, 0x7a2a1a, 0x111111, 0x111111, 0x111111], // black
  [0xd9a27a, 0x2a1d14, 0x64ffda, 0x111111, 0x64ffda], // mint and black
  [0x8a5634, 0x111111, 0xff4081, 0x311b92, 0x311b92], // pink and indigo
].map(([skin, hair, top, bottom, shoes]) => ({ body: "night", skin, hair, top, bottom, shoes }));
// People standing at LV95 points (S3, S4), with these looks in turn, each facing its own point (a
// third entry), else toward a point (turned up to SPREAD radians away, each a little otherwise) or
// else the others within NEAR metres, or alone k radians from south; in the museum, spread over
// too long a way, in a row across its place, ROW metres apart, facing as it (its heading). A kind
// of the catalog, its place their middle.
const [SPREAD, NEAR, ROW] = [0.5, 10, 1.2];
function standing(points, looks, toward) {
  const city = points.map(lv95);
  const facing = (p, { x, z }) => Math.atan2(x - p.x, z - p.z);
  const target = toward && lv95(toward);
  const headed = city.map((p, k) => {
    const own = points[k][2];
    if (own) return { ...p, heading: facing(p, lv95(own)) };
    if (target) return { ...p, heading: facing(p, target) + SPREAD * Math.sin(k * 2.7) };
    const near = city.filter((q) => q !== p && Math.hypot(q.x - p.x, q.z - p.z) < NEAR);
    return { ...p, heading: near.length ? facing(p, middleOf(near)) : k };
  });
  return {
    places: [middleOf(city)],
    make: (places, { parked }) => ({
      objects: places.flatMap((place) =>
        createPeople(
          parked(
            place.museum
              ? city.map((_, k) => {
                  const along = (k - (city.length - 1) / 2) * ROW; // eastwards, across it
                  const [c, s] = [Math.cos(place.heading), Math.sin(place.heading)];
                  return { x: place.x + along * c, z: place.z - along * s, heading: place.heading };
                })
              : headed,
          ),
          looks,
        ),
      ),
    }),
  };
}

// Four women dressed as the park's friends (FRIENDS) dancing 2 m round the middle of each Roche
// tower's roof (S5), each looking out another way (north-east, south-east, south-west,
// north-west); roofAt(point): the roof of the standing building there (none if the tower is
// destroyed). With them their tower's building number (roofs), so they go with it; in the museum
// on the ground.
const TOWERS = [
  [2612702, 1267635],
  [2612756, 1267585],
];
function dancing(places, { roofAt, heightAt }) {
  const [objects, roofs] = [[], []];
  for (const place of places) {
    const { x, z } = place;
    const roof = place.museum ? { x, y: heightAt(x, z), z } : roofAt(TOWERS[place.tower]);
    if (!roof) continue;
    const meshes = createPeople(
      [3, 1, -1, -3].map((k) => {
        const heading = (k * Math.PI) / 4;
        const [hx, hz] = [Math.sin(heading), Math.cos(heading)];
        return { x: roof.x + 2 * hx, y: roof.y, z: roof.z + 2 * hz, heading, pose: "dance" };
      }),
      FRIENDS.slice(2 * place.tower),
    );
    objects.push(...meshes);
    if (!place.museum) roofs.push([roof.number, meshes]);
  }
  return { objects, roofs };
}

// A girl on her pink bike (src/bike.js) to and fro on the path from WGS84 47.571822, 7.599996 to
// 47.571540, 7.601622, her little sister running after her (S6); elsewhere the path moved there.
const BIKE_PATH = [at(47.571822, 7.599996), at(47.57154, 7.601622)];

// A training game on St. Jakob-Park's pitch (src/football.js) between goals at LV95 2613704.8,
// 1265649.7 and 2613621.4, 1265686.0 (S7): goalkeepers in green, two teams in the club's kit, one
// in orange bibs; eleven against eleven, then aside: the head coach and his assistant at the north
// touchline, the third goalkeeper and the goalkeeping coach facing each other behind the first
// goal, throwing a ball; elsewhere the pitch moved there.
const GOALS = [
  [2613704.8, 1265649.7],
  [2613621.4, 1265686.0],
].map(lv95);
const KIT = {
  body: "player",
  top: 0x1d3fbf,
  bottom: 0x1d3fbf,
  hat: 0xd51f2a, // sleeves and socks
};
const KEEPER = { ...KIT, top: 0x2e7d32, bottom: 0x111111, hat: 0x2e7d32 };
const STAFF = { body: "man", top: 0x222222, bottom: 0x222222, shoes: 0xffffff };
const PLAYERS = [
  { ...KEEPER, skin: 0xe8b996, hair: 0x2a1d14 },
  { ...KEEPER, skin: 0x8a5634, hair: 0x111111 },
  ...mix(
    {
      ...Object.fromEntries(Object.entries(KIT).map(([key, value]) => [key, [value]])),
      top: [0x1d3fbf, 0xff6f00], // teams 0 and 1, in bibs
      skin: [0xe8b996, 0x6b4128, 0xd9a27a, 0xf1c7a5, 0x8a5634, 0xc58c5c, 0x4a2c1a],
      hair: [0x2a1d14, 0x111111, 0xe2c46e, 0x3a2414, 0x7a3a1a],
      shoes: [0x111111, 0x111111, 0xff6f00],
    },
    20,
  ),
];
const ASIDE = [
  { u: -6, v: -41, face: Math.PI / 2, look: { ...STAFF, skin: 0xe8b996, hair: 0x3a2414 } },
  { u: 6, v: -41, face: Math.PI / 2, look: { ...STAFF, skin: 0xd9a27a, hair: 0x111111 } },
  { u: -51, v: -20, face: Math.PI / 2, look: { ...KEEPER, skin: 0xf1c7a5, hair: 0xe2c46e } },
  { u: -51, v: -14, face: -Math.PI / 2, look: { ...STAFF, skin: 0xc58c5c, hair: 0x8a8a8a } },
];
const DRILL = [3, 2]; // the goalkeeping coach throws, the third goalkeeper catches

// A Fasnacht clique (src/fasnacht.js) marching round the Marktplatz, along its middle east of the
// tram tracks, 8 m or more from them (S8); elsewhere its loop moved there. With them all cliques
// (cliques), whose zones others keep off.
const MARCH = [at(47.558424, 7.58759), at(47.557929, 7.58797)];

// The animals (A1, src/zoo.js) at LV95 points, each group with its heading: of the Zoo Basel
// (flamingos beside the hippos and amid the seals), a crocodile in the Merian Gärten, and wild
// boars, foxes, a wildcat, red deer, chamois, swans, goats (twice), small monkeys, ducks, geese, a
// lynx, donkeys, wolves (twice), a howling wolf and wisents (twice) in the Lange Erlen; clear(x, z,
// r): whether no tree reaches within r metres there. In the museum one of each group, named after
// it and numbered in this order (src/museum.js, ZOO).
const ANIMALS = [
  ["elephants", 2610681.3, 1266433.3, -1],
  ["rhinos", 2610587.7, 1266255.8, 0.8],
  ["giraffes", 2610723.6, 1266483.0, 0.5],
  ["hippos", 2610590.8, 1266337.9, 1],
  ["zebras", 2610415.1, 1266286.4, 2],
  ["seals", 2610402.7, 1266201.5, 0],
  ["deer", 2612649.0, 1269188.8, 0],
  ["flamingos", 2610587.3, 1266337.9, 1], // beside the hippos
  ["flamingos", 2610409.0, 1266203.4, 0], // amid the seals
  ["boars", 2612577.6, 1269243.4, 0],
  ["donkeys", 2612959.8, 1269327.0, 0],
  ["chamois", 2612705.9, 1269201.7, 0],
  ["goats", 2612720.7, 1269278.9, 0],
  ["goats", 2612871.7, 1269272.5, 1.5],
  ["foxes", 2612577.1, 1269194.8, 0],
  ["crocodile", 2613500.5, 1264409.6, 0],
  ["monkeys", 2612733.4, 1269327.0, 0],
  ["penguins", 2610437.5, 1266003.1, 0],
  ["swans", 2612675.9, 1269269.7, 0],
  ["ducks", 2612756.0, 1269255.9, 0],
  ["geese", 2612797.5, 1269228.5, 0],
  ["wildcat", 2612617.9, 1269241.3, 0],
  ["lynx", 2612850.6, 1269239.8, 0],
  ["howling wolf", 2612841.2, 1269383.6, -1.2],
  ["wolf", 2612810.9, 1269370.5, 1.8],
  ["wolf", 2612805.8, 1269381.3, 0.4],
  ["wisents", 2612861.8, 1269335.7, 0.3],
  ["wisents", 2612915.8, 1269373.7, -1.4],
].map(([group, e, n, heading]) => ({ group, ...lv95([e, n]), heading }));

export const CATALOG = {
  L1: {
    name: "Basiliskbrunnen",
    places: BASILISKS.map(([lat, lon]) => at(lat, lon)),
    // On the ground, facing the Rhine where it is near (towardsRhine), else turned as it may.
    make(places, { heightAt, towardsRhine }) {
      const list = places.map(({ x, z }, k) => {
        const heading = towardsRhine(x, z) ?? k * 2.4;
        return { x, y: heightAt(x, z), z, heading };
      });
      return { objects: [createBasilisks(list)] };
    },
  },
  S1: {
    name: "Old man feeding swans",
    places: [FEEDER],
    make(places, city) {
      const scenes = places.map((place) => feeder(place, city));
      return {
        objects: scenes.flatMap(({ objects }) => objects),
        update: (seconds) => scenes.forEach(({ update }) => update(seconds)),
      };
    },
  },
  S2: {
    name: "Sunbathing, yoga and dancing",
    places: [PARK.middle],
    make: (places, city) => ({ objects: places.flatMap((place) => park(place, city)) }),
  },
  S3: { name: "Men in Kleinbasel", ...standing(MEN, MEN_LOOKS) },
  S4: { name: "Women in a lane", ...standing(WOMEN, WOMEN_LOOKS, [2611565.3, 1267979.1]) },
  S5: {
    name: "Friends dancing on the Roche towers",
    places: TOWERS.map((point, tower) => ({ ...lv95(point), tower })),
    make: dancing,
  },
  S6: {
    name: "Girl on a bike and her sister",
    places: [middleOf(BIKE_PATH)],
    make(places, { heightAt }) {
      const middle = middleOf(BIKE_PATH);
      const rides = places.map(({ x, z }) =>
        createBike(
          moved(BIKE_PATH, x - middle.x, z - middle.z).map((p) => [p.x, p.z]),
          heightAt,
        ),
      );
      return {
        objects: rides.flatMap(({ objects }) => objects),
        update: (dt) => rides.forEach(({ update }) => update(dt)),
      };
    },
  },
  S7: {
    name: "Football training",
    places: [middleOf(GOALS)],
    make(places, { parked }) {
      const middle = middleOf(GOALS);
      const games = places.map(({ x, z }) =>
        createTraining(parked(moved(GOALS, x - middle.x, z - middle.z)), PLAYERS, ASIDE, DRILL),
      );
      return {
        objects: games.flatMap(({ objects }) => objects),
        update: (dt) => games.forEach(({ update }) => update(dt)),
      };
    },
  },
  S8: {
    name: "Fasnacht clique",
    places: [middleOf(MARCH)],
    make(places, { heightAt }) {
      const middle = middleOf(MARCH);
      const cliques = places.map(({ x, z }) =>
        createClique(
          moved(MARCH, x - middle.x, z - middle.z).map((p) => [p.x, p.z]),
          heightAt,
        ),
      );
      return { objects: cliques.flatMap(({ meshes }) => meshes), cliques };
    },
  },
  A1: {
    name: "Animals",
    places: ANIMALS,
    make(places, { heightAt, clear }) {
      const zoo = createZoo(places, heightAt, clear);
      return { objects: zoo.meshes, update: zoo.update };
    },
  },
  V1: {
    // In St. Johann and on the Rhine in Klybeck by the Dreirosenbrücke, both facing south, and on
    // the Claraplatz by the men there (LV95 2611656.5, 1267907.4), facing southwest, an unmarked
    // one 3 m to its left and 3 m back.
    name: "Police van",
    places: [
      { x: -1002.3, z: -765.7, heading: 0 },
      { x: 133.6, z: -1437.5, heading: -0.05 },
      { x: 656.5, z: -507.4, heading: -0.93 },
      { x: 660.7, z: -506.8, heading: -0.93, unmarked: true },
    ],
    make(places, { parked, boost, world }) {
      const vans = createPolice(parked(places), boost, world);
      return { objects: vans.map(({ group }) => group), vehicles: vans };
    },
  },
};
