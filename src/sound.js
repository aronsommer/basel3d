// Sounds are made on the spot with Web Audio, so no sound files are needed. The audio starts with
// the first sound, which must come from a click or key press.
let context = null;
let noise = null; // 3 s of white noise
let output = null; // a compressor before the speakers, so many sounds at once do not get too loud

// The audio context and the noise, made on first use.
export function audio() {
  if (!context) {
    context = new AudioContext();
    noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    output = context.createDynamicsCompressor();
    output.threshold.value = -18; // dB
    output.knee.value = 12; // dB
    output.ratio.value = 4;
    output.attack.value = 0.005; // seconds
    output.release.value = 0.25; // seconds
    output.connect(context.destination);
  }
  return { context, noise };
}

// A gain node to the speakers: from silence up to gain within 10 ms, so it does not click, then
// fading out until seconds after now.
export function fade(gain, until) {
  const { context } = audio();
  const now = context.currentTime;
  const node = context.createGain();
  node.gain.setValueAtTime(0, now);
  node.gain.linearRampToValueAtTime(gain, now + 0.01);
  node.gain.exponentialRampToValueAtTime(0.001, now + until);
  node.connect(output);
  return node;
}
