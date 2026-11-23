// Water splashing up round the wheels of what drives on the Rhine: from under each of the four
// wheels of each vehicle (RIM of its half length and width out from its middle) while it is on the
// water and between SLOW and JUMP, RATE drops a second per wheel per metre a second, each from up
// to SCATTER metres around it, flying on with part of its speed, out or in and up, each its own way
// (LEAVE), so they fan out behind the wheel; falling back into the water. At most DROPS in the air,
// one draw call.
import * as THREE from "three";

// SLOW, JUMP: metres per second; faster than JUMP it was put somewhere else, not driven there.
const [DROPS, RATE, SLOW, JUMP] = [800, 3, 1, 100];
const RIM = [0.6, 0.85]; // of the half length, of the half width
const SCATTER = 0.2; // metres
// How each drop leaves, at random between each pair: on with this share of the vehicle's speed
// (what it does not take leaves it behind the wheel), metres a second out of the vehicle's side
// (less than 0: in), and up per metre a second of up (the least, and more per metre a second of
// speed).
const LEAVE = { carry: [0.3, 0.8], out: [-0.5, 1.2], up: [0.4, 1.6], least: 1.1, fast: 0.05 };

// vehicles: [{ group, half, width }], their groups scaled as seen (all the same in x, y, z);
// onWater(x, z, y): whether one at x, y, z drives on the water; level: the water's scene y.
export function createSplash(vehicles, onWater, level) {
  const surface = Math.fround(level); // as stored in drops, so one left there counts as in the air
  const drops = new Float32Array(3 * DROPS).fill(-1e4); // in the air: those at surface or above
  const velocities = new Float32Array(3 * DROPS);
  const points = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(drops, 3)),
    new THREE.PointsMaterial({
      color: 0xd8ecff, // as the fire truck's water (src/firetruck.js)
      size: 0.15, // metres
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
  );
  points.frustumCulled = false;
  const was = vehicles.map(({ group }) => group.position.clone()); // each one's last place
  let [next, due, flying] = [0, new Float32Array(vehicles.length), false];
  const between = ([a, b]) => a + (b - a) * Math.random();

  return {
    points,
    // dt seconds on, after the vehicles have moved.
    update(dt) {
      if (!dt) return;
      vehicles.forEach(({ group, half, width }, v) => {
        const { position: p, rotation, scale } = group;
        const [fx, fz] = [Math.sin(rotation.y), Math.cos(rotation.y)];
        const speed = ((p.x - was[v].x) * fx + (p.z - was[v].z) * fz) / dt;
        was[v].copy(p);
        const jumped = Math.abs(speed) > JUMP; // put back in its place
        if (jumped || Math.abs(speed) < SLOW || !onWater(p.x, p.z, p.y)) return (due[v] = 0);
        const [along, across] = [RIM[0] * half * scale.x, RIM[1] * (width / 2) * scale.x];
        for (due[v] += RATE * Math.abs(speed) * dt; due[v] >= 1; due[v]--)
          for (const [a, side] of [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]) {
            const i = 3 * next;
            next = (next + 1) % DROPS;
            const [ox, oz] = [side * fz, -side * fx]; // out of its side
            const [sx, sz] = [between([-SCATTER, SCATTER]), between([-SCATTER, SCATTER])];
            drops.set(
              [
                p.x + fx * a * along + ox * across + sx,
                surface,
                p.z + fz * a * along + oz * across + sz,
              ],
              i,
            );
            const [on, out] = [between(LEAVE.carry) * speed, between(LEAVE.out)];
            velocities[i] = fx * on + ox * out;
            velocities[i + 1] = (LEAVE.least + LEAVE.fast * Math.abs(speed)) * between(LEAVE.up);
            velocities[i + 2] = fz * on + oz * out;
            flying = true;
          }
      });
      if (!flying) return;
      flying = false;
      for (let i = 0; i < drops.length; i += 3) {
        if (drops[i + 1] < surface) continue;
        velocities[i + 1] -= 9.81 * dt;
        for (let d = 0; d < 3; d++) drops[i + d] += velocities[i + d] * dt;
        if (drops[i + 1] < surface) drops[i + 1] = -1e4;
        else flying = true;
      }
      points.geometry.attributes.position.needsUpdate = true;
    },
  };
}
