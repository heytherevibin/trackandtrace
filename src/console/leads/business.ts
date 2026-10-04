// What a business lead is made of, for both sides of the boundary: the browser draws it and the
// server validates it from this one file. Nothing here reaches the database or reads a header.

/** The pipeline's five stages, in the board's order. `console.business_leads.stage` holds these. */
export const BUSINESS_STAGES = ["new", "contacted", "qualified", "won", "lost"] as const;
export type BusinessStage = (typeof BUSINESS_STAGES)[number];

/** As typed. `console.business_text` holds a name or an organisation to 80 and the line about a lead to 120. */
export const BUSINESS_NAME_MAX = 80;
export const BUSINESS_ABOUT_MAX = 120;

/** A member who may own a lead: anyone who can open Leads. */
export interface BusinessMember {
  readonly id: string;
  readonly name: string;
}

/** An owner as a card draws them: the first letter of the first and the last name. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== "");
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since a lead entered its stage. Never below zero, whatever the two clocks say. */
export function daysInStage(since: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / DAY_MS));
}
