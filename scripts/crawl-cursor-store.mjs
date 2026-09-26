// Where the rolling cursor lives.
//
// It says how far each combo's four-day window has walked into the sixty-day horizon, and it is the
// one piece of crawler state that has to survive between runs. A file was enough while the crawler
// only ran from a working copy. It is not enough on a scheduled runner, which checks out fresh every
// time: with no cursor every run re-asks the same four days near today, and the horizon is never
// swept. The store this writes to is the same one the day gate and the breaker already share, so
// the cursor now outlives the machine that produced it.
//
// **The file stays the default.** A local run should be inspectable and should not reach for a
// network store to walk a route list; `scripts/crawl-cursor.json` is still read and written when
// there is no shared store configured, and `--cursor` still points at another path.

import { readFileSync, writeFileSync } from "node:fs";

/** Far longer than the sixty-day horizon it describes; see the note where it is used. */
const CURSOR_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Absent is the normal first run: every combo starts at today. Unreadable is not, and is refused. */
function readFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * A cursor store backed by the shared KV, or by a file when there is none.
 *
 * `kv` and `prefix` come from the app's own `publicStore()`, so the key sits beside the budget and
 * the breaker under the same environment prefix — a preview crawl can never move production's
 * sweep, and vice versa.
 */
export function createCursorStore({ kv, prefix, path }) {
  if (!kv) {
    return {
      where: path,
      async read() {
        return readFile(path);
      },
      async write(cursors) {
        writeFileSync(path, `${JSON.stringify(cursors, null, 2)}\n`);
      },
    };
  }
  const key = `${prefix}:crawl:cursor`;
  return {
    where: key,
    async read() {
      // A store that cannot be read is NOT an empty cursor. Returning null here would silently
      // restart every sweep at today and print "none yet" as though that were the first run — so
      // the error is thrown and the crawler refuses, exactly as it does for an unreadable file.
      return await kv.get(key);
    },
    async write(cursors) {
      // Ninety days, rewritten on every run, because `Kv.set` has no no-expiry option and inventing
      // one would change a seam the breaker and the budget also use.
      //
      // The TTL can therefore only be reached if the crawler has not run for ninety days — and a
      // sweep that has been still for three months SHOULD restart at today rather than resume into
      // a sixty-day horizon that has entirely moved past it.
      await kv.set(key, JSON.stringify(cursors), CURSOR_TTL_MS);
    },
  };
}
