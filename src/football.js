// A football training game on a level pitch: two goals, a goalkeeper in each, two teams of field
// players passing a ball among themselves, dribbling it and shooting at the other team's goal; the
// goalkeepers keep between ball and goal, catch shots and throw the ball out to their team; the
// field players run to new spots now and then; others stand aside, two of them throwing a second
// ball: one throws it in an arc to the other, who catches it, holds it and rolls it back (DRILL).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createCrowd, createPeople } from "./people.js";

const AREA = [8, 30]; // metres the field players keep within: short of the goal lines, across
const POSTS = 3.66; // metres either side of a goal's middle
const BAR = 2.44; // metres up
const PASS = 14; // metres per second the ball is passed
const SHOT = 22; // and shot
const JOG = 3.5; // metres per second, the players running to new spots
const SPRINT = 6; // to the ball, with it and the goalkeepers
const STRIDE = 3; // radians of the walk per metre
const TURN = 8; // per second, how fast one turns to where one goes
const BALL = 0.11; // metres round
const AHEAD = 0.5; // metres ahead of the feet where one keeps the ball
const SHOOT = 25; // metres from the other goal within which one may shoot
// Seconds of the drill: thrown, held, rolled back, held; how high the throw goes, metres.
const DRILL = [1.2, 1, 2, 1];
const ARC = 2;
const HANDS = [0.4, 1.1]; // metres ahead of one and up, where one holds a ball

// ends: the middles of the two goal lines ({ x, y, z }, level); looks: the goalkeepers' (of team 0,
// at the first goal, and of team 1), then the field players' (body "player"), in teams 0, 1, 0, …;
// aside: those standing aside, each { u, v: metres along from the middle towards the second goal
// and across, face: radians from along towards across, look }; drill: the two of them (indices)
// throwing the second ball, the thrower first. { objects, update(dt) }.
export function createTraining([first, second], looks, aside, [thrower, catcher]) {
  // Pitch [along, from the first goal's middle to the second's; across] → scene x, z.
  const [cx, cy, cz] = [(first.x + second.x) / 2, first.y, (first.z + second.z) / 2];
  const goalLine = Math.hypot(second.x - first.x, second.z - first.z) / 2; // metres to each goal line
  const heading = Math.atan2(second.x - first.x, second.z - first.z);
  const [ax, az] = [Math.sin(heading), Math.cos(heading)];
  const at = (u, v) => [cx + ax * u + az * v, cz + az * u - ax * v];
  const random = (a, b) => a + Math.random() * (b - a);
  const clamp = (a, b) => Math.max(-b, Math.min(b, a));
  const reach = goalLine - AREA[0]; // metres along the field players keep within
  const spot = () => [random(-reach, reach), random(-AREA[1], AREA[1])];

  const crowd = createCrowd("player", looks.length);
  crowd.mesh.frustumCulled = false; // they move
  // Each of a team, which attacks the goal at aim × goalLine; at u, v, going to tu, tv at pace, facing
  // turn (radians from along towards across).
  const players = looks.map((look, i) => {
    crowd.dress(i, look, "walk");
    const team = i < 2 ? i : i % 2;
    const keeper = i < 2;
    const [u, v] = keeper ? [(team ? 1 : -1) * (goalLine - 1), 0] : spot();
    return {
      team,
      keeper,
      aim: team ? -1 : 1,
      u,
      v,
      tu: u,
      tv: v,
      pace: 0,
      turn: 0,
      phase: i,
      wait: 0,
    };
  });
  const keeperOf = (team) => players[team]; // whose goal is at -aim × goalLine
  const teammates = (p) => players.filter((o) => o !== p && o.team === p.team && !o.keeper);
  // The ball: at u, v, rolling to tu, tv at pace, or kept by holder; receiver goes for it.
  const ball = { u: 0, v: 0, tu: 0, tv: 0, pace: 0, holder: players[2], receiver: null, time: 1 };

  const frame = mergeGeometries([
    ...[-1, 1].map((s) => new THREE.BoxGeometry(0.12, BAR, 0.12).translate(s * POSTS, BAR / 2, 0)),
    new THREE.BoxGeometry(2 * POSTS + 0.12, 0.12, 0.12).translate(0, BAR, 0),
  ]);
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const goals = [-1, 1].map((end) => {
    const goal = new THREE.Mesh(frame, white);
    const [x, z] = at(end * goalLine, 0);
    goal.position.set(x, cy, z);
    goal.rotation.y = heading; // its posts across the pitch
    return goal;
  });
  const sphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(BALL, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
  );
  const spare = new THREE.Mesh(sphere.geometry, sphere.material);
  // Where each of the drill holds the ball, and the feet before it, as [x, y, z].
  const [throws, catches] = [thrower, catcher].map((k) => {
    const { u, v, face } = aside[k];
    const [du, dv] = [Math.cos(face), Math.sin(face)];
    const [x, z] = at(u + du * HANDS[0], v + dv * HANDS[0]);
    return {
      hands: new THREE.Vector3(x, cy + HANDS[1], z),
      feet: new THREE.Vector3(x, cy + BALL, z),
    };
  });
  let drill = 0; // seconds into it
  const objects = [
    crowd.mesh,
    ...goals,
    sphere,
    spare,
    ...createPeople(
      aside.map(({ u, v, face }) => {
        const [x, z] = at(u, v);
        return { x, y: cy, z, heading: heading + face };
      }),
      aside.map(({ look }) => look),
    ),
  ];

  // The ball leaves its holder for u, v at pace, for receiver, who runs for it.
  function kick(u, v, pace, receiver) {
    Object.assign(ball, { tu: u, tv: v, pace, holder: null, receiver });
    Object.assign(receiver, { tu: u, tv: v, pace: SPRINT });
  }
  const anyOf = (list) => list[Math.floor(Math.random() * list.length)];

  return {
    objects,
    update(dt) {
      const h = ball.holder;
      if (h) {
        // Its holder dribbles, then passes to a teammate or, near the other goal, may shoot; a
        // goalkeeper throws it out to his team.
        if ((ball.time -= dt) <= 0) {
          if (!h.keeper && h.aim * h.u > goalLine - SHOOT && Math.random() < 0.4)
            kick(
              h.aim * (goalLine + 0.5),
              random(-POSTS + 0.5, POSTS - 0.5),
              SHOT,
              keeperOf(1 - h.team),
            );
          else {
            const to = anyOf(teammates(h));
            kick(to.u, to.v, PASS, to);
          }
        }
      } else {
        // Rolling on, or lying until its receiver gets to it.
        const [du, dv] = [ball.tu - ball.u, ball.tv - ball.v];
        const left = Math.hypot(du, dv);
        const step = Math.min(left, ball.pace * dt);
        if (left > 0) [ball.u, ball.v] = [ball.u + (du / left) * step, ball.v + (dv / left) * step];
        const r = ball.receiver;
        Object.assign(r, { tu: ball.u, tv: ball.v, pace: SPRINT });
        if (Math.hypot(r.u - ball.u, r.v - ball.v) < AHEAD + 0.3) {
          ball.holder = r;
          ball.time = r.keeper ? 1.5 : random(1, 2.5);
          // Dribbling towards the other goal, or the goalkeeper back to his line.
          if (r.keeper) [r.tu, r.tv] = [-r.aim * (goalLine - 1), 0];
          else [r.tu, r.tv] = [clamp(r.u + r.aim * 8, reach), clamp(r.v + random(-3, 3), AREA[1])];
        }
      }

      players.forEach((p, i) => {
        if (p === ball.holder || p === ball.receiver) {
          // After the ball or with it.
        } else if (p.keeper)
          // Between the ball and his goal.
          Object.assign(p, { tu: -p.aim * (goalLine - 1), tv: clamp(ball.v, POSTS), pace: SPRINT });
        else if ((p.wait -= dt) < 0) {
          // Now and then to a new spot.
          [p.tu, p.tv] = spot();
          [p.pace, p.wait] = [JOG, random(2, 6)];
        }
        const [du, dv] = [p.tu - p.u, p.tv - p.v];
        const left = Math.hypot(du, dv);
        const step = Math.min(left, p.pace * dt);
        let face = Math.atan2(ball.v - p.v, ball.u - p.u); // standing: at the ball
        if (left > 0.05) {
          [p.u, p.v] = [p.u + (du / left) * step, p.v + (dv / left) * step];
          p.phase += step * STRIDE;
          face = Math.atan2(dv, du);
        }
        const turn = face - p.turn;
        p.turn += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * TURN);
        const [x, z] = at(p.u, p.v);
        crowd.place(i, x, cy, z, heading + p.turn, p.phase);
      });
      if (ball.holder) {
        const { u, v, turn } = ball.holder;
        [ball.u, ball.v] = [u + Math.cos(turn) * AHEAD, v + Math.sin(turn) * AHEAD];
      }
      const [x, z] = at(ball.u, ball.v);
      sphere.position.set(x, cy + BALL, z);

      drill = (drill + dt) % DRILL.reduce((a, b) => a + b);
      const [thrown, held, rolled] = DRILL;
      if (drill < thrown) {
        const t = drill / thrown;
        spare.position.lerpVectors(throws.hands, catches.hands, t).y += ARC * 4 * t * (1 - t);
      } else if (drill < thrown + held) spare.position.copy(catches.hands);
      else if (drill < thrown + held + rolled)
        spare.position.lerpVectors(catches.feet, throws.feet, (drill - thrown - held) / rolled);
      else spare.position.copy(throws.hands);
    },
  };
}
