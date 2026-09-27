import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseSound } from "@/components/shell/use-sound";
import { DEPART_EVENT } from "@/components/landing/journey/journey-events";
import { HORN_KEY, startSound } from "@/components/landing/journey/sound";

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

describe("the departure horn (J5-18)", () => {
  const real = window.AudioContext;
  const tones: number[] = [];
  class HornContext extends FakeContext {
    readonly createOscillator = () => {
      const o = { ...node(), frequency: { value: 0 }, type: "", start: () => tones.push(o.frequency.value) };
      return o;
    };
  }
  beforeEach(() => {
    window.AudioContext = HornContext as unknown as typeof AudioContext;
    window.sessionStorage.clear();
    tones.length = 0;
  });
  afterEach(() => {
    window.AudioContext = real;
    made.length = 0;
    chooseSound(false);
  });

  it("sounds its two tones once per visit as the train departs, while Sound is on", () => {
    const stop = startSound();
    chooseSound(true); // the switch is the reader's own gesture: the audio wakes
    window.dispatchEvent(new Event(DEPART_EVENT));
    expect(tones).toEqual([311, 392]);
    expect(window.sessionStorage.getItem(HORN_KEY)).toBe("1");
    window.dispatchEvent(new Event(DEPART_EVENT));
    expect(tones).toEqual([311, 392]);
    stop();
  });

  it("stays silent with Sound off, and before any gesture has woken the audio, and remembers nothing then", () => {
    const stop = startSound();
    window.dispatchEvent(new Event(DEPART_EVENT));
    expect(tones).toEqual([]);
    window.localStorage.setItem("tt.sound", "on"); // a remembered "on", but no gesture yet this visit
    window.dispatchEvent(new Event(DEPART_EVENT));
    expect(tones).toEqual([]);
    expect(window.sessionStorage.getItem(HORN_KEY)).toBeNull();
    window.localStorage.removeItem("tt.sound");
    stop();
  });
});
