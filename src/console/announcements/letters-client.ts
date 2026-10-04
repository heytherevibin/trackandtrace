"use client";

import { z } from "zod";
import { consoleApiMessage } from "@/console/api-message";
import { apiRequest } from "@/services/api-client";

// Module 07's five network calls, kept out of the components so their tests mock functions rather
// than fetch — the same split abuse-client.ts and team-client.ts use.

export type Failed = { readonly kind: "failed"; readonly message: string };
export type Outcome = { readonly kind: "done" } | Failed;

const doneSchema = z.object({ ok: z.literal(true) }).strict();
const savedSchema = z.object({ ok: z.literal(true), id: z.string() }).strict();
const queuedSchema = z.object({ ok: z.literal(true), people: z.number() }).strict();

function post(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export async function requestSave(letter: { readonly id?: string; readonly list: string; readonly subject: string; readonly body: string }): Promise<{ readonly kind: "done"; readonly id: string } | Failed> {
  const result = await apiRequest("/api/announcements/save", post(letter), savedSchema);
  return result.ok ? { kind: "done", id: result.data.id } : { kind: "failed", message: consoleApiMessage(result.error) };
}

export async function requestTest(id: string): Promise<Outcome> {
  const result = await apiRequest("/api/announcements/test", post({ id }), doneSchema);
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}

export async function requestQueue(id: string): Promise<{ readonly kind: "done"; readonly people: number } | Failed> {
  const result = await apiRequest("/api/announcements/queue", post({ id }), queuedSchema);
  return result.ok ? { kind: "done", people: result.data.people } : { kind: "failed", message: consoleApiMessage(result.error) };
}

export async function requestStop(id: string): Promise<Outcome> {
  const result = await apiRequest("/api/announcements/stop", post({ id }), doneSchema);
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}

export async function requestDelete(id: string): Promise<Outcome> {
  const result = await apiRequest("/api/announcements/delete", post({ id }), doneSchema);
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}
