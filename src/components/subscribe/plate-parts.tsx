// The small pieces both subscription pages draw inside the plate. They live here so the button's
// class string has one copy: two copies of it is how a transcription from the board drifts.

export const TEXT = "m-0 text-base text-ink-1/78";
export const NOTE = "mt-3 m-0 text-sm text-ink-1/70";

const BUTTON =
  "press relative inline-flex cursor-pointer select-none items-center justify-center gap-1.5 max-w-full shrink-0 whitespace-normal border font-display font-semibold no-underline disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 px-[12.24px] py-[6.8px] text-sm leading-[1.2] border-accent-strong bg-accent-strong text-accent-ink hover:bg-accent-strong-hover active:bg-accent-strong-active w-full mt-[6.8px] h-11";

/** A message the page states about itself: a result, a refusal, or a failure. */
export function Status({ children }: { readonly children: string }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <p className={TEXT}>{children}</p>
    </div>
  );
}

/** The plate's one full-width button. `busy` marks the press in flight without removing the button. */
export function Button({ label, busy }: { readonly label: string; readonly busy: boolean }) {
  return (
    <button type="submit" aria-busy={busy} className={BUTTON}>
      <span className="inline-flex items-center gap-1.5">{label}</span>
    </button>
  );
}
