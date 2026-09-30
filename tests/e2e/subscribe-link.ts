import { deriveDataKeys } from "@/services/data-key";
import { signUnsubscribe } from "@/services/subscriptions/links";

/**
 * An unsubscribe link the e2e server accepts. The server derives its key from the DATA_KEY that
 * playwright.config.ts sets (32 bytes of 7, a test key and never a real one); the runner derives the
 * same subkey here from the same value, rather than reading its own environment, which has none.
 */
const KEY = deriveDataKeys(Buffer.alloc(32, 7).toString("base64")).unsubscribe;
const PERSON = "8a1f2c3d-0000-4000-8000-000000000001";

const SIGNATURE = signUnsubscribe(KEY, PERSON, "news");

export const UNSUBSCRIBE = {
  /** Draws the Before state. */
  valid: `/unsubscribe?p=${PERSON}&l=news&s=${SIGNATURE}`,
} as const;
