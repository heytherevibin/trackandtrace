import { messages } from "@/messages";
import { COLUMN_LINK, COLUMN_LIST } from "./footer-styles";
import { LANDING_SECTIONS } from "./nav-config";

/** The landing's section anchors, as plain links in the same form as the footer's other columns. */
export function FooterSections() {
  return (
    <ul aria-label={messages.shell.footer.sections} className={COLUMN_LIST}>
      {LANDING_SECTIONS.map(({ id, label }) => (
        <li key={id}>
          <a href={`#${id}`} className={COLUMN_LINK}>
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}
