// A production build of this checkout, served on this machine with sample data and nothing live (J6-2): what the
// journey's nightly, its production-build smoke and its perf runs measure, never a deployment.
//   npm run build:local                          builds, then stamps the build as its own
//   npm run serve:local -- --port 4210           serves it on 127.0.0.1 (check `lsof -nP -iTCP:4210 -sTCP:LISTEN` first)
// - the build is made here, not by `npm run build`: Next inlines NEXT_PUBLIC_* values into the page and bakes the
//   security policy from them at build time, and the Sentry plugin uploads with SENTRY_AUTH_TOKEN, where blanking at
//   serve time cannot reach. So the build's own environment has every live variable blanked too, and a working tree
//   that holds any .env file but .env.example is refused before it starts (Next would read the file into the build).
//   A finished build is stamped (.next/LOCAL_FIXTURE_BUILD holds its BUILD_ID); a build without that stamp, or one
//   `npm run build` has since replaced, is refused at serve time;
// - PNR_SOURCE=fixture with LOCAL_FIXTURE=1: the one way env.ts lets a production build serve sample data. It refuses
//   the pair on Vercel and beside any live credential, so a deployment that carried it would fail at boot, not serve;
// - every live variable blanked, not merely unset: Next never overrides a variable that is set, so a stray .env.local
//   cannot fill one in (an empty value counts as unset in env.ts);
// - scripts/offline-guard.mjs preloaded into the server: any connection off this machine is refused before it is made,
//   and written to .offline-guard.log, which the production smoke and journey-perf.mjs read afterwards;
// - the server listens on 127.0.0.1 only, so the sample-data server is not reachable from the local network.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const NEXT_DIR = join(ROOT, ".next");
export const GUARD_LOG = join(ROOT, ".offline-guard.log");
/** Beside .next/BUILD_ID: the BUILD_ID of the build this script made. */
export const BUILD_STAMP = "LOCAL_FIXTURE_BUILD";
const HOST = "127.0.0.1";

/** Every variable that could reach a live service, a live account or Vercel's own switches: blanked. */
export const LIVE_VARIABLES = [
  "RAILKIT_API_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "DATA_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "RESEND_API_KEY",
  "NEXT_PUBLIC_SENTRY_DSN",
  "SENTRY_DSN",
  "SENTRY_AUTH_TOKEN",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
];

/**
 * The build's environment: sample data and every live variable blanked, whatever the shell exports. No guard: the
 * build fetches its fonts. Pure, so a unit test reads it.
 * @param {Readonly<Record<string, string | undefined>>} base
 * @returns {Record<string, string>}
 */
export function localBuildEnv(base) {
  /** @type {Record<string, string>} */
  const kept = Object.fromEntries(Object.entries(base).filter((entry) => typeof entry[1] === "string"));
  return {
    ...kept,
    ...Object.fromEntries(LIVE_VARIABLES.map((name) => [name, ""])),
    NODE_ENV: "production",
    PNR_SOURCE: "fixture",
    PNR_FALLBACK: "none",
    LOCAL_FIXTURE: "1",
    E2E: "",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

/**
 * The server's environment: the build's, with the guard preloaded. Pure, so a unit test reads it.
 * @param {Readonly<Record<string, string | undefined>>} base @param {number} port
 * @returns {Record<string, string>}
 */
export function localProductionEnv(base, port) {
  const guard = `--import=${pathToFileURL(join(ROOT, "scripts/offline-guard.mjs")).href}`;
  return {
    ...localBuildEnv(base),
    OFFLINE_GUARD_LOG: GUARD_LOG,
    NODE_OPTIONS: [base.NODE_OPTIONS, guard].filter(Boolean).join(" "),
    PORT: String(port),
  };
}

/** `next start`'s arguments: on this machine's loopback only. @param {number} port */
export function serverArgs(port) {
  return ["start", "--port", String(port), "--hostname", HOST];
}

/**
 * The .env files in a working tree that Next would read into a build, baking their NEXT_PUBLIC_* values into the page:
 * every `.env*` but `.env.example`. Pure, so a unit test reads it.
 * @param {readonly string[]} names the working tree's root entries
 * @returns {string[]}
 */
export function strayEnvFiles(names) {
  return names.filter((name) => name.startsWith(".env") && name !== ".env.example").sort();
}

/**
 * Why the build in `dir` may not be served, or null: none there, or one this script did not make (no stamp, or a stamp
 * for another BUILD_ID, which `npm run build` leaves behind when it replaces the build).
 * @param {string} dir a .next directory
 * @returns {string | null}
 */
export function buildRefusal(dir) {
  const id = join(dir, "BUILD_ID");
  if (!existsSync(id)) return "no production build here: run `npm run build:local` first";
  const stamp = join(dir, BUILD_STAMP);
  if (existsSync(stamp) && readFileSync(stamp, "utf8").trim() === readFileSync(id, "utf8").trim()) return null;
  return "refused: this production build was not built by `npm run build:local`, so live values may be baked into it. Run `npm run build:local` (J6-2)";
}

/**
 * Every connection the guard refused since the server started, one line each. A missing log, or one without the
 * guard's first line, is no evidence either way: it throws rather than read as none.
 * @param {string} [log]
 * @returns {string[]}
 */
export function refusals(log = GUARD_LOG) {
  const lines = existsSync(log) ? readFileSync(log, "utf8").split("\n") : [];
  if (!lines.some((line) => line.startsWith("# offline guard on"))) throw new Error(`no evidence: ${log} is missing, or the offline guard never opened it`);
  return lines.filter((line) => line !== "" && !line.startsWith("#"));
}

/** Refuses a working tree that holds any .env file but .env.example (strayEnvFiles). */
function refuseStrayEnvFiles() {
  const stray = strayEnvFiles(readdirSync(ROOT));
  if (stray.length) throw new Error(`refused: ${stray.join(", ")} in this working tree. Next inlines its NEXT_PUBLIC_* values into the build, so the page could reach a live service: build and serve from a working tree with no .env file (J6-2)`);
}

/**
 * `next build` with every live variable blanked, in a working tree with no .env file, then stamps the build as this
 * script's (BUILD_STAMP), so startLocalProduction serves it and nothing else.
 * @returns {Promise<void>}
 */
export async function buildLocalProduction() {
  refuseStrayEnvFiles();
  rmSync(join(NEXT_DIR, BUILD_STAMP), { force: true });
  const child = spawn(join(ROOT, "node_modules/.bin/next"), ["build"], { cwd: ROOT, env: localBuildEnv(process.env), stdio: ["ignore", "inherit", "inherit"] });
  const code = await new Promise((resolve) => child.once("exit", resolve));
  if (code !== 0) throw new Error(`next build exited (${String(code)})`);
  writeFileSync(join(NEXT_DIR, BUILD_STAMP), readFileSync(join(NEXT_DIR, "BUILD_ID"), "utf8").trim());
}

/** @param {string} url */
const answers = (url) => fetch(url).then((r) => r.ok, () => false);

/**
 * Starts `next start` on the build in .next, on 127.0.0.1, and resolves once it answers, with the guard proven loaded.
 * Refuses a working tree with a .env file (strayEnvFiles), a build this script did not make (buildRefusal), and a port
 * another server already answers.
 * @param {{ port?: number }} [options]
 * @returns {Promise<{ url: string, stop: () => Promise<void> }>}
 */
export async function startLocalProduction({ port = 4210 } = {}) {
  refuseStrayEnvFiles();
  const refusal = buildRefusal(NEXT_DIR);
  if (refusal) throw new Error(refusal);
  const url = `http://${HOST}:${port}/`;
  if (await answers(url)) throw new Error(`${url} already answers: another server holds port ${port} (lsof -nP -iTCP:${port} -sTCP:LISTEN)`);
  rmSync(GUARD_LOG, { force: true });
  const child = spawn(join(ROOT, "node_modules/.bin/next"), serverArgs(port), { cwd: ROOT, env: localProductionEnv(process.env, port), stdio: ["ignore", "inherit", "inherit"] });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const stop = async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await exited;
  };
  const deadline = Date.now() + 60_000;
  while (!(await answers(url))) {
    if (child.exitCode !== null) throw new Error(`next start exited (${child.exitCode}) before it answered`);
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`${url} did not answer within 60 s`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!existsSync(GUARD_LOG) || !readFileSync(GUARD_LOG, "utf8").includes("# offline guard on")) {
    await stop();
    throw new Error("the offline guard did not load in the server: NODE_OPTIONS did not reach it");
  }
  return { url, stop };
}

/** `build` builds and stamps; anything else serves (`--port N`). */
async function main() {
  if (process.argv[2] === "build") {
    await buildLocalProduction();
    console.log("built this checkout for serve:local: sample data, every live variable blank, stamped");
    return;
  }
  const at = process.argv.indexOf("--port");
  const port = at >= 0 ? Number(process.argv[at + 1]) : 4210;
  const server = await startLocalProduction({ port });
  console.log(`serving this checkout's production build at ${server.url}: sample data, nothing live (the guard logs to ${GUARD_LOG})`);
  const end = () => {
    void server.stop().then(
      () => {
        const refused = refusals();
        if (refused.length) console.error(refused.join("\n"));
        process.exit(refused.length ? 1 : 0);
      },
    ).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
  };
  process.once("SIGINT", end);
  process.once("SIGTERM", end);
}

// No top-level await: the production smoke's teardown imports refusals() from this file, and a module with one cannot
// be loaded by require.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
