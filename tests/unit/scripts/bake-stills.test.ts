import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { STILL_MANIFEST } from "@/components/landing/journey/still-manifest";
import { shapeFor, type StillShape } from "@/components/landing/journey/still-shapes";
import { CALLOUT_PARTS } from "@/components/landing/journey/train-parts";
import { contentHash, sourceHash } from "../../../scripts/bake/emit.mjs";

const ROOT = join(__dirname, "../../..");
const file = (shape: StillShape) => readFileSync(join(ROOT, "public", shape.href), "utf8");
const gz = (shape: StillShape) => gzipSync(file(shape)).length;
const shapes = Object.values(STILL_MANIFEST.shapes);

describe("the baked stills (spec §3.D)", () => {
  it("were baked from today's scene sources", () => {
    expect(STILL_MANIFEST.sourceHash, "a scene source changed: run npm run bake:stills and commit what it writes").toBe(sourceHash(ROOT));
  });

  it("are four files in public/journey, each named by its own content", () => {
    expect(readdirSync(join(ROOT, "public/journey")).sort()).toEqual(shapes.map((s) => s.href.replace("/journey/", "")).sort());
    for (const shape of shapes) {
      expect(existsSync(join(ROOT, "public", shape.href))).toBe(true);
      expect(shape.href).toContain(`.${contentHash(file(shape))}.svg`);
    }
  });

  it("hold one group per part the manifest lists, and the anatomy shapes hold all ten", () => {
    for (const shape of shapes) for (const part of shape.parts) expect(file(shape)).toContain(`<g id="${part}"`);
    for (const wide of [true, false]) expect(STILL_MANIFEST.shapes[shapeFor("anatomy", wide)].parts).toEqual(expect.arrayContaining([...CALLOUT_PARTS]));
  });

  it("anchor every label inside the anatomy drawings, and none on the terminus", () => {
    for (const wide of [true, false]) {
      const shape: StillShape = STILL_MANIFEST.shapes[shapeFor("anatomy", wide)];
      const [, , w, h] = shape.viewBox;
      for (const id of CALLOUT_PARTS) {
        const at = shape.anchors[id];
        expect(at, id).toBeDefined();
        expect(at?.[0]).toBeGreaterThanOrEqual(0);
        expect(at?.[0]).toBeLessThanOrEqual(w);
        expect(at?.[1]).toBeGreaterThanOrEqual(0);
        expect(at?.[1]).toBeLessThanOrEqual(h);
      }
      expect(STILL_MANIFEST.shapes[shapeFor("terminus", wide)].anchors).toEqual({});
    }
  });

  it("stay within 60 KB compressed for any page, which shows one anatomy and one terminus shape (§3.H)", () => {
    for (const anatomy of [true, false]) for (const terminus of [true, false]) {
      const bytes = gz(STILL_MANIFEST.shapes[shapeFor("anatomy", anatomy)]) + gz(STILL_MANIFEST.shapes[shapeFor("terminus", terminus)]);
      expect(bytes).toBeLessThanOrEqual(60 * 1024);
    }
  });

  it("carry no script, link or handler (§3.I)", () => {
    for (const shape of shapes) expect(file(shape)).not.toMatch(/<script|href=|\son\w+=|<foreignObject/i);
  });
});
