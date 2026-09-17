import { z } from "zod";

/** Ten digits, nothing else. Indian Railways PNRs are numeric; leading digits carry no rule we can verify. */
const PNR_PATTERN = /^\d{10}$/;

export const PNR_INVALID_MESSAGE = "Enter the 10-digit PNR printed on your ticket.";

/** Keep only digits and cap at ten characters. */
export function normalizePnr(input: string): string {
  return input.replace(/\D/g, "").slice(0, 10);
}

export function isValidPnr(value: string): boolean {
  return PNR_PATTERN.test(value);
}

/** Display grouping used on tickets and SMS: 3-3-4. Partial input keeps only the groups it has. */
export function formatPnr(value: string): string {
  const digits = normalizePnr(value);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter((group) => group.length > 0).join(" ");
}

/** Shared validation for route params, request bodies, and forms. */
export const pnrSchema = z.string().regex(PNR_PATTERN, PNR_INVALID_MESSAGE);
