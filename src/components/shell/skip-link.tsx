import { messages } from "@/messages";

export function SkipLink() {
  return (
    <a
      href="#main"
      className="caps sr-only z-skip border border-accent-strong bg-accent-strong px-4 py-2 text-label text-accent-ink no-underline focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
    >
      {messages.common.skipToContent}
    </a>
  );
}
