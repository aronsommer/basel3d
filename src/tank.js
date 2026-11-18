// Battle tanks: olive green, a hull between two tracks that show their whole length and width,
// the links running round as it drives, seven road wheels a side, a wedged turret with a thick gun
// fixed forward and kept level; driven as in src/drive.js, turning on the spot. The gun recoils,
// flashes and booms when it fires (fire); where it points: aim.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { glow, part, profile } from "./parts.js";
import { createDriving } from "./drive.js";
import { audio, fade } from "./sound.js";

const TRACK = 1.45; // metres from the middle to each track's
const GAP = 2 * TRACK - 0.62; // metres between the tracks (0.62 m wide), the hull's width
const RADIUS = 0.34; // of a road wheel, metres
// Each track's loop: two half circles of BEND metres round (0.45 m up, END metres before and
// behind the middle), LINKS links on it.
const END = 3.35;
const BEND = 0.4;
const LINKS = 40;
const LOOP = 4 * END + 2 * Math.PI * BEND; // metres round
// Metres the links are shown moving per frame at most: moving faster, they (0.4 m apart) would
// seem to stand or run back, as wheels in films.
const SLIDE = 0.12;
const GUN = [0, 2.05, 2]; // where the gun turns (its mantlet), metres
const MUZZLE = 5.5; // metres along the gun from there
const RECOIL = 0.45; // metres the gun slides back when it fires
const SPEC = {
  max: 20,
  back: 8,
  accelerate: 12,
  brake: 30,
  roll: 8,
  steer: 0,
  grip: 150,
  spin: 1.4,
  react: 10,
  axles: 4.5,
  half: 3.8,
  width: 3.6,
};

// Where the link at u metres round a track's loop is ([z, y]) and its angle about x (radians):
// from the front along the bottom to the back, round, along the top to the front, round.
function link(u) {
  const turn = (u - 2 * END) / BEND; // radians round the back
  if (u < 2 * END) return [END - u, 0.45 - BEND, Math.PI];
  if (turn < Math.PI)
    return [-END - BEND * Math.sin(turn), 0.45 - BEND * Math.cos(turn), turn + Math.PI];
  const top = u - 2 * END - Math.PI * BEND;
  if (top < 2 * END) return [top - END, 0.45 + BEND, 0];
  const front = (top - 2 * END) / BEND; // radians round the front, from the top
  return [END + BEND * Math.sin(front), 0.45 + BEND * Math.cos(front), front];
}

// One per place ({ x, y, z, heading }), each { group, material, update, aim, fire }; they share
// their geometries and all materials but their own (so one is highlighted alone).
// boost(position): how much larger to draw one far away; world: as for createDriving
// (src/drive.js).
export function createTanks(places, boost, world) {
  const OLIVE = 0x4b5320;
  const DARK = 0x2a2b26;
  const RUBBER = 0x1e1f1c;
  const box = ([w, h, d], color, p) => part(new THREE.BoxGeometry(w, h, d), color, p);
  const along = (radius, length, color, z) =>
    part(new THREE.CylinderGeometry(radius, radius, length, 12).rotateX(Math.PI / 2), color, [
      0,
      0,
      z,
    ]);
  // The loop's outline, each half circle in eight steps.
  const outline = [-1, 1].flatMap((end) =>
    [...Array(9)].map((_, k) => {
      const a = (k * Math.PI) / 8;
      return [end * (END + BEND * Math.sin(a)), 0.45 - end * BEND * Math.cos(a)];
    }),
  );
  const hull = mergeGeometries([
    ...[-1, 1].map((x) => part(profile(outline, 0.62), RUBBER, [x * TRACK, 0, 0])), // tracks
    box([GAP, 0.6, 6.8], OLIVE, [0, 0.75, 0]), // between the tracks
    // Above, as wide (GAP), the front sloping, short of the tracks' front.
    part(
      profile(
        [
          [-3.5, 1.0],
          [3.2, 1.0],
          [3.45, 1.15],
          [2.5, 1.65],
          [-3.5, 1.7],
        ],
        GAP,
      ),
      OLIVE,
      [0, 0, 0],
    ),
    // Turret, wedged at the front.
    part(
      profile(
        [
          [-2.2, 1.7],
          [1.7, 1.7],
          [2.4, 1.95],
          [1.6, 2.45],
          [-2.3, 2.45],
          [-2.6, 2.0],
        ],
        2.0, // narrower than the hull (GAP)
      ),
      OLIVE,
      [0, 0, -0.3],
    ),
  ]);
  // Mantlet, barrel, fume extractor and muzzle, from where the gun turns along +z.
  const gun = mergeGeometries([
    box([0.85, 0.6, 0.5], OLIVE, [0, 0, 0.1]),
    along(0.14, 5.2, OLIVE, 2.85),
    along(0.21, 0.7, OLIVE, 3.2),
    along(0.17, 0.35, DARK, 5.3),
  ]);
  // Tail lights, unlit so they glow.
  const lamps = mergeGeometries(
    [-1, 1].map((x) => box([0.18, 0.1, 0.04], 0xff1a1a, [x * 0.95, 1.45, -3.52])),
  );
  const lampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  // A rubber rim round an olive disc with a dark cross and a light hub, so one sees it turn; its
  // axis along x.
  const wheel = mergeGeometries([
    ...[
      [new THREE.CylinderGeometry(RADIUS, RADIUS, 0.72, 12), RUBBER],
      [new THREE.CylinderGeometry(0.25, 0.25, 0.74, 12), OLIVE],
      [new THREE.CylinderGeometry(0.07, 0.07, 0.78, 8), 0x9a9c8a],
    ].map(([g, color]) => part(g.rotateZ(Math.PI / 2), color, [0, 0, 0])),
    box([0.76, 0.07, 0.46], DARK, [0, 0, 0]),
    box([0.76, 0.46, 0.07], DARK, [0, 0, 0]),
  ]);
  // A link, lighter than the track, a little outside its loop (+y, as link turns it).
  const linkGeometry = box([0.66, 0.05, 0.2], 0x5a5c52, [0, 0.025, 0]);
  const flashMaterial = glow(0xffa030);
  // The gun's boom, deep: a dull blast (noise through a low-pass sweeping down), a heavy falling
  // thump and a low rumble rolling on for 2 s, as an echo between the houses.
  function boom() {
    const { context, noise } = audio();
    const now = context.currentTime;
    // Noise through a low-pass from hz down to 40 Hz, at gain, for seconds.
    const dull = (hz, gain, seconds) => {
      const sound = context.createBufferSource();
      sound.buffer = noise;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(hz, now);
      filter.frequency.exponentialRampToValueAtTime(40, now + seconds);
      sound.connect(filter).connect(fade(gain, seconds));
      sound.start(now, Math.random() * 0.9); // from somewhere in the noise
      sound.stop(now + seconds);
    };
    dull(600, 0.9, 0.8);
    dull(220, 0.4, 2);
    const thump = context.createOscillator();
    thump.frequency.setValueAtTime(60, now);
    thump.frequency.exponentialRampToValueAtTime(25, now + 0.5);
    thump.connect(fade(1, 0.6));
    thump.start(now);
    thump.stop(now + 0.6);
  }
  return places.map(createOne);

  function createOne(place) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const group = new THREE.Group();
    group.rotation.order = "YXZ"; // heading first, then pitch
    const barrel = new THREE.Group();
    barrel.position.fromArray(GUN);
    const flash = new THREE.Sprite(flashMaterial);
    flash.position.z = MUZZLE + 0.6;
    flash.scale.setScalar(3); // metres across
    barrel.add(new THREE.Mesh(gun, material), flash);
    // The links of both tracks: the left track's first.
    const links = new THREE.InstancedMesh(linkGeometry, material, 2 * LINKS);
    group.add(new THREE.Mesh(hull, material), new THREE.Mesh(lamps, lampMaterial), barrel, links);
    // Seven a side, from the back to the front, on the bottom of the loop.
    const wheels = [-1, 1].flatMap((x) =>
      [...Array(7)].map((_, k) => {
        const mesh = new THREE.Mesh(wheel, material);
        mesh.position.set(x * TRACK, 0.45 - BEND + RADIUS, (k - 3) * 0.9);
        group.add(mesh);
        return mesh;
      }),
    );
    const driving = createDriving(place, SPEC, world);
    const s = driving.state;
    const shown = [0, 0]; // metres each track (left, right) is shown to have moved
    let gone = [0, 0]; // metres each track has moved, at the last frame
    let recoil = 0; // 1 when it fires, down to 0 in half a second
    const matrix = new THREE.Matrix4();
    const turned = new THREE.Euler();

    // Driven by input (createDriving), else in its place.
    function update(seconds, dt, input) {
      driving.step(dt, input);
      group.position.set(s.x, s.y, s.z);
      group.rotation.set(s.pitch, s.heading, 0);
      group.scale.setScalar(boost(group.position));
      // Each track has gone as far as the tank, less on the inside of a turn, so on the spot the
      // two go opposite ways.
      const now = [1, -1].map((x) => s.rolled - x * TRACK * (s.heading - place.heading));
      now.forEach((d, k) => (shown[k] += THREE.MathUtils.clamp(d - gone[k], -SLIDE, SLIDE)));
      gone = now;
      for (const mesh of wheels) mesh.rotation.x = shown[mesh.position.x > 0 ? 0 : 1] / RADIUS;
      for (let i = 0; i < 2 * LINKS; i++) {
        const k = i < LINKS ? 0 : 1;
        const u = (((((i % LINKS) * LOOP) / LINKS + shown[k]) % LOOP) + LOOP) % LOOP;
        const [z, y, angle] = link(u);
        matrix.makeRotationFromEuler(turned.set(angle, 0, 0));
        links.setMatrixAt(i, matrix.setPosition((k ? -1 : 1) * TRACK, y, z));
      }
      links.instanceMatrix.needsUpdate = true;
      // The gun stays level, whichever way the hull tilts.
      barrel.rotation.x = -s.pitch;
      recoil = Math.max(0, recoil - dt * 2);
      barrel.position.z = GUN[2] - RECOIL * recoil;
      flash.visible = recoil > 0.85;
    }
    update(0, 0, null); // in place before the first frame

    return {
      group,
      material,
      update,
      // Sets origin to the muzzle and direction to where the gun points (level, ahead), in the
      // scene.
      aim(origin, direction) {
        group.updateMatrixWorld();
        barrel.localToWorld(origin.set(0, 0, MUZZLE));
        direction.set(Math.sin(s.heading), 0, Math.cos(s.heading));
      },
      fire() {
        recoil = 1;
        boom();
      },
    };
  }
}
