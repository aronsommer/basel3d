// Driving on the ground, shared by the police cars and the motorcycles: up speeds up, down brakes
// and then reverses, left and right steer; it rolls over the ground and bridge decks, falls where
// there is none, and slides along or stops at walls. Let go, it is back in its place at once.
import * as THREE from "three";

const GRAVITY = 9.81;
const LOOK = 6; // how fast (per second) look follows the heading
const LAG = 0.17; // radians look is behind the heading at most, about 10°

// A vehicle parked at place ({ x, y, z, heading }), driven by spec ({ max and back: metres per
// second forward and in reverse, accelerate, brake and roll (slowing down by itself): metres per
// second², steer: radians the front wheel turns at most at a standstill, grip: the squared speed
// (m²/s²) at which that halves, react: how fast (per second) the wheel follows the input, axles:
// metres between them, half: from the middle to the nose and tail, width }) in world
// ({ ground(x, z, y): the scene y of the top under a point at y, blocked(from, to): whether a
// building is in the way, intoArea(x, z): [x, z] moved into the terrain's area }). Its state:
// { x, y, z, heading, look (the heading, lagging, for a camera to follow), speed, steer, pitch,
// rolled (metres, for the wheels), fall }.
export function createDriving(place, spec, { ground, blocked, intoArea }) {
  const parked = {
    ...place,
    look: place.heading,
    speed: 0,
    fall: 0,
    steer: 0,
    pitch: 0,
    rolled: 0,
  };
  const state = { ...parked };
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  // Whether moving by mx, mz is free: checked from the middle to both corners ahead (the front
  // ones going forward, the back ones in reverse) where they would be.
  const free = (mx, mz) => {
    const [fx, fz] = [Math.sin(state.heading), Math.cos(state.heading)];
    const ahead = Math.sign(state.speed) * spec.half;
    from.set(state.x, state.y + 1, state.z);
    return [-1, 1].every((side) => {
      const across = (side * spec.width) / 2;
      to.set(
        state.x + mx + fx * ahead + fz * across,
        from.y,
        state.z + mz + fz * ahead - fx * across,
      );
      return !blocked(from, to);
    });
  };

  // Drives on by input ({ climb, turn }, each -1, 0 or 1, from steering() in src/main.js), or is
  // back in its place without (null).
  function step(dt, input) {
    const s = state;
    if (!input) return Object.assign(s, parked);
    const gas = input.climb;
    const towards = Math.sign(gas);
    if (gas && Math.sign(s.speed) === -towards) s.speed += towards * spec.brake * dt;
    else if (gas) s.speed += towards * spec.accelerate * dt;
    else s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), spec.roll * dt);
    s.speed = THREE.MathUtils.clamp(s.speed, -spec.back, spec.max);
    // Less steering the faster it goes, so it stays easy to hold on the road.
    const steer = (input.turn * spec.steer) / (1 + s.speed ** 2 / spec.grip);
    s.steer += (steer - s.steer) * Math.min(1, dt * spec.react);
    s.heading += ((s.speed * Math.tan(s.steer)) / spec.axles) * dt;
    const behind = (s.heading - s.look) * (1 - Math.min(1, dt * LOOK));
    s.look = s.heading - THREE.MathUtils.clamp(behind, -LAG, LAG);

    const [fx, fz] = [Math.sin(s.heading), Math.cos(s.heading)];
    const travel = s.speed * dt;
    const [dx, dz] = [fx * travel, fz * travel];
    if (travel && !free(dx, dz)) {
      // Slides along a wall, slowing down; head on, it stops.
      if (free(dx, 0)) s.x += dx;
      else if (free(0, dz)) s.z += dz;
      else s.speed = 0;
      s.speed *= 1 - Math.min(1, dt * 3);
    } else [s.x, s.z] = [s.x + dx, s.z + dz];
    [s.x, s.z] = intoArea(s.x, s.z);
    s.rolled += travel;

    s.fall += GRAVITY * dt;
    s.y -= s.fall * dt;
    const below = ground(s.x, s.z, s.y);
    if (s.y <= below) [s.y, s.fall] = [below, 0];
    // Tilted by the ground under its axles, nose down where the front is lower.
    const half = spec.axles / 2;
    const front = ground(s.x + fx * half, s.z + fz * half, s.y);
    const back = ground(s.x - fx * half, s.z - fz * half, s.y);
    s.pitch += (Math.atan2(back - front, spec.axles) - s.pitch) * Math.min(1, dt * 8);
  }

  return { state, step };
}
