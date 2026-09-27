// A production build of this checkout, served on this machine with sample data and nothing live (J6-2): what the
// journey's nightly, its production-build smoke and its perf runs measure, never a deployment.
//   npm run build && npm run serve:local -- --port 4210        (check `lsof -nP -iTCP:4210 -sTCP:LISTEN` first)
// - PNR_SOURCE=fixture with LOCAL_FIXTURE=1: the one way env.ts lets a production build serve sample data. It refuses
//   the pair on Vercel and beside any live credential, so a deployment that carried it would fail at boot, not serve;
// - every live variable blanked, not merely unset: Next never overrides a variable that is set, so a stray .env.local
//   cannot fill one in (an empty value counts as unset in env.ts);
// - scripts/offline-guard.mjs preloaded into the server: any connection off this machine is refused before it is made,
//   and written to .offline-guard.log, which the production smoke and journey-perf.mjs read afterwards;
// - a working tree that holds any .env file but .env.example refused outright: Next inlines NEXT_PUBLIC_* values into
//   the build at `npm run build`, where blanking at serve time cannot reach, so a build made beside a .env.local would
//   ship live addresses (Supabase, Sentry) to the page. Build and serve only where there is none (this worktree, CI).
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
export const GUARD_LOG = join(ROOT, ".offline-guard.log");

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
 * The server's environment: sample data, nothing live, the guard preloaded. Pure, so a unit test reads it.
 * @param {Readonly<Record<string, string | undefined>>} base @param {number} port
 * @returns {Record<string, string>}
 */
export function localProductionEnv(base, port) {
  /** @type {Record<string, string>} */
  const kept = Object.fromEntries(Object.entries(base).filter((entry) => typeof entry[1] === "string"));
  const guard = `--import=${pathToFileURL(join(ROOT, "scripts/offline-guard.mjs")).href}`;
  return {
    ...kept,
    ...Object.fromEntries(LIVE_VARIABLES.map((name) => [name, ""])),
    NODE_ENV: "production",
    PNR_SOURCE: "fixture",
    PNR_FALLBACK: "none",
    LOCAL_FIXTURE: "1",
    E2E: "",
    NEXT_TELEMETRY_DISABLED: "1",
    OFFLINE_GUARD_LOG: GUARD_LOG,
    NODE_OPTIONS: [base.NODE_OPTIONS, guard].filter(Boolean).join(" "),
    PORT: String(port),
  };
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

/** Every connection the guard refused since the server started, one line each. */
export function refusals() {
  return existsSync(GUARD_LOG) ? readFileSync(GUARD_LOG, "utf8").split("\n").filter((line) => line !== "" && !line.startsWith("#")) : [];
}

/** @param {string} url */
const answers = (url) => fetch(url).then((r) => r.ok, () => false);

/**
 * Starts `next start` on the build in .next and resolves once it answers, with the guard proven loaded. Refuses a
 * working tree with a .env file (strayEnvFiles), a missing build, and a port another server already answers.
 * @param {{ port?: number }} [options]
 * @returns {Promise<{ url: string, stop: () => Promise<void> }>}
 */
export async function startLocalProduction({ port = 4210 } = {}) {
  const stray = strayEnvFiles(readdirSync(ROOT));
  if (stray.length) throw new Error(`refused: ${stray.join(", ")} in this working tree. Next inlines its NEXT_PUBLIC_* values into the build, so the page could reach a live service: build and serve from a working tree with no .env file (J6-2)`);
  if (!existsSync(join(ROOT, ".next/BUILD_ID"))) throw new Error("no production build here: run `npm run build` first");
  const url = `http://localhost:${port}/`;
  if (await answers(url)) throw new Error(`${url} already answers: another server holds port ${port} (lsof -nP -iTCP:${port} -sTCP:LISTEN)`);
  rmSync(GUARD_LOG, { force: true });
  const child = spawn(join(ROOT, "node_modules/.bin/next"), ["start", "--port", String(port)], { cwd: ROOT, env: localProductionEnv(process.env, port), stdio: ["ignore", "inherit", "inherit"] });
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf("--port");
  const port = at >= 0 ? Number(process.argv[at + 1]) : 4210;
  const server = await startLocalProduction({ port });
  console.log(`serving this checkout's production build at ${server.url}: sample data, nothing live (the guard logs to ${GUARD_LOG})`);
  const end = () => {
    void server.stop().then(() => {
      const refused = refusals();
      if (refused.length) console.error(refused.join("\n"));
      process.exit(refused.length ? 1 : 0);
    });
  };
  process.once("SIGINT", end);
  process.once("SIGTERM", end);
}
