"use client";

import { z } from "zod";
import { consoleApiMessage } from "@/console/api-message";
import type { BusinessStage } from "@/console/leads/business";
import type { LeadBusiness, LeadNote, LeadRow } from "@/console/leads/leads";
import { apiRequest } from "@/services/api-client";

// Module 06's network calls, kept out of the components so their tests mock functions rather
// than fetch — the same split the other modules use.

export type Failed = { readonly kind: "failed"; readonly message: string };

// The row is checked on the server (leads.ts) before it is sent; here only its presence is.
const foundSchema = z.object({ ok: z.literal(true), lead: z.custom<LeadRow>((value) => typeof value === "object" && value !== null).nullable() }).strict();
const revealedSchema = z.object({ ok: z.literal(true), address: z.string() }).strict();
const addedSchema = z.object({ ok: z.literal(true), id: z.string().min(3), added: z.boolean() }).strict();
// The entry is checked on the server (leads.ts) before it is sent; here only that there is one.
const businessSchema = z.object({ ok: z.literal(true), business: z.custom<LeadBusiness>((value) => typeof value === "object" && value !== null) }).strict();
const doneSchema = z.object({ ok: z.literal(true) }).strict();
const exportSchema = z.object({ ok: z.literal(true), csv: z.string(), count: z.number().int().nonnegative(), fileName: z.string().regex(/^leads-\d{4}-\d{2}-\d{2}\.csv$/) }).strict();
const tagsSchema = z.object({ ok: z.literal(true), tags: z.array(z.string()) }).strict();
// The notes are checked on the server (leads.ts) before they are sent; here only that there is a list.
const notesSchema = z.object({ ok: z.literal(true), notes: z.custom<readonly LeadNote[]>((value) => Array.isArray(value)) }).strict();

function post(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

/** The address goes in the body, never in a URL. The answer is the masked row, or null. */
export async function requestFind(email: string): Promise<{ readonly kind: "done"; readonly lead: LeadRow | null } | Failed> {
  const result = await apiRequest("/api/leads/find", post({ email }), foundSchema);
  return result.ok ? { kind: "done", lead: result.data.lead } : { kind: "failed", message: consoleApiMessage(result.error) };
}

/** The address comes to the browser once, here, and the database has already recorded that it did. */
export async function requestReveal(id: string): Promise<{ readonly kind: "done"; readonly address: string } | Failed> {
  const result = await apiRequest("/api/leads/reveal", post({ id }), revealedSchema);
  return result.ok ? { kind: "done", address: result.data.address } : { kind: "failed", message: consoleApiMessage(result.error) };
}

/** Adds a tag, or removes one. The answer is the lead's tags as they now stand. */
export async function requestTag(id: string, tag: string, remove = false): Promise<{ readonly kind: "done"; readonly tags: readonly string[] } | Failed> {
  const result = await apiRequest(remove ? "/api/leads/untag" : "/api/leads/tag", post({ id, tag }), tagsSchema);
  return result.ok ? { kind: "done", tags: result.data.tags } : { kind: "failed", message: consoleApiMessage(result.error) };
}

/** Adds a note. The answer is the lead's notes as the database stored them, scrubbed. */
export async function requestNote(id: string, body: string): Promise<{ readonly kind: "done"; readonly notes: readonly LeadNote[] } | Failed> {
  const result = await apiRequest("/api/leads/note", post({ id, body }), notesSchema);
  return result.ok ? { kind: "done", notes: result.data.notes } : { kind: "failed", message: consoleApiMessage(result.error) };
}

/** Deletes a lead, after its tap. `value` and `reason` are the strings the tap was minted over. */
export async function requestDelete(id: string, value: string, reason: string): Promise<{ readonly kind: "done" } | Failed> {
  const result = await apiRequest("/api/leads/delete", post({ id, value, reason }), doneSchema);
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}

export interface PreparedLeadExport {
  readonly csv: string;
  readonly count: number;
  readonly fileName: string;
}

/** Prepares the export, after its tap. A whole list can take a moment: the timeout allows for it. */
export async function requestExport(filters: string, reason: string): Promise<{ readonly kind: "done"; readonly file: PreparedLeadExport } | Failed> {
  const result = await apiRequest("/api/leads/export", post({ filters, reason }), exportSchema, { timeoutMs: 30_000 });
  return result.ok ? { kind: "done", file: { csv: result.data.csv, count: result.data.count, fileName: result.data.fileName } } : { kind: "failed", message: consoleApiMessage(result.error) };
}

/** What the business lead form sends: empty strings for what was not given. */
export interface BusinessForm {
  readonly name: string;
  readonly organisation: string;
  readonly about: string;
  readonly owner: string;
}

type Entry = { readonly kind: "done"; readonly business: LeadBusiness } | Failed;

async function entry(path: string, body: unknown): Promise<Entry> {
  const result = await apiRequest(`/api/leads/business/${path}`, post(body), businessSchema);
  return result.ok ? { kind: "done", business: result.data.business } : { kind: "failed", message: consoleApiMessage(result.error) };
}

/** Adds a business lead by hand. The address goes in the body; the answer names the lead, never the address. */
export async function requestAddBusiness(email: string, form: BusinessForm): Promise<{ readonly kind: "done"; readonly id: string; readonly added: boolean } | Failed> {
  const result = await apiRequest("/api/leads/business/add", post({ email, ...form }), addedSchema);
  return result.ok ? { kind: "done", id: result.data.id, added: result.data.added } : { kind: "failed", message: consoleApiMessage(result.error) };
}

export const requestMarkBusiness = (id: string, form: BusinessForm): Promise<Entry> => entry("mark", { id, ...form });
export const requestMoveBusiness = (id: string, stage: BusinessStage): Promise<Entry> => entry("move", { id, stage });
export const requestAssignBusiness = (id: string, owner: string): Promise<Entry> => entry("assign", { id, owner });

export async function requestUnmarkBusiness(id: string): Promise<{ readonly kind: "done" } | Failed> {
  const result = await apiRequest("/api/leads/business/remove", post({ id }), doneSchema);
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}
