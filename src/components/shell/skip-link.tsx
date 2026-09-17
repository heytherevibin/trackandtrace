import { messages } from "@/messages";

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-skip rounded-md bg-accent px-4 py-2 font-label text-sm font-semibold uppercase tracking-wide text-accent-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
    >
      {messages.common.skipToContent}
    </a>
  );
}
