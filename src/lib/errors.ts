// One error taxonomy for every boundary. Sources, services and routes throw
// AppError; the API layer maps it to a stable JSON shape and HTTP status.

export type ErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UNAUTHENTICATED"
  | "SOURCE_UNAVAILABLE"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryAfter?: number;

  constructor(code: ErrorCode, message: string, opts: { status?: number; retryAfter?: number } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = opts.status ?? defaultStatus(code);
    this.retryAfter = opts.retryAfter;
  }
}

function defaultStatus(code: ErrorCode): number {
  switch (code) {
    case "INVALID_INPUT":
      return 400;
    case "NOT_FOUND":
      return 404;
    case "RATE_LIMITED":
      return 429;
    case "UNAUTHENTICATED":
      return 401;
    case "SOURCE_UNAVAILABLE":
      return 503;
    default:
      return 500;
  }
}

export interface ApiErrorBody {
  ok: false;
  code: ErrorCode;
  message: string;
  retryAfter?: number;
}

export function toApiError(err: unknown): ApiErrorBody {
  if (err instanceof AppError) {
    return { ok: false, code: err.code, message: err.message, retryAfter: err.retryAfter };
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  return { ok: false, code: "INTERNAL", message };
}

/** Map a source-outcome error code to the API taxonomy. */
export function fromSourceCode(
  code: "INVALID" | "NOT_FOUND" | "SOURCE_UNAVAILABLE" | "RATE_LIMITED",
  message: string
): AppError {
  switch (code) {
    case "INVALID":
      return new AppError("INVALID_INPUT", message);
    case "NOT_FOUND":
      return new AppError("NOT_FOUND", message);
    case "RATE_LIMITED":
      return new AppError("RATE_LIMITED", message);
    case "SOURCE_UNAVAILABLE":
      return new AppError("SOURCE_UNAVAILABLE", message);
  }
}