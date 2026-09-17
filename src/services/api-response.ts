import { AppError, errorStatus, isApiErrorBody, toApiError, type ApiErrorBody, type ErrorCode } from "./errors";

const BASE_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function jsonOk(body: object, status = 200): Response {
  return Response.json(body, { status, headers: BASE_HEADERS });
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (isApiErrorBody(err)) {
    return new AppError(err.code, err.message, err.retryAfter === undefined ? {} : { retryAfter: err.retryAfter });
  }
  return new AppError("INTERNAL", err instanceof Error ? err.message : "Unexpected error");
}

/** One error shape and status for every route boundary. */
export function jsonError(err: unknown): Response {
  const appError = toAppError(err);
  const body: ApiErrorBody = toApiError(appError);
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (appError.retryAfter !== undefined) headers["Retry-After"] = String(appError.retryAfter);
  return Response.json(body, { status: errorStatus(appError), headers });
}

export type { ErrorCode };
