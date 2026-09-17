import { messages } from "@/messages";
import { LANDING_SECTIONS } from "./nav-config";

/** The landing's section anchors, moved from the masthead: icon beside a capital label, in steel. */
export function FooterSections() {
  return (
    <ul aria-label={messages.shell.footer.sections} className="mt-3.5 flex list-none flex-col gap-2.5 p-0">
      {LANDING_SECTIONS.map(({ id, label, Icon }) => (
        <li key={id}>
          <a href={`#${id}`} className="inline-flex items-center gap-1.5 font-display text-label font-semibold uppercase tracking-caps text-accent-text no-underline hover:text-accent-soft-ink">
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}
