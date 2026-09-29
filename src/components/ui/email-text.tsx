import { Fragment } from "react";
import { cn } from "@/utils/cn";

/**
 * An email address that wraps rather than being cut short. It may break after the @ and before each dot, as addresses
 * are set in print, and inside a word only as the last resort, when that word is wider than the whole line. The
 * breaks are <wbr>: nothing is added to the text, so it reads, copies and announces as the one address.
 */
export function EmailText({ email, className }: { readonly email: string; readonly className?: string }) {
  const parts = email.split(/(?<=@)|(?=\.)/);
  return (
    <span className={cn("wrap-break-word", className)}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? <wbr /> : null}
          {part}
        </Fragment>
      ))}
    </span>
  );
}
