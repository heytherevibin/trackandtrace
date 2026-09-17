import type { ReactNode } from "react";

export function VisuallyHidden({ children, as: Tag = "span" }: { readonly children: ReactNode; readonly as?: "span" | "div" }) {
  return <Tag className="sr-only">{children}</Tag>;
}
