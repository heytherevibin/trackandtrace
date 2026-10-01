"use client";

import { usePathname } from "next/navigation";
import { messages } from "@/messages";
import { COLUMN_LINK, COLUMN_LIST } from "./footer-styles";
import { LANDING_SECTIONS } from "./nav-config";

/**
 * The landing's section anchors, as plain links in the same form as the footer's other columns. On the landing they
 * are in-page links, exactly "#id", which is what the journey's own link handling matches; from every other page they
 * lead to the landing's section.
 */
export function FooterSections() {
  const prefix = usePathname() === "/" ? "" : "/";
  return (
    <ul aria-label={messages.shell.footer.sections} className={COLUMN_LIST}>
      {LANDING_SECTIONS.map(({ id, label }) => (
        <li key={id}>
          <a href={`${prefix}#${id}`} className={COLUMN_LINK}>
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}
