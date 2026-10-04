"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { notify } from "@/components/ui/toast";
import { BUSINESS_ABOUT_MAX, BUSINESS_NAME_MAX, type BusinessMember } from "@/console/leads/business";
import type { LeadBusiness } from "@/console/leads/leads";
import { requestAddBusiness, requestMarkBusiness, type BusinessForm } from "@/console/leads/leads-client";
import { businessAddBody, businessMarkBody } from "@/console/leads/routes";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.leads;
const b = m.business;

/** A page's address with one lead's record open over it: `/leads?news=pending` → `/leads?news=pending&lead=…`. */
export function leadRecordHref(page: Route, leadId: string): Route {
  return `${page}${page.includes("?") ? "&" : "?"}lead=${encodeURIComponent(leadId)}` as Route;
}

/** Whose lead the form is about: an address typed by hand, or a lead that is already in the list. */
export type BusinessFormMode = { readonly kind: "add" } | { readonly kind: "mark"; readonly id: string; readonly email: string };

type Done = { readonly kind: "added"; readonly id: string; readonly added: boolean } | { readonly kind: "marked"; readonly business: LeadBusiness };

/**
 * Form TC-09 (ConsoleLeads.dc.html, Add a business lead and Mark as a business enquiry): one form,
 * two openings. Adding by hand asks for an address; marking names the lead instead and asks for
 * the rest. Neither needs a key.
 *
 * WHAT IS TYPED IS CHECKED HERE FIRST, by the very shapes the routes use (routes.ts), so a refusal
 * is said in the form's own words before anything is sent: an added lead is written to the audit
 * log, and a typo should not be.
 *
 * The address of a lead added by hand goes out in the request and does not come back; the form
 * forgets it when it closes.
 */
function BusinessLeadForm({
  open,
  mode,
  members,
  me,
  onClose,
  onDone,
}: {
  readonly open: boolean;
  readonly mode: BusinessFormMode;
  /** Who may own a lead. */
  readonly members: readonly BusinessMember[];
  /** The signed-in member: the owner the form starts with, when they can be one. */
  readonly me: string;
  readonly onClose: () => void;
  readonly onDone: (done: Done) => void;
}) {
  const fallback = members.some((one) => one.id === me) ? me : (members[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [form, setForm] = useState<BusinessForm>({ name: "", organisation: "", about: "", owner: fallback });
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const ownerId = useId();

  // A form opened again starts empty: during render, as ConfirmItsYou resets its own stage.
  const [openSeen, setOpenSeen] = useState(open);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) {
      setEmail("");
      setForm({ name: "", organisation: "", about: "", owner: fallback });
      setProblem(null);
    }
  }

  const set = (field: keyof BusinessForm, value: string) => {
    setForm((before) => ({ ...before, [field]: value }));
    setProblem(null);
  };

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (sending) return;
    if (mode.kind === "add") {
      const body = businessAddBody.safeParse({ email, ...form });
      if (!body.success) {
        setProblem(body.error.issues[0]?.message ?? m.errors.notAddress);
        return;
      }
      setSending(true);
      const { email: address, ...rest } = body.data;
      const outcome = await requestAddBusiness(address, rest);
      setSending(false);
      if (outcome.kind === "failed") setProblem(outcome.message);
      else onDone({ kind: "added", id: outcome.id, added: outcome.added });
      return;
    }
    const body = businessMarkBody.safeParse({ id: mode.id, ...form });
    if (!body.success) {
      setProblem(body.error.issues[0]?.message ?? b.errors.aboutEmpty);
      return;
    }
    setSending(true);
    const { id, ...rest } = body.data;
    const outcome = await requestMarkBusiness(id, rest);
    setSending(false);
    if (outcome.kind === "failed") setProblem(outcome.message);
    else onDone({ kind: "marked", business: outcome.business });
  }

  const formId = useId();
  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        title={mode.kind === "add" ? b.add : b.markTitle}
        description={b.form}
        footer={
          <>
            <DialogClose render={<Button variant="secondary">{b.cancel}</Button>} />
            <Button type="submit" form={formId} variant="primary" loading={sending}>
              {mode.kind === "add" ? b.addAction : b.markAction}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
          {mode.kind === "add" ? (
            <Field>
              <FieldLabel>{b.email}</FieldLabel>
              {/* Not `type="email"`: the browser's own bubble would answer part of an address before this form can. */}
              <Input type="text" inputMode="email" autoComplete="off" spellCheck={false} maxLength={254} value={email} onChange={(event) => { setEmail(event.currentTarget.value); setProblem(null); }} />
            </Field>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="legend-md text-accent-text">{b.lead}</span>
              <span className="text-lg font-medium [overflow-wrap:anywhere]">{mode.email}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Field>
              <FieldLabel>{b.name}</FieldLabel>
              <Input autoComplete="off" maxLength={BUSINESS_NAME_MAX} value={form.name} onChange={(event) => set("name", event.currentTarget.value)} />
            </Field>
            <Field>
              <FieldLabel>{b.organisation}</FieldLabel>
              <Input autoComplete="off" maxLength={BUSINESS_NAME_MAX} value={form.organisation} onChange={(event) => set("organisation", event.currentTarget.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel>{b.about}</FieldLabel>
            <Input autoComplete="off" maxLength={BUSINESS_ABOUT_MAX} value={form.about} onChange={(event) => set("about", event.currentTarget.value)} />
            <FieldHint>{b.aboutHint}</FieldHint>
          </Field>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ownerId} className="legend-md text-accent-text">
              {b.owner}
            </label>
            <NativeSelect id={ownerId} className="w-60 max-w-full" value={form.owner} onChange={(event) => set("owner", event.target.value)} options={members.map((one) => ({ value: one.id, label: one.name }))} />
          </div>
          <p className="text-ink-2 text-label">{mode.kind === "add" ? b.addLegend : b.markLegend}</p>
          {/* Outside any one field: a refusal may be about the address, the line, or the owner. */}
          {problem !== null ? (
            <p role="alert" className="text-label text-ink-alert font-medium">
              {problem}
            </p>
          ) : null}
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

/**
 * The page header's "Add a business lead", and its form. On success it opens the lead's record
 * over the page the member is on: the lead's id is added to that page's address (`page`), and the
 * typed email never is. An address that was already a lead is said to be, and that lead is the one
 * opened.
 *
 * `page` is an address and not a function that makes one, because a server page hands it across
 * the client boundary and only data crosses.
 */
export function AddBusinessLead({ members, me, page }: { readonly members: readonly BusinessMember[]; readonly me: string; readonly page: Route }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{b.add}</Button>
      <BusinessLeadForm
        open={open}
        mode={{ kind: "add" }}
        members={members}
        me={me}
        onClose={() => setOpen(false)}
        onDone={(done) => {
          setOpen(false);
          if (done.kind !== "added") return;
          notify.success(done.added ? b.added : b.existing);
          router.push(leadRecordHref(page, done.id));
          router.refresh();
        }}
      />
    </>
  );
}

/** The record's "Mark as a business enquiry", and the same form with the lead named in place of an email. */
export function MarkBusinessLead({
  lead,
  members,
  me,
  onMarked,
}: {
  readonly lead: { readonly id: string; readonly email: string };
  readonly members: readonly BusinessMember[];
  readonly me: string;
  readonly onMarked: (business: LeadBusiness) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{b.markAction}</Button>
      <BusinessLeadForm
        open={open}
        mode={{ kind: "mark", id: lead.id, email: lead.email }}
        members={members}
        me={me}
        onClose={() => setOpen(false)}
        onDone={(done) => {
          setOpen(false);
          if (done.kind !== "marked") return;
          notify.success(b.marked);
          onMarked(done.business);
        }}
      />
    </>
  );
}
