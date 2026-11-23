// The Berufsfeuerwehr's station as on photos of it, laid onto plain fronts of the model: closed
// gates of glass folding doors from corner to corner, all as wide, a no-parking sign on each, and
// above them, on a band without windows up to the model's next row of windows, "Berufsfeuerwehr
// Basel-Stadt" in fluorescent red-orange. Drawn here, so nothing is loaded.
import * as THREE from "three";

export const GREY = "#c3c4c0"; // the walls'
const K = 36; // pixels a metre
const GATE = 5; // metres wide
const LEAVES = 5; // per gate
const POST = 0.35; // metres wide, between the gates; at the corners as wide as is left, at least
const HIGH = 4.5; // metres, the gates above the street
const LINTEL = 0.3; // metres high, over the gates

// One front, one mesh: corners, its bottom ones as seen from the street, left then right (scene x,
// z); foot, its scene y; street, metres from it up to the street; band, metres from it up to the
// band's top.
export function createFireStation({ corners: [[lx, lz], [rx, rz]], foot, street, band }) {
  const width = Math.hypot(rx - lx, rz - lz);
  // As many gates as fit, in the middle: where each begins, metres along.
  const count = Math.floor((width - POST) / (GATE + POST));
  const corner = (width - count * GATE - (count - 1) * POST) / 2;
  const gates = Array.from({ length: count }, (_, k) => corner + k * (GATE + POST));
  const top = street + HIGH;
  const canvas = Object.assign(document.createElement("canvas"), {
    width: Math.ceil(width * K),
    height: Math.ceil(band * K),
  });
  const brush = canvas.getContext("2d");
  // Metres along and up from the bottom left.
  brush.setTransform(K, 0, 0, -K, 0, canvas.height);
  const rect = (colour, u0, h0, u1, h1) => {
    brush.fillStyle = colour;
    brush.fillRect(u0, h0, u1 - u0, h1 - h0);
  };
  rect(GREY, 0, top, width, band);
  rect("#d9d8d2", 0, top, width, top + LINTEL);
  // Aluminium frames, the posts and the leaves' feet; dark glass, lighter towards the top.
  rect("#b4b8b9", 0, 0, width, top);
  const glass = brush.createLinearGradient(0, street, 0, top);
  glass.addColorStop(0, "#2f3539");
  glass.addColorStop(1, "#56616a");
  const leaf = GATE / LEAVES;
  for (const u of gates) {
    for (let n = 0; n < LEAVES; n++) {
      const l = u + n * leaf;
      rect(glass, l + 0.06, street + 0.35, l + leaf - 0.06, top - 0.08);
    }
    // No parking: a red ring around blue, crossed out, in the gate's middle at eye height.
    const [c, h] = [u + GATE / 2, street + 1.6];
    brush.fillStyle = "#d52b1e";
    brush.beginPath();
    brush.arc(c, h, 0.28, 0, 2 * Math.PI);
    brush.fill();
    brush.fillStyle = "#1f4fa0";
    brush.beginPath();
    brush.arc(c, h, 0.2, 0, 2 * Math.PI);
    brush.fill();
    brush.strokeStyle = "#d52b1e";
    brush.lineWidth = 0.07;
    brush.beginPath();
    brush.moveTo(c - 0.14, h + 0.14);
    brush.lineTo(c + 0.14, h - 0.14);
    brush.stroke();
  }
  // Text the right way up, in the band's middle: y down again.
  brush.setTransform(K, 0, 0, K, 0, canvas.height);
  brush.fillStyle = "#ff3a12"; // as the police vans' band (src/police.js)
  brush.font = "bold 1.1px Helvetica, Arial, sans-serif";
  brush.textAlign = "center";
  const baseline = (top + LINTEL + band) / 2 - 0.4;
  brush.fillText("Berufsfeuerwehr Basel-Stadt", width / 2, -baseline, 0.6 * width);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8; // sharp when seen at a slant

  const [nx, nz] = [(lz - rz) / width, (rx - lx) / width]; // outwards
  const plane = new THREE.PlaneGeometry(width, canvas.height / K);
  const uv = plane.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * width * K) / canvas.width);
  const material = new THREE.MeshLambertMaterial({
    map: texture,
    // Before the wall it lies on, also far away.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  return new THREE.Mesh(
    plane
      .rotateY(Math.atan2(nx, nz))
      .translate(
        (lx + rx) / 2 + 0.08 * nx,
        foot + canvas.height / K / 2,
        (lz + rz) / 2 + 0.08 * nz,
      ),
    material,
  );
}
