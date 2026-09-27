import { AdditiveBlending, CanvasTexture, Color, Sprite, SpriteMaterial, type Texture } from "three";
import type { Rig } from "./rig";

// Night's steel glow (spec §3.A; prototype v3's lines.js glow and rig.js sprites): one at the headlight, one where the
// raised pantograph's head meets the wire. Additive, and only at Night at full quality (J5-20). The live engine makes
// these; the bake never sees them.

/** A white radial fade: each stop is [offset, alpha]. An alpha mask only; the material's colour (a token's) tints it. */
export function radialTexture(stops: readonly (readonly [number, number])[]): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [offset, alpha] of stops) g.addColorStop(offset, `rgba(255,255,255,${alpha})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(canvas);
}

/** A soft white disc; the material's colour tints it. */
export function glowTexture(): Texture {
  return radialTexture([
    [0, 1],
    [0.18, 0.55],
    [1, 0],
  ]);
}

export interface Glow {
  /** `on`: Night at full quality. `headUp`: the pantograph is raised to the wire. */
  set(on: boolean, headUp: boolean): void;
  setColor(color: Color): void;
}

export function createGlow(rig: Rig, texture: Texture): Glow {
  const material = new SpriteMaterial({ map: texture, color: new Color(1, 1, 1), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
  const lamp = new Sprite(material);
  lamp.position.set(0.42, 3.93, 0);
  lamp.scale.set(2.6, 2.6, 1);
  rig.cabFront.add(lamp);
  const head = new Sprite(material);
  head.position.set(0, 0.08, 0);
  head.scale.set(1.6, 1.6, 1);
  head.visible = false;
  rig.pantoHead.add(head);
  return {
    set(on, headUp) {
      material.opacity = on ? 0.9 : 0;
      head.visible = headUp;
    },
    setColor(color) {
      material.color.copy(color);
    },
  };
}
