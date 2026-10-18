import { messages } from "@/messages";

/** The first stop for a keyboard: v4's yellow primary key, shown only while it has focus. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-skip rounded-control border-2 border-edge bg-accent px-4 py-2 font-structure text-sm font-bold text-on-fill no-underline shadow-control focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
    >
      {messages.common.skipToContent}
    </a>
  );
}
