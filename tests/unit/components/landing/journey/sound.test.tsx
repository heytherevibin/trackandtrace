import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseSound } from "@/components/shell/use-sound";
import { startSound } from "@/components/landing/journey/sound";

// The rail clack's audio context follows the Sound switch: off suspends it, so nothing keeps the audio device
// awake; on (or the next gesture) resumes it.

const param = () => ({ value: 0, setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined });
interface FakeNode {
  connect(next?: FakeNode): FakeNode;
}
const node = (): FakeNode & Record<string, unknown> => {
  const n = {
    connect: (next?: FakeNode) => next ?? n,
    gain: param(),
    frequency: param(),
    Q: param(),
    type: "",
    buffer: null,
    start: () => undefined,
    stop: () => undefined,
  };
  return n;
};

const made: FakeContext[] = [];
class FakeContext {
  state: AudioContextState = "running";
  readonly sampleRate = 8000;
  readonly currentTime = 0;
  readonly destination = node();
  readonly createGain = node;
  readonly createBufferSource = node;
  readonly createBiquadFilter = node;
  readonly createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
  readonly resume = vi.fn(async () => {
    this.state = "running";
  });
  readonly suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  readonly close = vi.fn(async () => {
    this.state = "closed";
  });
  constructor() {
    made.push(this);
  }
}

describe("the rail clack's audio context", () => {
  const real = window.AudioContext;
  beforeEach(() => {
    window.AudioContext = FakeContext as unknown as typeof AudioContext;
  });
  afterEach(() => {
    window.AudioContext = real;
    made.length = 0;
  });

  it("is suspended when Sound turns off, and resumed when it turns back on", () => {
    const stop = startSound();
    chooseSound(true);
    expect(made).toHaveLength(1);
    const ctx = made[0]!;
    chooseSound(false);
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    ctx.state = "suspended";
    chooseSound(true);
    expect(ctx.resume).toHaveBeenCalled();
    expect(made).toHaveLength(1);
    stop();
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });
});
