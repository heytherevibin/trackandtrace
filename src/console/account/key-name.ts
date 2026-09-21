/**
 * What `console.keys` itself allows: `check (char_length(name) between 1 and 60)`
 * (supabase/migrations/20260920090100_console_keys_sessions.sql).
 *
 * In a file of its own, with nothing behind it, because both name fields are `"use client"` and
 * `my-keys.ts` -- where this would otherwise sit -- reaches `next/headers` through
 * `@/console/auth/db`. The same reason `tapReason` lives in `keys/tap-schema.ts`.
 *
 * The two fields stop where the database stops, so a member never types a 61st character and never
 * meets zod's own wording for the refusal, which is not copy anyone wrote for them to read.
 */
export const KEY_NAME_MAX = 60;
