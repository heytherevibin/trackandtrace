import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SOUND_EVENT, SOUND_STORAGE_KEY, type SoundDetail } from "@/components/shell/use-sound";
import { SoundToggle } from "@/components/shell/sound-toggle";

describe("SoundToggle", () => {
  it("is off by default", () => {
    render(<SoundToggle />);
    expect(screen.getByRole("switch", { name: "Sound" })).not.toBeChecked();
  });

  it("remembers the choice and tells the page, on and off", async () => {
    const seen: boolean[] = [];
    window.addEventListener(SOUND_EVENT, (e) => seen.push((e as CustomEvent<SoundDetail>).detail.on));
    render(<SoundToggle />);
    const sw = screen.getByRole("switch", { name: "Sound" });
    await userEvent.click(sw);
    expect(sw).toBeChecked();
    expect(window.localStorage.getItem(SOUND_STORAGE_KEY)).toBe("on");
    await userEvent.click(sw);
    expect(window.localStorage.getItem(SOUND_STORAGE_KEY)).toBeNull();
    expect(seen).toEqual([true, false]);
  });
});
