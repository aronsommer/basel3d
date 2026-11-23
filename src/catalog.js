// The catalog: what is placed in the city (INVENTORY.md), each kind once, under an id given to no
// other, ever (L landmarks, A animals, S scenes, P people moving, V what one drives or flies, T
// traffic): its name, its places in the city (scene x, z, …) and make(places, city), which builds
// it there and returns { objects: for the scene, … what else others need of it }; city: what the
// maker takes from src/main.js. src/main.js builds each at its places (build); kinds not yet here
// it still builds itself.
import * as THREE from "three";
import { BASILISKS, createBasilisks } from "./basilisks.js";
import { fromWGS84 } from "./geo.js";
import { TOSS, createPeople } from "./people.js";
import { createPolice } from "./police.js";
import { createSwans } from "./zoo.js";

const at = (lat, lon) => {
  const [x, z] = fromWGS84(lat, lon);
  return { x, z };
};

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
