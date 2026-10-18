// Type roles of the landing sheet, as Neubrutal v4 draws them. Plain strings: composed with template literals.

/** "02 · How it works": a Space Mono legend in the link blue. */
export const KICKER = "legend m-0 mb-3 block text-link";
/** A section's h2: Archivo Black caps, 24–40px, with the yellow hard shadow. */
export const H2 = "nb-section nb-shadow-yellow m-0";
/** A step's or a card's heading: Archivo Black 20/28. */
export const H3 = "m-0 text-xl leading-7";
/** Body copy beside a heading: 14/20 in ink-2. */
export const BODY = "text-sm leading-5 text-ink-2";
/** A section of the landing: 48px above, 64px below, ruled off with the 2px edge (24/32 on a phone). */
export const SECTION = "border-t-2 border-edge pb-16 pt-12 max-sm:pb-8 max-sm:pt-6";

export function SectionKicker({ children }: { readonly children: string }) {
  return <p className={KICKER}>{children}</p>;
}
