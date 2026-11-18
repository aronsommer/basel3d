// Basel police cars: white, with an orange line along the middle of each side, POLIZEI on the
// back and a light bar whose blue lights flash in turn. Ridden, one is driven: up speeds up, down
// brakes and then reverses, left and right steer; it rolls over the ground and bridge decks, falls
// where there is none, and slides along or stops at walls. Let go, it is back in its place at once.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const MAX = 35; // metres per second forward
const BACK = 8; // metres per second in reverse
const ACCELERATE = 11; // metres per second²
const BRAKE = 18; // metres per second²
const ROLL = 3; // metres per second² it slows down by itself
const STEER = 0.6; // radians the front wheels turn at most, at a standstill
const AXLES = 2.9; // metres between the axles
const HALF = 2.4; // metres from the middle to the nose and to the tail
const WIDTH = 1.84; // metres
const WHEEL = 0.34; // radius in metres
const GRAVITY = 9.81;

// One car per place ({ x, y, z, heading }), each { group, material, update }; they share their
// geometries and all materials but the body's (so one is highlighted alone). boost(position): how
// much larger to draw one far away; world: { ground(x, z, y): the scene y of the top under a point
// at y, blocked(from, to): whether a building is in the way, intoArea(x, z): [x, z] moved into the
// terrain's area }.
export function createPolice(places, boost, { ground, blocked, intoArea }) {
  // A part at [x, y, z] in one colour, without normals and uvs (flat shading makes them).
  const part = (geometry, color, [x, y, z]) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) new THREE.Color(color).toArray(colors, i);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g.translate(x, y, z);
  };
  // A side profile ([z, y] points) extruded across, width wide, centred.
  const profile = (points, width) =>
    new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y))), {
      depth: width,
      bevelEnabled: false,
    })
      .rotateY(-Math.PI / 2)
      .translate(width / 2, 0, 0);
  const WHITE = 0xf4f6f8;
  const ORANGE = 0xff7a10;
  const GLASS = 0x18202a;
  const DARK = 0x24272c;
  const body = mergeGeometries([
    part(
      profile(
        [
          [-2.4, 0.3],
          [2.4, 0.3],
          [2.4, 0.8],
          [1.3, 0.98],
          [-1.9, 1.0],
          [-2.4, 0.95],
        ],
        WIDTH,
      ),
      WHITE,
      [0, 0, 0],
    ),
    part(
      profile(
        [
          [-1.85, 0.99],
          [1.3, 0.97],
          [0.45, 1.5],
          [-1.15, 1.5],
        ],
        1.6,
      ),
      GLASS,
      [0, 0, 0],
    ),
    part(new THREE.BoxGeometry(1.62, 0.06, 1.62), WHITE, [0, 1.52, -0.35]), // roof
    part(new THREE.BoxGeometry(1.2, 0.08, 0.32), DARK, [0, 1.59, -0.2]), // light bar
    ...[-1, 1].map((end) =>
      part(new THREE.BoxGeometry(1.9, 0.2, 0.14), DARK, [0, 0.38, end * 2.4]),
    ), // bumpers
    // The orange lines, above the wheels.
    ...[-1, 1].map((side) =>
      part(new THREE.BoxGeometry(0.02, 0.15, 4.5), ORANGE, [side * (WIDTH / 2 + 0.01), 0.75, 0]),
    ),
  ]);
  // Head and tail lights, unlit so they glow.
  const lamps = mergeGeometries(
    [-1, 1].flatMap((side) => [
      part(new THREE.BoxGeometry(0.4, 0.12, 0.04), 0xffffff, [side * 0.62, 0.72, 2.41]),
      part(new THREE.BoxGeometry(0.36, 0.14, 0.04), 0xff1a1a, [side * 0.66, 0.82, -2.41]),
    ]),
  );
  const lampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  // POLIZEI on the back between the tail lights, drawn here, so nothing is loaded.
  const canvas = Object.assign(document.createElement("canvas"), { width: 512, height: 96 });
  const context = canvas.getContext("2d");
  context.font = "bold 80px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#1a2b5c";
  context.fillText("POLIZEI", 256, 50);
  const lettering = new THREE.CanvasTexture(canvas);
  lettering.colorSpace = THREE.SRGBColorSpace;
  // Facing back.
  const sign = new THREE.PlaneGeometry(0.9, 0.17).rotateY(Math.PI).translate(0, 0.62, -2.405);
  const signMaterial = new THREE.MeshLambertMaterial({ map: lettering, alphaTest: 0.5 });
  // The flashing lights on the bar, one each side: lit, a bright core in a blue glow added onto
  // what is behind it; else blue as their covers.
  const on = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3060ff).multiplyScalar(3) });
  const off = new THREE.MeshBasicMaterial({ color: 0x1a3a8a });
  const lens = new THREE.BoxGeometry(0.5, 0.14, 0.3);
  const fade = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
  const brush = fade.getContext("2d");
  const gradient = brush.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "#fff");
  gradient.addColorStop(0.25, "rgba(255, 255, 255, 0.6)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  brush.fillStyle = gradient;
  brush.fillRect(0, 0, 64, 64);
  const glowMaterial = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(fade),
    color: 0x1848ff,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const tyre = part(
    new THREE.CylinderGeometry(WHEEL, WHEEL, 0.24, 10).rotateZ(Math.PI / 2),
    DARK,
    [0, 0, 0],
  );
  // Each car's lights flash this many seconds later than the one before, so they do not flash
  // together.
  return places.map((place, k) => createCar(place, k * 0.23));

  function createCar(place, late) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const group = new THREE.Group();
    group.rotation.order = "YXZ"; // heading first, then pitch
    group.add(
      new THREE.Mesh(body, material),
      new THREE.Mesh(lamps, lampMaterial),
      new THREE.Mesh(sign, signMaterial),
    );
    const flashers = [-1, 1].map((side) => {
      const core = new THREE.Mesh(lens, off);
      core.position.set(side * 0.32, 1.68, -0.2);
      const glow = new THREE.Sprite(glowMaterial);
      glow.position.copy(core.position);
      glow.scale.setScalar(1.6); // metres across
      group.add(core, glow);
      return { core, glow };
    });
    // Front left, front right, back left, back right.
    const wheels = [1, -1].flatMap((end) =>
      [1, -1].map((side) => {
        const wheel = new THREE.Mesh(tyre, material);
        wheel.position.set(side * 0.86, WHEEL, end * AXLES * 0.5); // a little out of the body
        wheel.rotation.order = "YXZ"; // steered, then turning
        group.add(wheel);
        return wheel;
      }),
    );

    const parked = { ...place, speed: 0, fall: 0, steer: 0, pitch: 0 };
    const state = { ...parked };
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    // Whether moving by mx, mz is free: checked from the middle to both corners ahead (the front
    // ones going forward, the back ones in reverse) where they would be.
    const free = (mx, mz) => {
      const [fx, fz] = [Math.sin(state.heading), Math.cos(state.heading)];
      const ahead = Math.sign(state.speed) * HALF;
      from.set(state.x, state.y + 1, state.z);
      return [-1, 1].every((side) => {
        const across = (side * WIDTH) / 2;
        to.set(
          state.x + mx + fx * ahead + fz * across,
          from.y,
          state.z + mz + fz * ahead - fx * across,
        );
        return !blocked(from, to);
      });
    };

    // Placed, its lights flashing. It drives on by input ({ climb, turn }, each -1, 0 or 1, from
    // steering() in src/main.js), or is back in its place without (null).
    function update(seconds, dt, input) {
      const s = state;
      if (input) move(dt, input);
      else Object.assign(s, parked);
      group.position.set(s.x, s.y, s.z);
      group.rotation.set(s.pitch, s.heading, 0);
      group.scale.setScalar(boost(group.position));
      // Each side flashes twice, then the other, 0.6 s in all.
      const t = (seconds + late) % 0.6;
      const flash = t % 0.3 < 0.07 || (t % 0.3 > 0.12 && t % 0.3 < 0.19);
      flashers.forEach(({ core, glow }, k) => {
        glow.visible = flash && t < 0.3 === (k === 0);
        core.material = glow.visible ? on : off;
      });
    }
    function move(dt, input) {
      const s = state;
      const gas = input.climb;
      const towards = Math.sign(gas);
      if (gas && Math.sign(s.speed) === -towards) s.speed += towards * BRAKE * dt;
      else if (gas) s.speed += towards * ACCELERATE * dt;
      else s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), ROLL * dt);
      s.speed = THREE.MathUtils.clamp(s.speed, -BACK, MAX);
      // Less steering the faster it goes, so it stays easy to hold on the road.
      const steer = (input.turn * STEER) / (1 + s.speed ** 2 / 150);
      s.steer += (steer - s.steer) * Math.min(1, dt * 6);
      s.heading += ((s.speed * Math.tan(s.steer)) / AXLES) * dt;

      const [fx, fz] = [Math.sin(s.heading), Math.cos(s.heading)];
      const step = s.speed * dt;
      const [dx, dz] = [fx * step, fz * step];
      if (step && !free(dx, dz)) {
        // Slides along a wall, slowing down; head on, it stops.
        if (free(dx, 0)) [s.x, s.z] = [s.x + dx, s.z];
        else if (free(0, dz)) [s.x, s.z] = [s.x, s.z + dz];
        else s.speed = 0;
        s.speed *= 1 - Math.min(1, dt * 3);
      } else [s.x, s.z] = [s.x + dx, s.z + dz];
      [s.x, s.z] = intoArea(s.x, s.z);

      s.fall += GRAVITY * dt;
      s.y -= s.fall * dt;
      const below = ground(s.x, s.z, s.y);
      if (s.y <= below) [s.y, s.fall] = [below, 0];
      // Tilted by the ground under its axles, nose down where the front is lower.
      const front = ground(s.x + fx * AXLES * 0.5, s.z + fz * AXLES * 0.5, s.y);
      const back = ground(s.x - fx * AXLES * 0.5, s.z - fz * AXLES * 0.5, s.y);
      s.pitch += (Math.atan2(back - front, AXLES) - s.pitch) * Math.min(1, dt * 8);
      wheels.forEach((wheel, k) => {
        wheel.rotation.x += step / WHEEL;
        if (k < 2) wheel.rotation.y = s.steer;
      });
    }
    update(0, 0, null); // in place before the first frame

    return { group, material, update };
  }
}
