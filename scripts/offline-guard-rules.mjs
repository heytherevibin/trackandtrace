// The offline guard's rules (scripts/offline-guard.mjs), pure so they are unit-tested without patching anything.

/**
 * A host on this machine: loopback by name or address, a *.localhost name, or none (a Unix socket, or Node's own
 * default of localhost).
 * @param {unknown} host
 */
export function isLoopback(host) {
  if (host === undefined || host === null || host === "") return true;
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "0:0:0:0:0:0:0:1" || /^127(\.\d{1,3}){3}$/.test(h);
}

/**
 * The host and port a `net.Socket#connect` call asks for, from each of its shapes: Node's own normalised
 * `[[options, cb]]`, `(options, cb)`, `(port, host)`, `(port)` and `(path)`.
 * @param {readonly unknown[]} args
 * @returns {{ host: string | undefined, port: unknown }}
 */
export function targetOf(args) {
  const [first, second] = args;
  if (Array.isArray(first)) return targetOf(first);
  if (first !== null && typeof first === "object") {
    const path = Reflect.get(first, "path");
    if (typeof path === "string") return { host: "", port: undefined };
    const host = Reflect.get(first, "host");
    return { host: typeof host === "string" ? host : undefined, port: Reflect.get(first, "port") };
  }
  if (typeof first === "string" && !/^\d+$/.test(first)) return { host: "", port: undefined };
  return { host: typeof second === "string" ? second : undefined, port: first };
}
