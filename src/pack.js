// Whole numbers packed into bytes, seven bits each and the eighth set while more follow, as
// tools/pack.mjs writes them.
export class Packed {
  constructor(bytes) {
    this.bytes = bytes;
    this.at = 0;
  }
  number() {
    let value = 0;
    let scale = 1;
    for (;;) {
      const byte = this.bytes[this.at++];
      value += (byte & 127) * scale;
      if (byte < 128) return value;
      scale *= 128;
    }
  }
  signed() {
    const value = this.number();
    return value % 2 ? -(value + 1) / 2 : value / 2;
  }
}

// The points of public/<kind>s.bin (tools/paths.mjs) as Float32 x, y, z in metres: stored in
// tenths of a metre, each as how its step from the point before changed.
export function unpackPoints(buffer) {
  const packed = new Packed(new Uint8Array(buffer));
  const points = new Float32Array(packed.number() * 3);
  const last = [0, 0, 0];
  const step = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    step[i % 3] += packed.signed();
    points[i] = (last[i % 3] += step[i % 3]) / 10;
  }
  return points;
}
