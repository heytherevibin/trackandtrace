import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Group, LineSegments, Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import { baseOf, cloneShared, createStyle, drawn, edgesOf, mergeAll, type Palette } from "@/components/landing/journey/scene/lines";

const INK = new Color(0, 0, 0);
const PALETTE: Palette = { ground: INK, ink: INK, steel: INK, steelText: INK };

describe("the drawing's lines", () => {
  it("draws a solid as its fill and its creases, with the fill pushed back so hidden edges stay hidden", () => {
    const style = createStyle(PALETTE);
    const [fill, edges] = drawn(new BoxGeometry(1, 1, 1), style).children;
    expect(fill).toBeInstanceOf(Mesh);
    expect(fill instanceof Mesh && fill.material).toBe(style.fill);
    expect([style.fill.polygonOffset, style.fill.polygonOffsetFactor, style.fill.polygonOffsetUnits]).toEqual([true, 1.5, 2]);
    expect(edges).toBeInstanceOf(LineSegments);
    expect(edges instanceof LineSegments && edges.geometry.attributes.position.count).toBe(24); // a box's 12 creases
    expect(baseOf(edges)).toBe(style.line);
  });

  it("keeps each edge set's base material across a shared clone (a second coach)", () => {
    const style = createStyle(PALETTE);
    const src = new Group();
    src.add(drawn(new BoxGeometry(1, 1, 1), style, { lineMat: style.faint }));
    const [a] = edgesOf(src);
    const [b] = edgesOf(cloneShared(src));
    expect(b).not.toBe(a);
    expect(b.geometry).toBe(a.geometry);
    expect(baseOf(b)).toBe(style.faint);
  });

  it("merges meshes into one geometry in the group's frame", () => {
    const group = new Group();
    const one = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    const two = one.clone();
    two.position.x = 5;
    group.add(one, two);
    const merged = mergeAll(group);
    expect(merged.attributes.position.count).toBe(72);
    merged.computeBoundingBox();
    expect(merged.boundingBox?.max.x).toBeCloseTo(5.5, 6);
  });

  it("turns a mirrored mesh's triangles back the right way round", () => {
    const tri = new BufferGeometry();
    tri.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    const m = new Mesh(tri, new MeshBasicMaterial());
    m.scale.x = -1;
    const group = new Group();
    group.add(m);
    const out = Array.from(mergeAll(group).attributes.position.array, (v) => v + 0); // -0 reads as 0
    expect(out).toEqual([0, 0, 0, 0, 1, 0, -1, 0, 0]);
  });
});
