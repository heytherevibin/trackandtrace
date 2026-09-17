// Small, safe wrapper over localStorage: private mode, quota errors, and
// corrupt JSON all degrade to "empty", never to a crash. Same-tab writes notify
// subscribers; cross-tab writes arrive through the storage event.

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

export function storageAvailable(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const probe = "__tt_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function readRaw(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: unknown): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
    notify(key);
    return true;
  } catch {
    return false;
  }
}

function notify(key: string): void {
  for (const fn of listeners.get(key) ?? []) fn();
}

export function subscribeKey(key: string, listener: Listener): () => void {
  const set = listeners.get(key) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(key, set);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === key) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    set.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}
