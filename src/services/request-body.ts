import type { z } from "zod";
import { AppError } from "./errors";

/** Parse and validate a JSON request body, mapping any failure to INVALID_INPUT. */
export async function readBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("INVALID_INPUT", "The request body must be JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new AppError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request.");
  return parsed.data;
}
