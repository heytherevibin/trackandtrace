import { SOUND_EVENT, soundOn, type SoundDetail } from "@/components/shell/use-sound";
import { START_PACE, paceStep } from "./sound-pace";
import type { Teardown } from "./start-journey";

// The rail clack (spec §2, §3.A Footer, §3.G): synthesised, no samples. A quarter-second of decaying noise,
// made once, is band-passed into two knocks 55ms apart. The audio context is made only by the reader's own
// gesture: the switch itself, or a first pointer or key press while a remembered choice is on.

interface Audio {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly noise: AudioBuffer;
}

export function startSound(): Teardown {
  let audio: Audio | null = null;
  let pace = START_PACE;
  let lastY = window.scrollY;
  let lastT = performance.now();

  const wake = (): Audio | null => {
    if (!audio) {
      if (typeof window.AudioContext !== "function") return null;
      const ctx = new window.AudioContext();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      const length = Math.floor(ctx.sampleRate * 0.25);
      const noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      audio = { ctx, master, noise };
    }
    if (audio.ctx.state === "suspended") void audio.ctx.resume().catch(() => undefined);
    return audio;
  };
  const knock = (a: Audio, at: number, level: number) => {
    const src = a.ctx.createBufferSource();
    src.buffer = a.noise;
    const band = a.ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1900 + Math.random() * 500;
    band.Q.value = 4;
    const gain = a.ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    src.connect(band).connect(gain).connect(a.master);
    src.start(at);
    src.stop(at + 0.1);
  };
  const clack = (a: Audio, level: number) => {
    const now = a.ctx.currentTime;
    knock(a, now, level);
    knock(a, now + 0.055, level * 0.8);
  };

  const onScroll = () => {
    const y = window.scrollY;
    const t = performance.now();
    const dy = y - lastY;
    const speed = Math.abs(dy) / Math.max(1, t - lastT);
    lastY = y;
    lastT = t;
    if (!audio || audio.ctx.state !== "running" || !soundOn()) return;
    const step = paceStep(pace, dy, t, speed);
    pace = step.pace;
    if (step.level !== null) clack(audio, step.level);
  };
  const onChoice = (event: Event) => {
    if (!(event as CustomEvent<SoundDetail>).detail.on) return;
    const a = wake();
    if (a) clack(a, 0.12);
  };
  const onGesture = () => {
    if (soundOn()) wake();
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener(SOUND_EVENT, onChoice);
  window.addEventListener("pointerdown", onGesture, { once: true });
  window.addEventListener("keydown", onGesture, { once: true });
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener(SOUND_EVENT, onChoice);
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
    void audio?.ctx.close().catch(() => undefined);
    audio = null;
  };
}
