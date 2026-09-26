import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StationField } from "@/components/ui/station-field";

// The field takes a NAME now, and must still take a CODE — that is the requirement, not a nicety.
// Every reader who has used this form knows "SBC", and the provider's own search returns NOTHING
// for it. A picker that got in the way of the code would be a step backwards.

const SBC = { code: "SBC", name: "Krantivira Sangolli Rayanna (Bengaluru)" };
const SMVB = { code: "SMVB", name: "SMVT Bengaluru" };

function stubFetch(stations: readonly unknown[] = [SBC, SMVB]) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, stations }) }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function Harness() {
  const [value, setValue] = useState("");
  return <StationField id="from" label="From" value={value} onChange={setValue} />;
}

const field = () => screen.getByLabelText("From");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the station field", () => {
  it("still takes a code typed straight in, and upper-cases it", async () => {
    stubFetch();
    render(<Harness />);
    fireEvent.change(field(), { target: { value: "sbc" } });
    // The value is the code, exactly as before this existed. Nothing about the picker may change
    // what a reader who knows what they want gets by typing it.
    expect(field()).toHaveValue("SBC");
  });

  it("waits for a pause before asking, rather than once per keystroke", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch();
    render(<Harness />);
    for (const text of ["b", "be", "ben", "beng"]) fireEvent.change(field(), { target: { value: text } });
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    // Four keystrokes, one request. Typing is the fastest way to produce queries in this product.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks for nothing below two characters", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch();
    render(<Harness />);
    fireEvent.change(field(), { target: { value: "b" } });
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("puts the chosen station's CODE in the field, not its name", async () => {
    stubFetch();
    render(<Harness />);
    fireEvent.change(field(), { target: { value: "bengaluru" } });
    await waitFor(() => expect(screen.getByRole("option", { name: /SBC/ })).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByRole("button", { name: /SBC/ }));
    // The form searches by code; a name in the box would be a search that cannot run.
    expect(field()).toHaveValue("SBC");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("does not search again for the code it just inserted", async () => {
    const fetchMock = stubFetch();
    render(<Harness />);
    fireEvent.change(field(), { target: { value: "bengaluru" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /SBC/ })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(screen.getByRole("button", { name: /SBC/ }));
    // Picking is not typing. Searching for "SBC" here would spend a request to reopen a list the
    // reader has just closed — and the debounce is 250ms, so waiting past it is the real check.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("walks the list with the arrows and takes the highlighted one on Enter", async () => {
    stubFetch();
    render(<Harness />);
    fireEvent.change(field(), { target: { value: "bengaluru" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field()).toHaveValue("SMVB");
  });

  it("leaves Enter alone when nothing is highlighted, so a submit stays a submit", async () => {
    stubFetch();
    render(<Harness />);
    fireEvent.change(field(), { target: { value: "bengaluru" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    fireEvent.keyDown(field(), { key: "Enter" });
    // Taking the first option on a bare Enter would overwrite a perfectly good code the moment
    // someone pressed Enter to search.
    expect(field()).toHaveValue("BENGALURU");
  });

  it("drops a list the moment it stops answering what is in the box", async () => {
    // "bengaluru" finds two; "SBC" finds only SBC. Until the second answer lands, the old list is
    // offering stations that match neither the text on screen nor anything the reader asked for.
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("SBC") ? { ok: true, json: async () => ({ ok: true, stations: [SBC] }) } : { ok: true, json: async () => ({ ok: true, stations: [SBC, SMVB] }) },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    fireEvent.change(field(), { target: { value: "bengaluru" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

    fireEvent.change(field(), { target: { value: "SBC" } });
    // Immediately: the old two are gone, not still on screen waiting to be replaced.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
  });

  it("offers nothing and says nothing when the lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<Harness />);
    fireEvent.change(field(), { target: { value: "bengaluru" } });
    await waitFor(() => expect(field()).toHaveValue("BENGALURU"));
    // Silence. A field that interrupts someone mid-word has made typing worse than the plain box.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
