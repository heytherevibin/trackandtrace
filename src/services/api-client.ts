import type { z } from "zod";
import { apiErrorSchema } from "@/types/schemas";
import type { ApiErrorBody } from "./errors";

// Browser-side fetch wrapper. Every response is validated; a malformed body is
// an error, never data. Network failures and timeouts fail closed.

export type ApiResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ApiErrorBody };

export interface ApiRequestOptions {
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 8_000;

function unavailable(message: string): ApiResult<never> {
  return { ok: false, error: { ok: false, code: "SOURCE_UNAVAILABLE", message } };
}

function malformed(): ApiResult<never> {
  return { ok: false, error: { ok: false, code: "INTERNAL", message: "The service returned a malformed response." } };
}

interface CombinedSignal {
  readonly signal: AbortSignal;
  /** Releases whatever the fallback below scheduled. A no-op when the native combination handled it. */
  readonly settle: () => void;
}

/**
 * The request aborts when either the caller's own signal aborts or the deadline fires, never only
 * one or the other. `AbortSignal.any`/`.timeout` do this natively where both exist; some jsdom
 * builds in this repo may lack either static, so a small manual combination stands in for them.
 */
function combineWithDeadline(callerSignal: AbortSignal | null | undefined, timeoutMs: number): CombinedSignal {
  if (typeof AbortSignal.any === "function" && typeof AbortSignal.timeout === "function") {
    const deadline = AbortSignal.timeout(timeoutMs);
    return { signal: callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline, settle: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  callerSignal?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    settle: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onAbort);
    },
  };
}

export async function apiRequest<T>(
  input: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<ApiResult<T>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const combined = combineWithDeadline(init.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(input, { ...init, signal: combined.signal, headers: { Accept: "application/json", ...(init.headers ?? {}) } });
  } catch {
    return unavailable("The service could not be reached. No result was generated.");
  } finally {
    combined.settle();
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return malformed();
  }

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(body);
    if (parsedError.success) return { ok: false, error: parsedError.data };
    return malformed();
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return malformed();
  return { ok: true, data: parsed.data };
}
