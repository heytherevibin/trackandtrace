import type { ReactNode } from "react";
import { StateBlock } from "./state-block";

export function EmptyState({ title, detail, actions, className }: { readonly title: string; readonly detail?: ReactNode; readonly actions?: ReactNode; readonly className?: string }) {
  return <StateBlock tone="neutral" title={title} detail={detail} actions={actions} className={className} />;
}
