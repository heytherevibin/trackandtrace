// How the crawler scripts import the app's own TypeScript. Split out of `crawl-availability.mjs`
// when gate C's wiring pushed that file towards 500 lines; it is one self-contained concern and
// nothing about it belongs beside the run's arithmetic.
//
// Nothing here touches a network, a database or a key.

import { statSync } from "node:fs";
import { registerHooks } from "node:module";

/**
 * Lets a script import the app's own TypeScript — the adapter, the recorder, the guard, the daily
 * budget — rather than growing a second copy of them that would drift. A second copy of the
 * breaker's key layout is exactly how a crawler would end up writing to the PNR fuse by accident.
 *
 * Node strips the types; these two rules are what tsconfig's `paths` and `moduleResolution: bundler`
 * do for the app, and nothing more.
 *
 * Node strips types rather than compiling them, so a TypeScript **parameter property**
 * (`constructor(private readonly x: T) {}`) is a syntax error it cannot get past — and it fails at
 * import, before a single request is spent. `MemoryCache`, `MemoryKv`, `EncryptedRedisCache` and
 * `SharedRateLimiter` therefore assign their fields explicitly. Keep it that way: the alternative is
 * this script carrying its own copy of the shared store's key names.
 *
 * @param {URL} srcRoot
 * @returns {void}
 */
export function registerAppImports(srcRoot) {
  const isFile = (url) => {
    try {
      return statSync(new URL(url)).isFile();
    } catch {
      return false;
    }
  };
  const resolveTs = (url) => [url, `${url}.ts`, `${url}/index.ts`].find(isFile) ?? url;

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@/")) return nextResolve(resolveTs(new URL(specifier.slice(2), srcRoot).href), context);
      const from = context.parentURL;
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && from?.endsWith(".ts")) return nextResolve(resolveTs(new URL(specifier, from).href), context);
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      return url.endsWith(".ts") ? nextLoad(url, { ...context, format: "module-typescript" }) : nextLoad(url, context);
    },
  });
}
