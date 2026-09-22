/**
 * Game sounds, as in Multiversal Chess: a recorded piece move (public/audio/chess-move.wav)
 * and a synthesised capture made of three band-passed noise knocks. Everything plays through
 * one gain node, so volume and mute apply everywhere.
 */

let context: AudioContext | null = null;
let output: GainNode | null = null;
let enabled = true;
let volume = 0.8;
let moveSample: AudioBuffer | null = null;
let loading: Promise<void> | null = null;

function audio(): { context: AudioContext; output: GainNode } | null {
  if (!context) {
    try {
      context = new AudioContext();
      output = context.createGain();
      output.gain.value = enabled ? volume : 0;
      output.connect(context.destination);
    } catch {
      context = null;
      return null;
    }
  }
  return context && output ? { context, output } : null;
}

export function setSoundsEnabled(on: boolean): void {
  enabled = on;
  if (output) output.gain.value = enabled ? volume : 0;
}

export function setVolume(percent: number): void {
  volume = Math.max(0, Math.min(100, percent)) / 100;
  if (output) output.gain.value = enabled ? volume : 0;
}

/** Browsers start audio suspended until a user gesture; call from any click handler. */
export function resumeAudio(): void {
  const a = audio();
  if (a?.context.state === "suspended") void a.context.resume();
  void preloadSounds();
}

export function preloadSounds(url = "audio/chess-move.wav"): Promise<void> {
  if (loading) return loading;
  const a = audio();
  if (!a) return Promise.resolve();
  loading = fetch(url)
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(url))))
    .then((bytes) => a.context.decodeAudioData(bytes))
    .then((buffer) => { moveSample = buffer; })
    .catch(() => undefined); // Without the sample a move falls back to a synthesised knock.
  return loading;
}

/** A band-passed noise burst that decays exponentially: one wooden knock. */
function noise(c: AudioContext, destination: AudioNode, duration: number, gainPeak: number, frequency: number, q = 1.5, startAt = 0): void {
  const rate = c.sampleRate;
  const length = Math.max(1, Math.floor(rate * duration));
  const buffer = c.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = c.createBufferSource();
  source.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const gain = c.createGain();
  const t0 = c.currentTime + startAt;
  gain.gain.setValueAtTime(gainPeak, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  source.connect(filter).connect(gain).connect(destination);
  source.start(t0);
  source.stop(t0 + duration + 0.05);
}

export function soundMove(): void {
  const a = audio();
  if (!enabled || !a) return;
  if (moveSample) {
    const source = a.context.createBufferSource();
    source.buffer = moveSample;
    source.connect(a.output);
    source.start();
  } else {
    noise(a.context, a.output, 0.06, 0.55, 1000, 2);
    noise(a.context, a.output, 0.04, 0.25, 400, 1, 0.025);
  }
}

export function soundCapture(): void {
  const a = audio();
  if (!enabled || !a) return;
  noise(a.context, a.output, 0.1, 0.75, 700, 2);
  noise(a.context, a.output, 0.07, 0.4, 300, 1, 0.03);
  noise(a.context, a.output, 0.05, 0.2, 150, 1, 0.07);
}

/** Only two sounds: a piece taken, or a piece moved. */
export function playMoveSound(move: { captured?: string }): void {
  if (move.captured) soundCapture();
  else soundMove();
}
