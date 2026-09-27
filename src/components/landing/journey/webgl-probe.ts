// Whether this browser can draw the live train at all (spec §3.C, the webgl reason): a WebGL 2 context, handed
// straight back. Asked before anything is downloaded, so a page without WebGL never fetches three.js. No three here.

export function webgl2(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}
