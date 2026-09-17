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

export async function apiRequest<T>(
  input: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<ApiResult<T>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = init.signal ?? AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(input, { ...init, signal, headers: { Accept: "application/json", ...(init.headers ?? {}) } });
  } catch {
    return unavailable("The service could not be reached. No result was generated.");
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
