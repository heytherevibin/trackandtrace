import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Group, LineSegments, Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import { NIGHT_OPACITY, baseOf, cloneShared, createStyle, drawHierarchy, drawn, edgesOf, mergeAll, restyle, type Palette } from "@/components/landing/journey/scene/lines";

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

  it("replaces each mesh under a group with its drawing, keeping position, rotation and scale", () => {
    const style = createStyle(PALETTE);
    const root = new Group();
    const child = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    child.position.set(1, 2, 3);
    child.rotation.set(0, Math.PI / 4, 0);
    child.scale.set(2, 2, 2);
    const wantQuaternion = child.quaternion.clone();
    root.add(child);

    drawHierarchy(root, style);

    expect(root.children).toHaveLength(1);
    const [drawing] = root.children;
    expect(drawing).toBeInstanceOf(Group);
    expect(drawing.position.toArray()).toEqual([1, 2, 3]);
    expect(drawing.scale.toArray()).toEqual([2, 2, 2]);
    expect(drawing.quaternion.equals(wantQuaternion)).toBe(true);
    if (!(drawing instanceof Group)) throw new Error("the drawing is not a group");
    const [fill, edges] = drawing.children;
    expect(fill).toBeInstanceOf(Mesh);
    expect(edges).toBeInstanceOf(LineSegments);
  });

  it("refuses to draw a mesh that has no parent, rather than silently dropping it", () => {
    const style = createStyle(PALETTE);
    const detached = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    const root = new Group();
    root.add(detached);
    root.remove(detached); // now parentless, as a bug in a builder might leave one
    expect(() => drawHierarchy(detached, style)).toThrow(/no parent/);
  });

  it("restyles its materials in place for another palette and weights, so a theme change needs no rebuild", () => {
    const style = createStyle(PALETTE);
    const line = style.line;
    const white = new Color(1, 1, 1);
    const steel = new Color(0.5, 0.6, 0.7);
    restyle(style, { ground: white, ink: white, steel, steelText: white }, NIGHT_OPACITY);
    expect(style.line).toBe(line);
    expect(style.fill.color.equals(white)).toBe(true);
    for (const m of [style.line, style.faint, style.near]) expect(m.color.equals(white)).toBe(true);
    expect([style.line.opacity, style.faint.opacity, style.near.opacity]).toEqual([0.74, 0.13, 0.4]);
    expect(style.accent.color.equals(steel)).toBe(true);
    expect(style.dim.color.equals(white)).toBe(true);
  });
});
