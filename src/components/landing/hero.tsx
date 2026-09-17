import { PnrCheckForm } from "@/components/pnr/pnr-check-form";
import { RecentChecks } from "@/components/pnr/recent-checks";
import { messages } from "@/messages";

/** Split hero: the pitch on the left, the compact instrument card on the right. Nothing animates in. */
export function Hero() {
  const m = messages.home.hero;
  return (
    <section className="mx-auto w-full max-w-page px-4 pb-16 pt-12 sm:px-6 sm:pt-16" aria-labelledby="hero-title">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)] lg:gap-16">
        <div className="max-w-prose">
          <h1 id="hero-title" className="text-3xl sm:text-4xl">
            {m.title}
          </h1>
          <p className="mt-4 text-lg text-ink-2">{m.lead}</p>
        </div>
        <div className="panel p-4 sm:p-6" data-testid="hero-instrument">
          <PnrCheckForm autoFocus compact />
        </div>
      </div>
      <RecentChecks />
    </section>
  );
}
