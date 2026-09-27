// The journey's chunk budgets (spec §3.H; J5-15), after `npm run build`:
// - the journey, at most 70 KB gzip and free of three.js: the chunk carrying the journey's mark and every chunk the
//   page's loader fetches with it (animejs and the lazy-loader stubs split out beside it), since a Motion-on page
//   downloads all of them before any drawing;
// - the scene, at most 240 KB gzip, downloaded only when the page may draw live: every chunk the scene's own loader
//   fetches (its mark, three.js), and any other chunk carrying three.js's own message text (it survives
//   minification). A chunk the journey and the scene share is fetched with the journey, so it counts there, once;
// - never the frame meter (`?journey-hud`, previews and development only; J5-10), found by its close button's label.
// Any other chunk the journey loads lazily fails the run: a split the budgets cannot place must be named, not skipped.
// The e2e "three.js never downloaded" specs are the guard that three.js stays behind the scene's door at runtime.
//   node scripts/journey-budgets.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const MARKS = { journey: "tt-journey-chunk", scene: "tt-scene-chunk", three: "THREE.WebGLRenderer", hud: "Close the frame meter" };
export const BUDGETS = { journey: 70 * 1024, scene: 240 * 1024 };

/** A lazy loader as Turbopack writes one: `Promise.all(["static/chunks/a.js", …].map(…))`. */
const LOADER = /Promise\.all\(\[([^\]]*)\]/g;
const PATH = /["']([^"']*\.js)["']/g;

/** @param {number} bytes */
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/** @param {string} text */
const gz = (text) => gzipSync(text).length;

/** @param {string} path */
const base = (path) => path.split("/").pop() ?? path;

/** @typedef {{ readonly name: string, readonly text: string }} Chunk */

/** Every lazy loader in a chunk, as the chunk files it fetches together. @param {Chunk} chunk @returns {string[][]} */
const loadersIn = (chunk) => [...chunk.text.matchAll(LOADER)].map((m) => [...(m[1] ?? "").matchAll(PATH)].map((p) => base(p[1] ?? ""))).filter((g) => g.length > 0);

/**
 * @param {readonly Chunk[]} chunks
 * @param {{ requireLoader?: boolean }} [options] requireLoader: a real build, where the journey chunk must be fetched by a
 *   loader the script can read (else a split beside it would go uncounted)
 */
export function measure(chunks, { requireLoader = false } = {}) {
  const byBase = new Map(chunks.map((c) => [base(c.name), c]));
  /** @type {string[]} */
  const failures = [];
  /** @param {readonly string[]} group @returns {Chunk[]} */
  const resolve = (group) =>
    group.flatMap((n) => {
      const c = byBase.get(n);
      if (!c && !failures.some((f) => f.startsWith(n))) failures.push(`${n} is loaded but not in the build`);
      return c ? [c] : [];
    });

  const marked = chunks.filter((c) => c.text.includes(MARKS.journey));
  const markedBases = new Set(marked.map((c) => base(c.name)));
  const withJourney = chunks.flatMap(loadersIn).filter((g) => g.some((n) => markedBases.has(n)));
  /** @type {Chunk[]} */
  const journey = [...new Set([...withJourney.flatMap(resolve), ...marked])];
  const inJourney = new Set(journey.map((c) => c.name));

  /** @type {Chunk[]} */
  const sceneLoaded = [];
  const seen = new Set(withJourney.map((g) => g.join()));
  /** @param {readonly Chunk[]} from @param {boolean} inScene */
  const follow = (from, inScene) => {
    for (const group of from.flatMap(loadersIn)) {
      if (seen.has(group.join())) continue;
      seen.add(group.join());
      const fetched = resolve(group);
      if (fetched.some((c) => c.text.includes(MARKS.hud))) continue;
      if (inScene || fetched.some((c) => c.text.includes(MARKS.scene))) {
        sceneLoaded.push(...fetched);
        follow(fetched, true);
        continue;
      }
      for (const c of fetched) if (!inJourney.has(c.name)) failures.push(`the journey loads ${c.name}, which no budget can place: mark it, or count it here`);
    }
  };
  follow(journey, false);

  const byMark = chunks.filter((c) => c.text.includes(MARKS.scene) || c.text.includes(MARKS.three));
  const scene = [...new Set([...sceneLoaded, ...byMark])].filter((c) => !inJourney.has(c.name));
  const journeyBytes = journey.reduce((n, c) => n + gz(c.text), 0);
  const sceneBytes = scene.reduce((n, c) => n + gz(c.text), 0);

  const leaks = journey.filter((c) => c.text.includes(MARKS.three)).map((c) => c.name);
  const head = [];
  if (leaks.length) head.push(`three.js is in the journey chunk (${leaks.join(", ")})`);
  if (!marked.length) head.push("no chunk carries the journey's mark");
  if (!scene.length) head.push("no chunk carries the scene");
  if (requireLoader && marked.length && !withJourney.length) head.push("no loader fetches the journey chunk, so what loads beside it cannot be counted");
  if (journeyBytes > BUDGETS.journey) head.push(`the journey chunk is ${kb(journeyBytes)}, over its 70 KB`);
  if (sceneBytes > BUDGETS.scene) head.push(`the scene is ${kb(sceneBytes)}, over its 240 KB`);
  return { journeyBytes, sceneBytes, journey: journey.map((c) => c.name), scene: scene.map((c) => c.name), failures: [...head, ...failures] };
}

/** @param {string} dir @returns {Chunk[]} */
function chunksIn(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return chunksIn(path);
    return entry.name.endsWith(".js") ? [{ name: path, text: readFileSync(path, "utf8") }] : [];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const dir = join(root, ".next/static/chunks");
  const r = measure(chunksIn(dir), { requireLoader: true });
  /** @param {readonly string[]} names */
  const list = (names) => names.map((n) => n.slice(dir.length + 1)).join(", ") || "none";
  console.log(`journey ${kb(r.journeyBytes)} gzip (budget 70 KB): ${list(r.journey)}`);
  console.log(`scene ${kb(r.sceneBytes)} gzip (budget 240 KB): ${list(r.scene)}`);
  for (const f of r.failures) console.error(`✗ ${f}`);
  process.exit(r.failures.length ? 1 : 0);
}
