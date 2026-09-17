// Logging with PNR redaction. Ten-digit runs are masked before anything
// reaches the console, so passenger identifiers never land in server logs.

const TEN_DIGITS = /\d{10}/g;

export function redact(input: string): string {
  return input.replace(TEN_DIGITS, (run) => `${run.slice(0, 2)}••••••${run.slice(-2)}`);
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value instanceof Error) return { name: value.name, message: redact(value.message) };
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactValue(v)]));
  }
  return value;
}

type Level = "warn" | "error" | "info";

function write(level: Level, args: readonly unknown[]): void {
  const safe = args.map(redactValue);
  if (level === "error") console.error(...safe);
  else if (level === "warn") console.warn(...safe);
  else console.info(...safe);
}

export const log = {
  info: (...args: readonly unknown[]): void => write("info", args),
  warn: (...args: readonly unknown[]): void => write("warn", args),
  error: (...args: readonly unknown[]): void => write("error", args),
} as const;
