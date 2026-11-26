import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part, profile } from "./parts.js";
import { riders } from "./riders.js";

// Two airliners circling over the city on an oval, one higher and the other way round, so they
// are always in view, and one parked at each of parked ({ x, y, z, heading }: its wheels on y), its
// gear out only there.
// 1.5 times life size (and more far away, see boost), white with dark windows and a red tail
// with a Swiss cross, no airline. Each is a craft to fly (createFlight), back on its oval or
// place at once when let go.
export function createPlanes(boost, flight, parked = []) {
  const SPEED = 80; // metres per second
  const SCALE = 1.5;
  const LIFT = 60; // metres
  // Along +z, in metres: fuselage, nose, wings, tailplane, fin, engines.
  const WHITE = 0xf2f2f0;
  const GLASS = 0x111418;
  const along = (g) => g.rotateX(Math.PI / 2); // its axis along z, its top ahead
  const fuselage = along(new THREE.CylinderGeometry(2, 2, 30, 8));
  // A rounded nose, half an egg 5 m long: rings every 22.5° from the base, eight faces round.
  const nose = along(
    new THREE.SphereGeometry(2, 8, 4, 0, 2 * Math.PI, 0, Math.PI / 2).scale(1, 2.5, 1),
  );
  // The cockpit window: the nose's faces, a little outside them, cut to a level band from 0.5 to
  // 1.2 m over its axis and from 2.2 m ahead of its base, round its front.
  const cuts = [
    [[0, 1, 0], 0.5],
    [[0, -1, 0], -1.2],
    [[0, 0, 1], 2.2],
  ];
  // A polygon's part where n · p >= d (Sutherland–Hodgman).
  const cut = (polygon, [n, d]) =>
    polygon.flatMap((a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      const [da, db] = [a, b].map((p) => n[0] * p[0] + n[1] * p[1] + n[2] * p[2] - d);
      const kept = da >= 0 ? [a] : [];
      return da * db < 0 ? [...kept, a.map((v, k) => v + ((b[k] - v) * da) / (da - db))] : kept;
    });
  const shell = nose.clone().scale(1.01, 1.01, 1.01).toNonIndexed().attributes.position.array;
  const band = [];
  for (let i = 0; i < shell.length; i += 9) {
    const triangle = [0, 3, 6].map((k) => [...shell.subarray(i + k, i + k + 3)]);
    const polygon = cuts.reduce(cut, triangle);
    for (let k = 1; k < polygon.length - 1; k++) band.push(polygon[0], polygon[k], polygon[k + 1]);
  }
  const cockpit = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(band.flat(), 3),
  );
  const tailCone = new THREE.ConeGeometry(2, 6, 8).rotateX(-Math.PI / 2);
  // A leg of its gear at x, z: a strut from top down to an axle with two black wheels of radius
  // r, apart metres between their middles, with grey hubs, their bottoms FLOOR metres below its
  // middle.
  const FLOOR = 3.6;
  const leg = (x, z, r, apart, top) => {
    const y = r - FLOOR; // the axle's
    const disc = (radius, width, color, dx) =>
      part(new THREE.CylinderGeometry(radius, radius, width, 12).rotateZ(Math.PI / 2), color, [
        x + dx,
        y,
        z,
      ]);
    return [
      part(new THREE.BoxGeometry(0.25, top - y, 0.25), 0x9aa0a6, [x, (top + y) / 2, z]),
      part(new THREE.BoxGeometry(apart, 0.15, 0.15), 0x9aa0a6, [x, y, z]),
      ...[-1, 1].flatMap((s) => [
        disc(r, 0.35, 0x1d1d1d, (s * apart) / 2),
        disc(r / 2, 0.37, 0xb8bec4, (s * apart) / 2),
      ]),
    ];
  };
  // A swept wing on side (±1), from its root at x 0 out to span, [leading, trailing] edge z at
  // root and tip, rising a little outwards.
  const wing = (side, span, [rootLead, rootTrail], [tipLead, tipTrail], thick) =>
    new THREE.ExtrudeGeometry(
      new THREE.Shape([
        new THREE.Vector2(0, rootLead),
        new THREE.Vector2(side * span, tipLead),
        new THREE.Vector2(side * span, tipTrail),
        new THREE.Vector2(0, rootTrail),
      ]),
      { depth: thick, bevelEnabled: false },
    )
      .rotateX(Math.PI / 2)
      .translate(0, thick / 2, 0)
      .rotateZ(side * 0.08);
  const APOTHEM = 2 * Math.cos(Math.PI / 8); // of the fuselage's faces
  // A cabin window at z on the fuselage's upper side face.
  const porthole = (side, z) => {
    const angle = (3 * Math.PI) / 8;
    const r = APOTHEM + 0.01; // nearly flush with the face
    const g = new THREE.BoxGeometry(0.6, 0.04, 0.5).rotateZ(-side * angle);
    return part(g, GLASS, [side * r * Math.sin(angle), r * Math.cos(angle), z]);
  };
  // The fin from the side ([z, y]), red with a white Swiss cross through it, showing both sides.
  const fin = profile(
    [
      [-13, 1.8],
      [-18.3, 8],
      [-19.8, 8],
      [-19.4, 0],
    ],
    0.5,
  );
  const geometry = mergeGeometries([
    part(fuselage, WHITE, [0, 0, 0]),
    part(nose, WHITE, [0, 0, 15]),
    part(tailCone, WHITE, [0, 0, -18]),
    part(fin, 0xd52b1e, [0, 0, 0]),
    part(cockpit, GLASS, [0, 0, 15]),
    part(new THREE.BoxGeometry(0.6, 2.7, 0.8), WHITE, [0, 4.6, -17.5]),
    part(new THREE.BoxGeometry(0.6, 0.8, 2.7), WHITE, [0, 4.6, -17.5]),
    ...[-1, 1].flatMap((side) => [
      part(wing(side, 17, [4, -2], [-3, -5], 0.5), WHITE, [0, -0.8, 0]),
      part(wing(side, 6, [-15.2, -18.6], [-18.2, -19.6], 0.4), WHITE, [0, 0.5, 0]), // tailplane
      ...Array.from({ length: 17 }, (_, i) => porthole(side, 12 - 1.5 * i)),
    ]),
    // An engine under each wing: a nacelle wider at the front, a dark fan in it behind a
    // spinner, a narrower exhaust behind and a pylon up to the wing.
    ...[-6, 6].flatMap((x) => [
      part(along(new THREE.CylinderGeometry(1.25, 0.95, 4, 12)), 0xc9cdd2, [x, -2, 1.5]),
      part(along(new THREE.CylinderGeometry(1.05, 1.05, 0.1, 12)), 0x22262b, [x, -2, 3.5]),
      part(along(new THREE.ConeGeometry(0.35, 0.8, 8)), WHITE, [x, -2, 3.8]),
      part(along(new THREE.CylinderGeometry(0.65, 0.35, 1.4, 10)), 0x4a4f55, [x, -2, -1.2]),
      part(new THREE.BoxGeometry(0.3, 1, 2.4), WHITE, [x, -1, 0.9]),
    ]),
  ]).scale(SCALE, SCALE, SCALE);
  // Its gear, a mesh of its own, shown only while it stands on the ground.
  const wheels = mergeGeometries([
    ...[-1, 1].flatMap((side) => leg(side * 3, -1.5, 0.6, 0.8, -0.6)), // into the wing
    ...leg(0, 11, 0.45, 0.55, -1.5), // into the nose
  ]).scale(SCALE, SCALE, SCALE);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // Ovals over the city (scene metres), so the planes always stay in view: the second one higher
  // and the other way round.
  const CENTRE = [300, 0];
  const RADII = [2500, 1800];
  const flights = [
    { height: 700 - 250, direction: 1 },
    { height: 950 - 250, direction: -1 },
    ...parked.map((place) => ({ place })),
  ].map((flight) => {
    const mesh = new THREE.Mesh(geometry, material.clone()); // its own, highlighted under the mouse
    mesh.rotation.order = "YXZ"; // heading, then pitch and bank in the plane's frame
    const gear = new THREE.Mesh(wheels, mesh.material);
    mesh.add(gear);
    // Riding along: from behind and above.
    const ride = riders([
      { object: mesh, materials: [mesh.material], eye: [0, 12, -70], ahead: [0, 0, 60] },
    ]);
    // Its wheels low below its middle; a plane does not hover.
    const craft = {
      group: mesh,
      ride,
      speed: SPEED,
      turn: 0.4,
      low: FLOOR * SCALE,
      nose: 30, // metres from its middle to its nose
      unarmed: true,
      plane: true,
      // Parked on the ground, it first rises straight up this far when boarded, as the jet does
      // (else flying on level it meets the ground ahead at once), clear of what is round it.
      lift: flight.place ? LIFT : 0,
    };
    return { ...flight, mesh, gear, craft };
  });
  // Each placed by flown (createFlight) while it is the one flown (flier), else on its oval or
  // place; its gear out only there.
  const update = (seconds, flier, flown) => {
    for (const { mesh, gear, height, direction, craft, place } of flights) {
      mesh.scale.setScalar(boost(mesh.position));
      gear.visible = !!place && craft !== flier;
      if (craft === flier) {
        mesh.position.set(flown.x, flown.y, flown.z);
        mesh.rotation.set(flown.nose - flight.LEVEL, flown.heading, -0.6 * flown.turn);
        continue;
      }
      if (place) {
        mesh.position.set(place.x, place.y + craft.low, place.z);
        mesh.rotation.set(0, place.heading, 0);
        continue;
      }
      const a = (direction * seconds * SPEED) / ((RADII[0] + RADII[1]) / 2);
      mesh.position.set(
        CENTRE[0] + RADII[0] * Math.cos(a),
        height,
        CENTRE[1] + RADII[1] * Math.sin(a),
      );
      // Along the oval: its velocity is direction × (-RADII[0] sin a, RADII[1] cos a).
      mesh.rotation.y = Math.atan2(
        -direction * RADII[0] * Math.sin(a),
        direction * RADII[1] * Math.cos(a),
      );
      mesh.rotation.x = 0;
      mesh.rotation.z = 0.3 * direction; // banking into the turn
    }
  };
  return { meshes: flights.map((f) => f.mesh), crafts: flights.map((f) => f.craft), update };
}

// A low-poly helicopter after the look of an attack helicopter: a narrow, pointed body, a ducted
// tail rotor, stub wings with rocket pods. It circles (cx, cz) at the given radius and height
// (scene metres), banking into the turn, with spinning rotors and blinking lights. Bright yellow
// with a black window, legs and weapons, to stand out against the sky as well as the red roofs.
// launchers: where its rockets leave, in its own frame.
export function createHelicopter(cx, cz, radius, height, scale, flight) {
  const YELLOW = 0xffd000;
  const DARK = 0x1c1f24; // legs, weapons, rotors
  const GLASS = 0x141a22;
  // Six-sided, along +z (the nose), narrower than high; sizes in metres before scaling.
  const hull = (g) => g.rotateX(Math.PI / 2).scale(0.95, 1, 1);
  // The windscreen, pointing forward: flat on the two upper faces of the nose (from its base at
  // z 1.1 to its tip at 2.7) and of the body behind it, a little above them, and wound both ways,
  // so it shows from outside. Its triangles on one side, as [x, y, z]:
  const screen = [
    [
      [0, 0.3, 2.14],
      [0, 0.82, 1.1],
      [0.62, 0.443, 1.1],
    ], // on the nose
    [
      [0, 0.82, 1.1],
      [0, 0.835, 0.3],
      [0.62, 0.459, 0.3],
    ], // on the body
    [
      [0, 0.82, 1.1],
      [0.62, 0.459, 0.3],
      [0.62, 0.443, 1.1],
    ],
  ];
  const both = [-1, 1].flatMap((side) =>
    screen.map((triangle) => triangle.map(([x, y, z]) => [side * x, y, z])),
  );
  const windscreen = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [...both, ...both.map((triangle) => triangle.toReversed())].flat(2),
      3,
    ),
  );
  const skids = [-1, 1].map((side) =>
    part(new THREE.BoxGeometry(0.12, 0.12, 3.6), DARK, [side * 0.9, -1.5, 0.2]),
  );
  // Struts from the belly out and down to the skids.
  const struts = [-1, 1].flatMap((side) =>
    [-0.8, 1.0].map((z) => {
      const strut = new THREE.BoxGeometry(0.1, 1, 0.1).rotateZ(side * 0.6);
      return part(strut, DARK, [side * 0.6, -1.07, z]);
    }),
  );
  // Where the rockets leave the pods, one on each side.
  const launchers = [-1, 1].map((side) => new THREE.Vector3(side * 1.6, -0.75, 0.9));
  const pod = () => new THREE.CylinderGeometry(0.18, 0.18, 1.2, 8).rotateX(Math.PI / 2);
  // The ring around the tail rotor, upright across the tail.
  const duct = new THREE.TorusGeometry(0.6, 0.14, 6, 12).rotateY(Math.PI / 2);
  const body = mergeGeometries([
    part(hull(new THREE.CylinderGeometry(0.8, 0.85, 2.6, 6)), YELLOW, [0, 0, -0.2]), // middle
    part(hull(new THREE.ConeGeometry(0.8, 1.6, 6)), YELLOW, [0, 0, 1.9]), // pointed nose
    part(windscreen, GLASS, [0, 0, 0]),
    part(new THREE.BoxGeometry(0.85, 0.4, 1.3), YELLOW, [0, 0.88, -0.9]), // engines
    part(hull(new THREE.CylinderGeometry(0.45, 0.2, 3.5, 6)), YELLOW, [0, 0.15, -3.25]), // boom
    part(duct, YELLOW, [0, 0.35, -5.7]),
    part(new THREE.BoxGeometry(0.1, 0.9, 0.6), YELLOW, [0, 1.25, -5.75]), // fin
    part(new THREE.BoxGeometry(1.4, 0.06, 0.45), YELLOW, [0, 0.2, -4.6]), // stabiliser
    part(new THREE.CylinderGeometry(0.12, 0.12, 0.72, 5), YELLOW, [0, 1.44, -0.4]), // mast
    part(new THREE.BoxGeometry(3.4, 0.08, 0.5), DARK, [0, -0.6, 0.2]), // stub wings
    ...launchers.map(({ x, y }) => part(pod(), DARK, [x, y, 0.3])), // rocket pods
    ...skids,
    ...struts,
  ]);
  // Four blades with yellow tips.
  const rotor = mergeGeometries(
    [0, Math.PI / 2].flatMap((angle) => [
      part(new THREE.BoxGeometry(9, 0.08, 0.35).rotateY(angle), DARK, [0, 0, 0]),
      ...[-1, 1].map((side) =>
        part(new THREE.BoxGeometry(0.6, 0.09, 0.36).rotateY(angle), YELLOW, [
          side * 4.2 * Math.cos(angle),
          0,
          -side * 4.2 * Math.sin(angle),
        ]),
      ),
    ]),
  );
  // Two blades crossed, inside the duct.
  const tailRotor = mergeGeometries(
    [0, Math.PI / 2].map((angle) =>
      part(new THREE.BoxGeometry(0.06, 0.8, 0.1).rotateX(angle), DARK, [0, 0, 0]),
    ),
  );

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const group = new THREE.Group();
  const main = new THREE.Mesh(rotor, material);
  main.position.set(0, 1.8, -0.4);
  const tail = new THREE.Mesh(tailRotor, material);
  tail.position.set(0, 0.35, -5.7); // in the middle of the duct
  // Blinking lights: a red beacon on top, a white strobe at the tail; unlit, so they glow.
  const light = (color, [x, y, z]) => {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.3, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3) }),
    );
    mesh.position.set(x, y, z);
    return mesh;
  };
  const beacon = light(0xff2010, [0, 1.15, -1.4]);
  const strobe = light(0xffffff, [0, 1.75, -5.75]);
  group.add(new THREE.Mesh(body, material), main, tail, beacon, strobe);
  group.scale.setScalar(scale);
  group.rotation.order = "YXZ"; // heading first, then pitch and bank in the helicopter's frame

  // Placed by flown (createFlight) while steered, else back on its circle.
  const update = (seconds, flown) => {
    if (flown) {
      group.position.set(flown.x, flown.y, flown.z);
      group.rotation.set(flown.nose, flown.heading, -0.3 * flown.turn * flown.speed);
    } else {
      const angle = seconds * 0.5; // about 13 s per round
      const y = height + 25 * Math.sin(seconds * 0.35); // gently up and down, ±25 m
      group.position.set(cx + radius * Math.cos(angle), y, cz + radius * Math.sin(angle));
      group.rotation.y = Math.atan2(-Math.sin(angle), Math.cos(angle)); // along the circle
      group.rotation.x = flight.LEVEL;
      group.rotation.z = 0.5; // banking towards the centre
    }
    main.rotation.y = seconds * 25;
    tail.rotation.x = seconds * 40;
    beacon.visible = seconds % 1 < 0.15; // once a second
    strobe.visible = seconds % 1.5 < 0.06 || (seconds % 1.5 > 0.18 && seconds % 1.5 < 0.24); // double flash
  };
  // Riding along: from behind and above, looking down on it a little (before scaling), its
  // crosshair (dip) just above the front of its rotor.
  const ride = riders([
    { object: group, materials: [material], eye: [0, 4.5, -22], ahead: [0, -2, 14] },
  ]);
  // Flown at speed metres per second, turning up to turn radians per second (createFlight); its
  // skids low below its middle, its rotor reaching nose ahead of it (before scaling); it fires
  // dip radians below its body.
  return {
    group,
    update,
    ride,
    launchers,
    speed: 60,
    turn: 1.1,
    low: 1.56,
    nose: 4.1,
    dip: 0.07,
  };
}

// Flying the helicopter or the UFO while riding it (input { climb, turn, stop }, climb and turn
// each -1, 0 or 1, from steering()), at most HIGH, over the terrain's area; nothing keeps it off
// the ground (see fly). Holding climb tilts the nose by TILT
// radians per second, and it stays when let go. Flying, it goes craft.speed (metres per second)
// along the nose, from UP above level to DOWN below; tilting through level, it stops there until
// pressed anew, and it levels out at HIGH. Stopped, it hovers and the nose only aims, from
// level to AIM down. Speed, nose and turning (up to craft.turn radians per second) are eased. A
// craft with lift (metres) first rises straight up that far at half its speed, then goes on from a
// standstill. The state, flown: { x, y, z, heading, speed (0 to 1, times craft.speed), aim (where
// the nose goes, radians down), nose, turn, levelled (the climb input that last reached level,
// while still held), lift (metres still to rise) }.
export function createFlight(intoArea) {
  const LEVEL = 0.12; // the nose down when flying level (radians)
  const UP = 0.35; // radians, about 20°
  const DOWN = 0.8; // radians, about 45°
  const AIM = 1.2; // radians, about 70°
  const TILT = 1.2;
  const HIGH = 1000; // scene y
  return {
    LEVEL,
    // The state to fly a craft ({ group, lift }) on from where it is.
    start: ({ group, lift = 0 }) => ({
      ...group.position,
      heading: group.rotation.y,
      speed: lift ? 0 : 1,
      aim: LEVEL,
      nose: LEVEL,
      turn: 0,
      levelled: 0,
      lift,
    }),
    step(flown, input, dt, craft) {
      if (flown.lift > 0) {
        const rise = Math.min(flown.lift, (craft.speed / 2) * dt, HIGH - flown.y);
        flown.y += rise;
        flown.lift = rise > 0 ? flown.lift - rise : 0;
        return;
      }
      const ease = (value, to, rate) => value + (to - value) * Math.min(1, dt * rate);
      if (input.climb !== flown.levelled) flown.levelled = 0;
      if (input.climb && !flown.levelled) {
        const next = flown.aim - input.climb * TILT * dt;
        // Already at HIGH, flying, the nose does not tilt on towards it, so it does not rise for
        // a moment before levelling out again.
        const bound = next < LEVEL && flown.y >= HIGH;
        if (!input.stop && ((next - LEVEL) * (flown.aim - LEVEL) < 0 || bound)) {
          flown.aim = LEVEL;
          flown.levelled = input.climb;
        } else flown.aim = next;
      }
      flown.aim = input.stop
        ? THREE.MathUtils.clamp(flown.aim, 0, AIM)
        : THREE.MathUtils.clamp(flown.aim, LEVEL - UP, LEVEL + DOWN);
      flown.speed = ease(flown.speed, input.stop ? 0 : 1, 6);
      flown.nose = ease(flown.nose, flown.aim, 8);
      flown.turn = ease(flown.turn, input.turn, 4);
      flown.heading += flown.turn * craft.turn * dt;
      const down = flown.nose - LEVEL; // the angle it flies below level
      const step = flown.speed * craft.speed * dt;
      [flown.x, flown.z] = intoArea(
        flown.x + Math.sin(flown.heading) * Math.cos(down) * step,
        flown.z + Math.cos(flown.heading) * Math.cos(down) * step,
      );
      const y = flown.y - Math.sin(down) * step;
      if (!input.stop && y > HIGH && down < 0) {
        flown.aim = LEVEL;
        flown.levelled = input.climb;
      }
      flown.y = Math.min(y, HIGH);
    },
  };
}
