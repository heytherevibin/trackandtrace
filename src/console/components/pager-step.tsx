import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { Button, buttonClassName } from "@/components/ui/button";

/**
 * One step of a list's pager: Previous or Next. Nowhere to go is a disabled button, as the sheets
 * draw it, and not a link: a link must lead somewhere. 44px on a phone, as every control there is.
 *
 * Lifted out of the Leads plate when Accounts needed the same step, unchanged.
 */
export function PagerStep({ href, children }: { readonly href: Route | null; readonly children: ReactNode }) {
  if (href === null) {
    return (
      <Button size="sm" className="max-sm:h-11" disabled>
        {children}
      </Button>
    );
  }
  return (
    <Link href={href} prefetch={false} className={buttonClassName({ size: "sm", className: "max-sm:h-11" })}>
      {children}
    </Link>
  );
}
