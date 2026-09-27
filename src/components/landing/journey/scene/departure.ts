import { CanvasTexture, Float32BufferAttribute, Group, BufferGeometry, LineSegments, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type LineBasicMaterial, type Texture } from "three";
import { cssRgb, type Rgb } from "./palette";
import type { LineStyle } from "./lines";

// What the train passes as it leaves the drawing chapter (spec §3.A; prototype v3's scene/departure.js), at three
// depths so each passes at its own speed: masts and kilometre posts close on this side of the line (fast), a signal
// gantry spanning the line (the train's own pace), and Platform 3's end with its nameboard beyond it (slow). All
// hairlines, like the rest of the drawing; hidden until the train starts to pull away.

const GROUND_Y = -0.9;

export interface BoardFace {
  readonly texture: Texture;
  paint(ink: Rgb): void;
}
export interface Departure {
  readonly group: Group;
  setInk(ink: Rgb): void;
}

function segments(points: readonly number[], material: LineBasicMaterial): LineSegments {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(points, 3));
  const l = new LineSegments(geo, material);
  l.frustumCulled = false;
  return l;
}

/** A lattice mast: two uprights with zig-zag bracing, like the masts carrying the overhead line. */
function mast(pts: number[], x: number, z: number, h: number, w = 0.22): void {
  pts.push(x, GROUND_Y, z, x, h, z, x + w, GROUND_Y, z, x + w, h, z);
  let up = true;
  for (let y = GROUND_Y; y < h - 0.4; y += 0.55) {
    pts.push(x + (up ? 0 : w), y, z, x + (up ? w : 0), y + 0.55, z);
    up = !up;
  }
}

/** The nameboard's face: the platform's name in the page's own condensed capitals, repainted in the theme's ink. */
export function boardFace(words: { readonly platform: string; readonly departures: string }, family: string): BoardFace {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  let ink: Rgb = { r: 0, g: 0, b: 0 };
  const draw = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = cssRgb(ink);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 150px ${family}`;
    ctx.fillText(words.platform, 512, 118);
    ctx.font = `600 44px ${family}`;
    ctx.fillText(words.departures, 512, 214);
    texture.needsUpdate = true;
  };
  // painted again once the condensed face has arrived (spec §3.E)
  void document.fonts.load(`600 150px ${family}`).then(draw, () => undefined);
  return {
    texture,
    paint(next) {
      ink = next;
      draw();
    },
  };
}

export function buildDeparture(style: LineStyle, face: BoardFace): Departure {
  const group = new Group();
  group.name = "departure";
  group.visible = false;

  // Near: masts and kilometre posts on this side of the line.
  const near: number[] = [];
  for (let x = 24; x <= 420; x += 32) mast(near, x, 7.4, 7.8);
  for (let x = 40; x <= 420; x += 20) {
    near.push(x, GROUND_Y, 11.5, x, 0.5, 11.5, x - 0.35, 0.1, 11.5, x + 0.35, 0.1, 11.5, x - 0.35, 0.5, 11.5, x + 0.35, 0.5, 11.5);
    near.push(x - 0.35, 0.1, 11.5, x - 0.35, 0.5, 11.5, x + 0.35, 0.1, 11.5, x + 0.35, 0.5, 11.5);
  }
  group.add(segments(near, style.near));

  // Mid: a signal gantry across the line, its signal heads hanging over the track.
  const g: number[] = [];
  const gx = 78;
  for (const z of [-6.2, 9.4]) mast(g, gx, z, 7.6, 0.3);
  for (const y of [7.1, 7.6]) g.push(gx, y, -6.2, gx, y, 9.4, gx + 0.3, y, -6.2, gx + 0.3, y, 9.4);
  let flip = false;
  for (let z = -6.2; z < 9.4; z += 0.8) {
    g.push(gx, flip ? 7.1 : 7.6, z, gx, flip ? 7.6 : 7.1, z + 0.8);
    flip = !flip;
  }
  for (const z of [-0.5, 0.5]) {
    const top = 7.1;
    g.push(gx + 0.15, top, z, gx + 0.15, top - 0.6, z);
    const y0 = top - 0.6;
    const y1 = y0 - 1.5;
    g.push(gx - 0.1, y0, z - 0.3, gx - 0.1, y0, z + 0.3, gx - 0.1, y1, z - 0.3, gx - 0.1, y1, z + 0.3);
    g.push(gx - 0.1, y0, z - 0.3, gx - 0.1, y1, z - 0.3, gx - 0.1, y0, z + 0.3, gx - 0.1, y1, z + 0.3);
    for (let k = 0; k < 3; k++) {
      const cy = y0 - 0.3 - k * 0.45;
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        g.push(gx - 0.12, cy + Math.sin(a0) * 0.15, z + Math.cos(a0) * 0.15, gx - 0.12, cy + Math.sin(a1) * 0.15, z + Math.cos(a1) * 0.15);
      }
    }
  }
  group.add(segments(g, style.line));

  // Far: the end of Platform 3, its canopy, and the nameboard.
  const f: number[] = [];
  const x0 = 104;
  const x1 = 220;
  const edge = -7.2;
  const back = -12.5;
  const top = 0.84;
  f.push(x0, top, edge, x1, top, edge, x0, top - 0.2, edge, x1, top - 0.2, edge, x0, top, back, x1, top, back);
  f.push(x0, top, edge, x0 - 3.2, GROUND_Y, edge, x0, top, back, x0 - 3.2, GROUND_Y, back); // the ramp down at the platform's end
  for (let x = x0 + 12; x <= x1; x += 9) {
    f.push(x, top, -10, x, 4.6, -10);
    f.push(x - 4.5, 4.6, -7.8, x + 4.5, 4.6, -7.8);
  }
  f.push(x0 + 7.5, 4.6, -10, x1, 4.6, -10, x0 + 7.5, 4.9, -7.6, x1, 4.9, -7.6, x0 + 7.5, 5.1, -12.4, x1, 5.1, -12.4);
  const bx = x0 + 4;
  const bz = -8.6;
  for (const dx of [-2.3, 2.3]) f.push(bx + dx, top, bz, bx + dx, 3.9, bz);
  f.push(bx - 2.7, 2.5, bz, bx + 2.7, 2.5, bz, bx - 2.7, 3.9, bz, bx + 2.7, 3.9, bz, bx - 2.7, 2.5, bz, bx - 2.7, 3.9, bz, bx + 2.7, 2.5, bz, bx + 2.7, 3.9, bz);
  group.add(segments(f, style.line));

  const board = new Mesh(new PlaneGeometry(5.2, 1.3), new MeshBasicMaterial({ map: face.texture, transparent: true, depthWrite: false, fog: true }));
  board.position.set(bx, 3.2, bz + 0.02);
  group.add(board);
  return { group, setInk: (ink) => face.paint(ink) };
}
