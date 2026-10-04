import { z } from "zod";
import type { ConsoleDb } from "@/console/auth/db";
import { BUSINESS_STAGES, type BusinessMember, type BusinessStage } from "@/console/leads/business";
import { businessShape, leadError, parsed, type LeadBusiness } from "@/console/leads/leads";

// The console's calls over the business pipeline (20261008090000_console_business_leads.sql), each
// through the member's own session: the database re-checks the Support floor, scrubs what was
// typed, and writes the audit row. None needs a key (the brief: "pipeline stage, assign … add a
// business lead: None (logged)").
//
// A database error THROWS, in the console's words (`leadError`).

const membersShape = z.array(z.object({ id: z.guid(), name: z.string().min(1) }));
// A card on the board: the lead's id, its MASKED address (anything else is refused, not drawn),
// its stage and when it entered it, its owner by name, and the line about it.
const cardShape = z.object({
  id: z.string().min(3),
  email: z.string().regex(/^.?•••@.+$/u),
  stage: z.enum(BUSINESS_STAGES),
  stageSince: z.iso.datetime({ offset: true }),
  ownerName: z.string().nullable(),
  about: z.string().min(1),
});
export type PipelineCard = z.infer<typeof cardShape>;

const addedShape = z.object({ id: z.string().min(3), added: z.boolean() });

/** What a member types about a lead. Empty strings are "not given": the database reads them as null. */
export interface BusinessDetails {
  readonly name: string;
  readonly organisation: string;
  readonly about: string;
  readonly owner: string;
}

/** Who may own a lead: every active member who can open Leads, by name. */
export async function readBusinessMembers(db: ConsoleDb): Promise<readonly BusinessMember[]> {
  const { data, error } = await db.rpc("console_business_members");
  if (error) throw leadError(error);
  return parsed(membersShape, data);
}

/**
 * Adds a lead by hand. An address that is already a lead is MARKED instead: the answer names the
 * lead either way and says which happened, so the page can open its record. The address goes to
 * the database and is never echoed back.
 */
export async function addBusinessLead(db: ConsoleDb, environment: string, input: BusinessDetails & { readonly email: string }): Promise<{ readonly id: string; readonly added: boolean }> {
  const { data, error } = await db.rpc("console_add_business_lead", {
    p_environment: environment,
    p_email: input.email,
    p_name: input.name,
    p_organisation: input.organisation,
    p_about: input.about,
    p_owner: input.owner,
  });
  if (error) throw leadError(error);
  return parsed(addedShape, data);
}

/** Puts a lead that is already in the list into the pipeline, at New. */
export async function markBusinessLead(db: ConsoleDb, environment: string, leadId: string, input: BusinessDetails): Promise<LeadBusiness> {
  const { data, error } = await db.rpc("console_mark_business_lead", {
    p_environment: environment,
    p_id: leadId,
    p_name: input.name,
    p_organisation: input.organisation,
    p_about: input.about,
    p_owner: input.owner,
  });
  if (error) throw leadError(error);
  return parsed(businessShape, data);
}

export async function moveBusinessLead(db: ConsoleDb, environment: string, leadId: string, stage: BusinessStage): Promise<LeadBusiness> {
  const { data, error } = await db.rpc("console_move_business_lead", { p_environment: environment, p_id: leadId, p_stage: stage });
  if (error) throw leadError(error);
  return parsed(businessShape, data);
}

export async function assignBusinessLead(db: ConsoleDb, environment: string, leadId: string, owner: string): Promise<LeadBusiness> {
  const { data, error } = await db.rpc("console_assign_business_lead", { p_environment: environment, p_id: leadId, p_owner: owner });
  if (error) throw leadError(error);
  return parsed(businessShape, data);
}

/** Takes a lead out of the pipeline. The lead stays. */
export async function unmarkBusinessLead(db: ConsoleDb, environment: string, leadId: string): Promise<void> {
  const { error } = await db.rpc("console_unmark_business_lead", { p_environment: environment, p_id: leadId });
  if (error) throw leadError(error);
}

/** The board: every lead in the pipeline as a card, in the board's order. Reading it records nothing. */
export async function readPipeline(db: ConsoleDb): Promise<readonly PipelineCard[]> {
  const { data, error } = await db.rpc("console_business_pipeline");
  if (error) throw leadError(error);
  return parsed(z.array(cardShape), data);
}
