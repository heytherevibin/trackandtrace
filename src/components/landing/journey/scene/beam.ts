import { AdditiveBlending, Color, ConeGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils, type Texture } from "three";
import { radialTexture } from "./glow";
import type { Rig } from "./rig";

// Night (spec §3.A): the locomotive's headlight throws a soft steel beam along the track ahead, and lights a pool on
// the ballast where it lands (prototype v3's scene/beam.js). Additive and depth-tested (the drawing's own fills hide it
// behind solid parts), fading along its length and toward its rim, so it reads as light, not as a solid cone. The
// camera frames the locomotive, not its light: userData.noFit.

const LENGTH = 30;
const RADIUS = 3.4;

const vertex = /* glsl */ `
  varying float vAlong;
  varying float vRim;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vAlong = clamp(1.0 - position.x / ${LENGTH.toFixed(1)}, 0.0, 1.0); // 1 at the lens, 0 at the far end
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vRim = abs(dot(n, normalize(-mvPosition.xyz)));
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const fragment = /* glsl */ `
  uniform vec3 color;
  uniform float strength;
  varying float vAlong;
  varying float vRim;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    float along = pow(vAlong, 1.6);          // brightest at the lens, gone at the far end
    float body = smoothstep(0.0, 0.85, vRim); // soft toward the silhouette
    gl_FragColor = vec4(color * along * body * strength, 1.0);
    #include <fog_fragment>
  }
`;

/** A soft white pool for the ballast (glow.ts's radial fade, its own stops); the material's colour tints it. */
export function poolTexture(): Texture {
  return radialTexture([
    [0, 0.9],
    [0.45, 0.28],
    [1, 0],
  ]);
}

export interface Beam {
  readonly group: Group;
  /** On at Night at full quality, while the headlight is lit (the pantograph at the wire). */
  set(on: boolean, lit: number): void;
  setColor(color: Color): void;
}

export function createBeam(rig: Rig, pool: Texture): Beam {
  const group = new Group();
  group.name = "beam";
  group.visible = false;
  group.userData.noFit = true; // the camera frames the locomotive, not its light
  const cone = new ConeGeometry(RADIUS, LENGTH, 32, 1, true);
  // apex at the lens: the cone's tip sits at +y; turn it to point forward (+x) with the tip at the origin
  cone.translate(0, -LENGTH / 2, 0);
  cone.rotateZ(Math.PI / 2);
  const color = { value: new Color(1, 1, 1) };
  const strength = { value: 0.32 };
  const material = new ShaderMaterial({
    uniforms: { ...UniformsUtils.clone(UniformsLib.fog), color, strength },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: true,
  });
  const beam = new Mesh(cone, material);
  beam.position.copy(rig.headlight);
  beam.rotation.z = -0.045; // dipped toward the rails
  beam.renderOrder = 6;
  group.add(beam);

  const poolMaterial = new MeshBasicMaterial({ map: pool, color: new Color(1, 1, 1), transparent: true, opacity: 0.4, depthWrite: false, blending: AdditiveBlending, fog: true });
  const puddle = new Mesh(new PlaneGeometry(1, 1), poolMaterial);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(rig.headlight.x + 17, 0.02, 0);
  puddle.scale.set(18, 4.6, 1);
  puddle.renderOrder = 6;
  group.add(puddle);
  rig.cabFront.add(group);

  return {
    group,
    set(on, lit) {
      group.visible = on && lit > 0.01;
      strength.value = 0.32 * lit;
      poolMaterial.opacity = 0.4 * lit;
    },
    setColor(c) {
      color.value.copy(c);
      poolMaterial.color.copy(c);
    },
  };
}
