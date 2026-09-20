"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Plate } from "@/components/ui/plate";
import { consoleHref } from "@/console/href";
import { addKey } from "@/console/keys/client";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.setup;

type Step = 1 | 2 | 3;
type Stage = { readonly kind: "idle"; readonly error: string | null } | { readonly kind: "adding" };

function stepFor(keyCount: number): Step {
  return keyCount >= 2 ? 3 : keyCount === 1 ? 2 : 1;
}

/**
 * Setup (Form TC-03), the First Owner entry only: two keys, then the console
 * (docs/design/sheets/console/ConsoleSetup.dc.html). The sheet's Invite states are drawn but
 * unreachable until Team (2d) can create one, so this only ever opens on step 1 or 2.
 */
export function SetupFlow({ keyCount }: { readonly keyCount: number }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(stepFor(keyCount));
  const [addedKeys, setAddedKeys] = useState<readonly string[]>([]);
  const [name, setName] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "idle", error: null });

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setStage({ kind: "adding" });
    const outcome = await addKey(trimmed);
    if (outcome.kind === "done") {
      setAddedKeys((current) => [...current, trimmed]);
      setName("");
      setStage({ kind: "idle", error: null });
      setStep(outcome.keyCount >= 2 ? 3 : 2);
      return;
    }
    setStage({ kind: "idle", error: outcome.kind === "failed" ? outcome.message : null });
  }

  const adding = stage.kind === "adding";
  const error = stage.kind === "idle" ? stage.error : null;
  const firstKey = addedKeys[0];
  const heading = step === 1 ? m.step1.heading : step === 2 ? m.step2.heading : m.step3.heading;
  const lead = step === 1 ? m.step1.lead : step === 2 ? m.step2.lead : null;
  const placeholder = step === 1 ? m.step1.namePlaceholder : m.step2.namePlaceholder;

  return (
    <>
      <p className="kicker mb-3">{m.stepLegend(step)}</p>
      <Plate
        title={heading}
        titleId="console-setup-plate"
        headingLevel={2}
        cells="tight"
        meta={[m.form]}
        stack={false}
        padding="none"
        bodyClassName="flex flex-col gap-4 px-4 py-5 sm:p-6"
      >
        {addedKeys.length > 0 ? (
          <ul className="flex flex-col border-b border-line">
            {addedKeys.map((keyName, index) => (
              <li key={`${keyName}-${index}`} className="flex items-center gap-2.5 border-t border-line py-2.5 text-sm">
                <span className="flex-1 font-medium">{keyName}</span>
                <span className="tag tag-outline">{m.added}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {step === 3 ? (
          <Button variant="primary" fullWidth className="max-sm:h-11" onClick={() => router.replace(consoleHref("/"))}>
            {m.open}
          </Button>
        ) : (
          <>
            {lead ? <p className="text-body text-ink-2">{lead}</p> : null}
            <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
              <Field invalid={error !== null}>
                <FieldLabel>{m.nameLabel}</FieldLabel>
                <Input
                  value={name}
                  disabled={adding}
                  onChange={(event) => setName(event.currentTarget.value)}
                  placeholder={placeholder}
                  size="sm"
                  className="text-sm max-sm:h-11 max-sm:text-base disabled:opacity-100"
                />
                {step === 2 && firstKey ? <FieldHint>{m.step2.legend(firstKey)}</FieldHint> : null}
                {error !== null ? (
                  <FieldError match role="alert">
                    {error}
                  </FieldError>
                ) : null}
              </Field>
              <Button type="submit" variant="primary" fullWidth className="max-sm:h-11" disabled={adding}>
                {adding ? m.touching : m.addKey}
              </Button>
            </form>
          </>
        )}
      </Plate>
    </>
  );
}
