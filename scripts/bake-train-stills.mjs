// Bakes the drawn train's still drawings (spec §3.D). It bundles scripts/bake/page.ts with esbuild, runs it in
// headless Chromium with the GPU, and writes one SVG per shape to public/journey/ (named by content) and
// src/components/landing/journey/still-manifest.ts. Run it after changing any scene source (BAKE_SOURCES):
//   npm run bake:stills
// It runs on a developer's machine; CI only checks that the manifest matches today's sources (J4-10).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { SHAPES, contentHash, manifestSource, partsOf, shapeSvg, sourceHash } from "./bake/emit.mjs";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "public/journey");
const MANIFEST = join(ROOT, "src/components/landing/journey/still-manifest.ts");
// Real GPU rendering, so the depth test behaves as a reader's browser does.
const GPU = process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

const bundle = await build({
  entryPoints: [join(ROOT, "scripts/bake/page.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
  tsconfig: join(ROOT, "tsconfig.json"),
  logLevel: "warning",
});
const html = `<!doctype html><html><body><script type="module">${bundle.outputFiles[0].text}</script></body></html>`;

const browser = await chromium.launch({ args: GPU });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://bake.local/", (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto("http://bake.local/");
  await page.waitForFunction(() => typeof window.bake === "function", null, { timeout: 30_000 });
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const shapes = {};
  for (const [name, shape] of Object.entries(SHAPES)) {
    const t0 = Date.now();
    const result = await page.evaluate((config) => window.bake(config), { kind: shape.kind, W: shape.W, H: shape.H });
    const svg = shapeSvg(result.paths);
    const file = `${shape.file}.${contentHash(svg)}.svg`;
    writeFileSync(join(OUT, file), svg);
    shapes[name] = { href: `/journey/${file}`, viewBox: result.viewBox, parts: partsOf(result.paths), anchors: result.anchors };
    console.log(`${name}: ${result.segments} edges, ${result.runs} visible stretches, ${(svg.length / 1024).toFixed(0)} KB, ${(gzipSync(svg).length / 1024).toFixed(1)} KB gzip (${Date.now() - t0} ms)`);
  }
  if (errors.length) throw new Error(`the bake page failed: ${errors.join("; ")}`);
  writeFileSync(MANIFEST, manifestSource({ sourceHash: sourceHash(ROOT), shapes }));
} finally {
  await browser.close();
}
