import { Color, DoubleSide, Float32BufferAttribute, Group, BufferGeometry, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Plane, PlaneGeometry, ShaderMaterial, Vector3 } from "three";
import type { LineStyle } from "./lines";
import type { Rig } from "./rig";

// The scan reveal (spec §3.A; prototype v3's scene/scan.js): the locomotive first stands as a solid steel form, and
// as the chapter begins a scan gate sweeps it nose to tail, leaving the hairline drawing behind. The solid is the
// drawing's own fill geometry, flat-shaded in steel and clipped to the side of the gate not yet scanned; it sits a
// hair in front of the drawing, so it hides the edges beneath it. Its colours are the palette's (J5-8).

const NOSE_X = 1.2;
const TAIL_X = -21.6;

const vertex = /* glsl */ `
  #include <common>
  #include <clipping_planes_pars_vertex>
  varying vec3 vViewPosition;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;
const fragment = /* glsl */ `
  #include <common>
  #include <clipping_planes_pars_fragment>
  uniform vec3 dark;
  uniform vec3 light;
  varying vec3 vViewPosition;
  void main() {
    #include <clipping_planes_fragment>
    vec3 n = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    float k = clamp(dot(n, normalize(vec3(-0.35, 0.85, 0.45))) * 0.5 + 0.5, 0.0, 1.0);
    gl_FragColor = vec4(mix(dark, light, k * k), 1.0);
  }
`;

export interface Scan {
  readonly group: Group;
  /** 0 = all solid, 1 = all drawn (the gate has passed the tail). */
  set(t: number): void;
  setColors(dark: Color, light: Color, gate: Color, night: boolean): void;
}

export function createScan(rig: Rig, style: LineStyle): Scan {
  const plane = new Plane(new Vector3(-1, 0, 0), NOSE_X); // keeps x ≤ the gate
  const dark = { value: new Color() };
  const light = { value: new Color() };
  const solid = new ShaderMaterial({ uniforms: { dark, light }, vertexShader: vertex, fragmentShader: fragment, clipping: true, clippingPlanes: [plane], polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const fills: Mesh[] = [];
  rig.loco.traverse((o) => {
    if (o instanceof Mesh && o.material === style.fill) fills.push(o);
  });
  const skins = fills.map((fill) => {
    const skin = new Mesh(fill.geometry, solid);
    skin.renderOrder = 3;
    skin.visible = false;
    fill.add(skin);
    return skin;
  });

  // The gate: a steel frame round the locomotive's section, with a faint light sheet inside it.
  const gate = new Group();
  gate.visible = false;
  const y0 = -0.35;
  const y1 = 4.95;
  const z = 2.15;
  const frame = new BufferGeometry();
  frame.setAttribute("position", new Float32BufferAttribute([0, y0, -z, 0, y1, -z, 0, y1, -z, 0, y1, z, 0, y1, z, 0, y0, z, 0, y0, z, 0, y0, -z, 0, y0 + 1.1, z + 0.35, 0, y0 + 1.1, z, 0, y1 - 1.1, z + 0.35, 0, y1 - 1.1, z], 3));
  const gateMat = new LineBasicMaterial({ color: new Color(), transparent: true, opacity: 0.95, depthTest: false });
  const lines = new LineSegments(frame, gateMat);
  lines.renderOrder = 7;
  const sheetMat = new MeshBasicMaterial({ color: new Color(), transparent: true, opacity: 0.07, depthWrite: false, side: DoubleSide });
  const sheet = new Mesh(new PlaneGeometry(2 * z, y1 - y0), sheetMat);
  sheet.rotation.y = Math.PI / 2;
  sheet.position.y = (y0 + y1) / 2;
  sheet.renderOrder = 7;
  gate.add(lines, sheet);
  rig.group.add(gate);

  let shown = false;
  return {
    group: gate,
    set(t) {
      const on = t < 0.999;
      if (on !== shown) {
        shown = on;
        for (const s of skins) s.visible = on;
      }
      const x = NOSE_X + (TAIL_X - NOSE_X) * Math.min(1, Math.max(0, t));
      plane.constant = x; // world x ≤ the gate stays solid (the rig stands at the origin while it scans)
      gate.position.x = x;
      gate.visible = t > 0.001 && on;
    },
    setColors(d, l, g, night) {
      dark.value.copy(d);
      light.value.copy(l);
      gateMat.color.copy(g);
      sheetMat.color.copy(g);
      sheetMat.opacity = night ? 0.1 : 0.07;
    },
  };
}
