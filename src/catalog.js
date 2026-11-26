// The catalog: what is placed in the city (INVENTORY.md), each kind once, under an id given to no
// other, ever (L landmarks, A animals, S scenes, P people moving, V what one drives or flies, T
// traffic): its name, its places in the city (scene x, z, …) and make(places, city), which builds
// it there and returns { objects: for the scene, … what else others need of it }; city: what the
// maker takes from src/main.js. src/main.js builds each at its places (build); those without make
// it builds itself (see below).
import * as THREE from "three";
import { createHelicopter, createPlanes } from "./aircraft.js";
import { createAmbulances } from "./ambulance.js";
import { BASILISKS, createBasilisks } from "./basilisks.js";
import { createBike } from "./bike.js";
import { FLOCKS, createBirds } from "./birds.js";
import { createBoats } from "./boats.js";
import { createDinos } from "./dino.js";
import { createDrones } from "./drone.js";
import { createClique } from "./fasnacht.js";
import { LANDINGS } from "./ferries.js";
import { createFireTrucks } from "./firetruck.js";
import { createTraining } from "./football.js";
import { LV95, fromWGS84 } from "./geo.js";
import { createJet } from "./jet.js";
import { createM41s } from "./m41.js";
import { createMotorcycles } from "./motorcycle.js";
import { TOSS, TOSS_HAND, createCrowd, createPeople, mix } from "./people.js";
import { createPolice } from "./police.js";
import { createQuads } from "./quad.js";
import { createRega } from "./rega.js";
import { createSerpent } from "./serpent.js";
import { createTanks } from "./tank.js";
import { PLACE as UFO, createUfo } from "./ufo.js";
import { createXrts } from "./xrt.js";
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
function feeder({ x, z, turn = 0 }, { heightAt, towel, TOWEL, danger }) {
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
  const hand = new THREE.Vector3(...TOSS_HAND)
    .applyEuler(new THREE.Euler(tilt, facing, 0, "YXZ"))
    .add(new THREE.Vector3(x, y + TOWEL, z));
  // He tosses bread only while sitting, not fleeing.
  const crowd = createCrowd("man", 1);
  crowd.dress(0, OLD_MAN, "sit");
  crowd.place(0, x, y + TOWEL, z, facing, 0, 1, tilt);
  crowd.mesh.frustumCulled = false; // he may flee
  const swans = createSwans(
    family,
    hand,
    (2 * Math.PI) / TOSS,
    Math.PI / 2 / TOSS,
    heightAt,
    danger,
    () => !crowd.away(0),
  );
  const cloth = new THREE.BoxGeometry(1.1, 0.02, 1.5).translate(0, TOWEL - 0.01, 0.35);
  return {
    objects: [...swans.meshes, towel(man, 0x24539e, cloth), crowd.mesh],
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
// On the M41 (V17), all in shades: at its wheel the sunbather's look; on its rear deck one raising
// champagne, two dancing (DECK).
const SKIPPER = { ...BIKINI, face: "shades" };
const DECK = [
  [0xd9a27a, 0x111111, 0x9be22d, "long"],
  [0xf6d5b8, 0xe2c46e, 0xf4f4f4, "long"],
  [0x8a5634, 0x2a1d14, 0x7b1fa2, "hair"],
].map(([skin, hair, bikini, head]) => ({
  body: "swim",
  skin,
  hair,
  top: bikini,
  bottom: bikini,
  head,
  face: "shades",
}));
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
  [2611498.4, 1268292.8, [2611490.1, 1268291.5]], // facing the Klybeckstrasse
  [2611494.9, 1268305.5, [2611487.7, 1268304.0]], // facing the Klybeckstrasse
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
// tower's roof (S5), each looking out another way (north-east, south-east, south-west, north-west);
// roofAt(point): the roof of the standing building there (none if the tower is destroyed); fleeing
// there round their places, staying on it. With them their tower's building number (roofs), so they
// go with it; in the museum on the ground, fleeing as all.
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
      place.museum || "roof",
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

// The Rega's helipads: the H's upright about from LV95 2610964.8, 1267835.8 towards 2610973.9,
// 1267829.9.
const HELIPADS_FACE = Math.atan2(2610973.9 - 2610964.8, 1267835.8 - 1267829.9);
const [CIRCLE, HELICOPTER] = [150, 6]; // the attack helicopter's: metres round, times life size

// The maker of what one drives, by its create (src/police.js and the like), on the ground or bridge
// at its places.
const driven =
  (create) =>
  (places, { parked, boost, world, danger }) => {
    const vehicles = create(parked(places), boost, world, danger);
    return { objects: vehicles.map(({ group }) => group), vehicles };
  };
// The M41's middle, and a stern and a bow (WGS84) giving its heading.
const M41 = at(47.577778, 7.583406);
const M41_WAY = [at(47.576937, 7.583502), at(47.5768, 7.58351)];
// The maker of boats by their create (src/boats.js and the like), on the water at their places;
// a boat's spray, if it has any, in the scene apart.
const afloat =
  (create) =>
  (places, { heightAt, boost, onWater }) => {
    const boats = create(
      places.map((p) => ({ ...p, y: heightAt(p.x, p.z) })),
      boost,
      onWater,
    );
    return {
      objects: boats.flatMap(({ group, spray }) => (spray ? [group, spray] : group)),
      vehicles: boats,
    };
  };

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
        update: (seconds, dt) => scenes.forEach(({ update }) => update(seconds, dt)),
      };
    },
  },
  S2: {
    name: "Sunbathing, yoga and dancing",
    places: [PARK.middle],
    make: (places, city) => ({ objects: places.flatMap((place) => park(place, city)) }),
  },
  S3: { name: "Men in Kleinbasel", ...standing(MEN, MEN_LOOKS) },
  S4: { name: "Women in Kleinbasel", ...standing(WOMEN, WOMEN_LOOKS, [2611565.3, 1267979.1]) },
  S5: {
    name: "Friends dancing on the Roche towers",
    places: TOWERS.map((point, tower) => ({ ...lv95(point), tower })),
    make: dancing,
  },
  S6: {
    name: "Girl on a bike and her sister",
    places: [middleOf(BIKE_PATH)],
    make(places, { heightAt, danger }) {
      const middle = middleOf(BIKE_PATH);
      const rides = places.map(({ x, z }) =>
        createBike(
          moved(BIKE_PATH, x - middle.x, z - middle.z).map((p) => [p.x, p.z]),
          heightAt,
          danger,
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
    make(places, { heightAt, clear, danger }) {
      const zoo = createZoo(places, heightAt, clear, danger);
      return { objects: zoo.meshes, update: zoo.update };
    },
  },
  A3: {
    // In the Rhine in front of the Roche towers, its head as high as the taller one (205 m),
    // looking at the middle between the two towers.
    name: "Sea serpent",
    places: [{ x: 1717, z: 68, look: [1739, -196] }],
    make(places, { heightAt }) {
      const serpents = places.map(({ x, z, look }) => createSerpent(x, z, 8.5, ...look, heightAt));
      return { objects: serpents.map(({ group }) => group), serpents };
    },
  },
  A4: {
    name: "Birds",
    places: FLOCKS.map(([x, z]) => ({ x, z })),
    make(places, { boost, heightAt }) {
      const birds = createBirds(
        boost,
        heightAt,
        places.map(({ x, z }) => [x, z]),
      );
      return { objects: [birds.mesh], update: birds.update };
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
    make: driven(createPolice),
  },
  V2: {
    // At WGS84 47.561340, 7.585408, facing as from 47.561249, 7.585620 to 47.561237, 7.585649.
    name: "Ambulance",
    places: [{ x: 46.3, z: -458.0, heading: 1.02 }],
    make: driven(createAmbulances),
  },
  V3: {
    // The turntable ladder out of the fourth gate from the left of the fire station's long
    // building (src/firestation.js), nearest the exit at WGS84 47.556211, 7.582375 to 47.556197,
    // 7.582437: its back 1 m before it, square to its front.
    name: "Fire truck",
    places: [{ x: -180.97, z: 117.81, heading: -0.344 }],
    make: driven(createFireTrucks),
  },
  V4: {
    // At WGS84 47.562470, 7.592271 and a poison green one at 47.561632, 7.593178, facing the men
    // on the Claraplatz.
    name: "Motorcycle",
    places: [
      { x: 562.5, z: -584.6, heading: 0.88 },
      { x: 631.0, z: -491.6, heading: 2.13, color: 0x7ee000 },
    ],
    make: driven(createMotorcycles),
  },
  V5: {
    // At WGS84 47.561701, 7.593144, facing the men on the Claraplatz.
    name: "Quad",
    places: [{ x: 628.4, z: -499.3, heading: 1.85 }],
    make: driven(createQuads),
  },
  V6: {
    // Life-size, in the St. Johanns-Park at WGS84 47.567823, 7.582330, facing east to the Rhine.
    name: "Traxxas XRT",
    places: [{ x: -186.7, z: -1178.4, heading: Math.PI / 2 }],
    make: driven(createXrts),
  },
  V7: {
    // In the yard of the Kaserne, facing east.
    name: "Tank",
    places: [{ x: 383.8, z: -631.9, heading: Math.PI / 2 }],
    make: driven(createTanks),
  },
  V8: {
    // 2 m over the Münster's roof (LV95 2611577.4, 1267321.0, 301.3), facing north over the
    // Rhine; in the museum 2 m over the ground.
    name: "Drone",
    places: [{ x: 577.4, y: 51.3 + 2, z: 79, heading: Math.PI }],
    make(places, { heightAt, boost, world, camera }) {
      const drones = createDrones(
        places.map((p) => (p.museum ? { ...p, y: heightAt(p.x, p.z) + 2 } : p)),
        boost,
        world,
        camera,
      );
      return { objects: drones.map(({ group }) => group), vehicles: drones };
    },
  },
  V9: {
    // The Merian Gärten's, at LV95 2613556.9, 1264526.6, facing west.
    name: "Dinosaur",
    places: [{ ...lv95([2613556.9, 1264526.6]), heading: -Math.PI / 2 }],
    make: driven(createDinos),
  },
  V10: {
    // An H145 and the AW109 "Da Vinci", each on a helipad on the roof of the Universitätsspital,
    // along its walls, else on the ground there; in the museum side by side, on one height: the
    // ground's highest under them.
    name: "Rega helicopter",
    places: [
      { ...lv95([2610981.2, 1267851.6]), model: "h145" }, // midway along LV95 2610963.7, 1267836.3 to 2610979.6, 1267828.4
      { ...lv95([2610963.1, 1267820.5]), model: "aw109" }, // midway along LV95 2610949.3, 1267815.5 to 2610964.4, 1267805.8
    ],
    make(places, { heightAt, roofOver, alongBuilding, landOn, boost }) {
      const pads = Math.max(...places.filter((p) => p.museum).map((p) => heightAt(p.x, p.z)));
      const regas = places.map((p) => {
        if (p.museum) return createRega({ ...p, y: pads }, p.model, boost);
        const roof = roofOver(p);
        const heading = roof ? alongBuilding(roof.number, HELIPADS_FACE) : HELIPADS_FACE;
        const rega = createRega({ ...p, y: heightAt(p.x, p.z), ...roof, heading }, p.model, boost);
        if (roof) landOn(roof.number, rega.land, p);
        return rega;
      });
      return { objects: regas.flatMap(({ pad, group }) => [pad, group]), vehicles: regas };
    },
  },
  V11: {
    // On the roof of the BIZ tower (WGS84 47.548078, 7.591792), else on the ground there, its nose
    // to the north.
    name: "Fighter jet",
    places: [{ ...at(47.548078, 7.591792), heading: Math.PI }],
    make(places, { heightAt, roofOver, landOn, boost, flight }) {
      const jets = places.map((p) => {
        const on = { ...p, y: heightAt(p.x, p.z) };
        const roof = !p.museum && roofOver(on);
        const jet = createJet({ ...on, ...roof, heading: p.heading }, boost, flight.LEVEL);
        if (roof) landOn(roof.number, jet.land, on);
        return jet;
      });
      return { objects: jets.map(({ group }) => group), vehicles: jets };
    },
  },
  V12: {
    // Hovering over where a ray from above first meets a roof or the ground (roof).
    name: "UFO",
    places: [{ x: UFO[0], z: UFO[1] }],
    make(places, { boost, roof }) {
      const ufos = places.map(({ x, z }) => createUfo(boost, roof, [x, z]));
      return { objects: ufos.flatMap(({ meshes }) => meshes), vehicles: ufos };
    },
  },
  V13: {
    // Circling over the city (src/aircraft.js), keeping to no place; parked in the museum.
    name: "Airliner",
    places: [],
    make(places, { heightAt, boost, flight }) {
      const planes = createPlanes(
        boost,
        flight,
        places.map((p) => ({ ...p, y: heightAt(p.x, p.z) })),
      );
      return { objects: planes.meshes, planes };
    },
  },
  V14: {
    // Circling over the monster and the Roche towers (around the point between them), CIRCLE
    // metres round, HELICOPTER times life size. At 300 m ± 25 m its lowest point (about 12 m below
    // its centre when banking) stays 40 m above the monster's horns (221 m) and 50 m above the
    // taller tower (213 m). In the museum as wide, 300 m over the ground there.
    name: "Attack helicopter",
    places: [{ x: 1728, z: -64 }],
    make(places, { heightAt, flight }) {
      const helicopters = places.map(({ x, z, museum }) =>
        createHelicopter(x, z, CIRCLE, (museum ? heightAt(x, z) : 0) + 300, HELICOPTER, flight),
      );
      return { objects: helicopters.map(({ group }) => group), vehicles: helicopters };
    },
  },
  V15: {
    // Between the Mittlere Brücke and the Johanniterbrücke (LV95 2611109.0, 1267968.1).
    name: "Fireboat",
    places: [{ x: 109, z: -568.1, heading: 0.62 }],
    make: afloat((...on) => createBoats("fire", ...on)),
  },
  V16: {
    // Below the Mittlere Brücke (LV95 2611324.4, 1267926.5), 7 m off the bank, so it can turn.
    name: "Police boat",
    places: [{ x: 324.4, z: -526.5, heading: -2.53 }],
    make: afloat((...on) => createBoats("police", ...on)),
  },
  V17: {
    // On the Rhine off the Novartis Campus (M41), facing upstream (M41_WAY), its driver and the
    // women on its deck aboard; the museum shows it there (src/museum.js).
    name: "Traxxas DCB M41",
    places: [
      {
        ...M41,
        heading: Math.atan2(M41_WAY[1].x - M41_WAY[0].x, M41_WAY[1].z - M41_WAY[0].z),
        driver: SKIPPER,
        deck: DECK,
      },
    ],
    make: afloat(createM41s),
  },
  // Kinds src/main.js makes itself, as parts of what the city and the museum share (the traffic,
  // the ways on foot and the Rhine): without make, only their plates in the museum (platesOf), a
  // plate each for what takes its turn there, in that order (src/movers.js: ROAD of
  // src/vehicles.js, tram colours, kinds of train; src/ships.js's types; src/runners.js's RIDES).
  T1: { name: ["Car", "SUV", "Sports car", "Van", "Lorry", "Tipper", "Bus"], places: [] },
  T2: { name: ["Tram, BVB green", "Tram, BLT yellow"], places: [] },
  T3: { name: ["Passenger train", "Goods train"], places: [] },
  T4: { name: ["Tanker", "Container ship", "Passenger ship", "Speedboat"], places: [] },
  // Each ferry midway between its landings.
  T5: {
    name: "Ferry",
    places: LANDINGS.map(([, a, b]) => at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)),
  },
  A2: { name: "Whales", places: [] }, // passing with the ships
  P1: { name: "Pedestrians", places: [] },
  P2: { name: "Rhine swimmers", places: [] },
  P3: { name: ["Cyclists", "Scooters"], places: [] },
};
