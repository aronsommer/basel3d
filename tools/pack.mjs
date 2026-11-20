// Writes what src/pack.js reads: whole numbers packed into bytes, seven bits each and the eighth
// set while more follow.
import { guess } from "../src/pack.js";

export class Bytes {
  list = [];
  number(n) {
    for (; n > 127; n = Math.floor(n / 128)) this.list.push((n % 128) | 128);
    this.list.push(n);
  }
  signed(n) {
    this.number(n < 0 ? -n * 2 - 1 : n * 2);
  }
}

// Points [x, y, z, …] in metres, rounded to tenths, for unpackPoints.
export function packPoints(points) {
  const bytes = new Bytes();
  bytes.number(points.length / 3);
  const last = [0, 0, 0];
  const step = [0, 0, 0];
  points.forEach((v, i) => {
    const tenths = Math.round(v * 10);
    bytes.signed(tenths - last[i % 3] - step[i % 3]);
    step[i % 3] = tenths - last[i % 3];
    last[i % 3] = tenths;
  });
  return Buffer.from(bytes.list);
}

// Heights (Int16 in cm, nx per row) for unpackHeights.
export function packHeights(heights, nx) {
  const bytes = new Bytes();
  bytes.number(heights.length);
  heights.forEach((v, i) => bytes.signed(v - guess(heights, i, nx)));
  return Buffer.from(bytes.list);
}
