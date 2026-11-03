/*
 * The Daily's sound, synthesized in the browser like an old console's: no audio files. Effects are
 * short tones and noise bursts; each world has a quiet ambience (rain, wind, waves, crickets at night).
 * Browsers only allow sound after a click or key press, so nothing plays until `unlock()` is called
 * from one (the title screen's Play). Muting is remembered in this browser.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
try { muted = localStorage.getItem("daily-muted") === "1"; } catch { /* no storage: sound on */ }

/** Starts the audio (call from a click or key press). */
export function unlock(): void {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  void ctx.resume();
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try { localStorage.setItem("daily-muted", m ? "1" : "0"); } catch { /* fine */ }
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05);
}

/** A tone: `type` wave at `freq` Hz for `dur` seconds, sliding to `to` if given, with a quick attack and decay. */
function tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.15, to?: number, delay = 0): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

let noiseBuffer: AudioBuffer | null = null;
function noiseSource(): AudioBufferSourceNode | null {
  if (!ctx) return null;
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  return src;
}

/** A burst of filtered noise: thuds (low), hits (mid), clinks (high). */
function noise(dur: number, vol: number, freq: number, type: BiquadFilterType = "lowpass", delay = 0): void {
  if (!ctx || !master) return;
  const src = noiseSource();
  if (!src) return;
  const t = ctx.currentTime + delay;
  const filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  filter.type = type;
  filter.frequency.value = freq;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

/** A run of notes, one after another. */
function notes(freqs: number[], step: number, dur: number, type: OscillatorType = "square", vol = 0.12): void {
  freqs.forEach((f, i) => tone(f, dur, type, vol, undefined, i * step));
}

export const sfx = {
  click: () => tone(1200, 0.03, "square", 0.05),
  step: () => noise(0.06, 0.06, 700),
  wipe: () => { noise(0.35, 0.12, 1200, "bandpass"); tone(300, 0.35, "sawtooth", 0.05, 900); },
  hit: () => { noise(0.12, 0.22, 1800); tone(170, 0.12, "square", 0.12, 70); },
  crit: () => { noise(0.18, 0.28, 2600); notes([880, 1320], 0.06, 0.1, "square", 0.14); },
  parry: () => { tone(1760, 0.6, "triangle", 0.18); tone(2637, 0.4, "sine", 0.1); noise(0.05, 0.2, 6000, "highpass"); },
  hurt: () => { tone(240, 0.22, "sawtooth", 0.12, 90); noise(0.1, 0.15, 900); },
  kill: () => { noise(0.4, 0.25, 600); tone(200, 0.45, "square", 0.12, 50); },
  roar: () => { tone(120, 1.1, "sawtooth", 0.22, 55); noise(1.1, 0.18, 380); },
  coin: () => notes([988, 1319], 0.07, 0.12, "square", 0.1),
  dig: () => noise(0.16, 0.25, 450),
  find: () => notes([784, 1175], 0.05, 0.08, "triangle", 0.12),
  reel: () => tone(420, 0.22, "triangle", 0.12, 980),
  snap: () => { noise(0.08, 0.3, 4000, "highpass"); tone(320, 0.25, "square", 0.1, 80); },
  boom: () => { noise(0.5, 0.35, 300); tone(90, 0.5, "square", 0.15, 40); },
  anvil: () => { tone(1568, 0.5, "triangle", 0.16); tone(2349, 0.3, "sine", 0.08); noise(0.06, 0.25, 5000, "highpass"); },
  level: () => notes([523, 659, 784, 1047], 0.09, 0.16, "square", 0.12),
  bless: () => notes([659, 880, 1109, 1319], 0.12, 0.4, "sine", 0.1),
  rest: () => notes([392, 330, 294], 0.25, 0.5, "triangle", 0.08),
  win: () => notes([523, 659, 784, 1047, 784, 1047, 1319], 0.13, 0.22, "square", 0.12),
  lose: () => notes([392, 349, 311, 262], 0.3, 0.45, "triangle", 0.12),
};

// ─── Ambience ────────────────────────────────────────────────────────────────

let ambient: { stop: () => void; key: string } | null = null;

/**
 * The world's background sound, by its weather and whether it's night: rain hisses, wind breathes,
 * the sea rumbles, and (by day in the green worlds) birds call, (by night) crickets.
 */
export function ambience(weather: string, night: boolean): void {
  const key = `${weather}|${night}`;
  if (!ctx || !master || ambient?.key === key) return;
  ambient?.stop();
  const c = ctx, out = master;
  const src = noiseSource();
  if (!src) return;
  src.loop = true;
  const filter = c.createBiquadFilter(), gain = c.createGain();
  const wet = weather === "rain" ? { type: "bandpass" as const, f: 2200, v: 0.05 } : weather === "bubbles" ? { type: "lowpass" as const, f: 260, v: 0.07 } : { type: "lowpass" as const, f: 420, v: 0.035 };
  filter.type = wet.type;
  filter.frequency.value = wet.f;
  gain.gain.value = 0.0001;
  gain.gain.setTargetAtTime(wet.v, c.currentTime, 1.5);
  // The wind (and the sea) rise and fall slowly.
  const lfo = c.createOscillator(), depth = c.createGain();
  lfo.frequency.value = 0.12;
  depth.gain.value = wet.v * 0.6;
  lfo.connect(depth).connect(gain.gain);
  src.connect(filter).connect(gain).connect(out);
  src.start();
  lfo.start();
  // Now and then: a bird by day in the green worlds, crickets at night, a bubble under the sea.
  const green = ["fireflies", "petals", "sparkles", "spores"].includes(weather);
  const timer = setInterval(() => {
    if (Math.random() > 0.5) return;
    if (weather === "bubbles") tone(180 + Math.random() * 120, 0.15, "sine", 0.05, 420);
    else if (green && night) notes([4200, 4200, 4200], 0.07, 0.04, "sine", 0.015);
    else if (green) tone(2200 + Math.random() * 600, 0.12, "sine", 0.025, 3000);
  }, 1800);
  ambient = {
    key,
    stop: () => {
      clearInterval(timer);
      gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.5);
      setTimeout(() => { try { src.stop(); lfo.stop(); } catch { /* already stopped */ } }, 1500);
    },
  };
}
