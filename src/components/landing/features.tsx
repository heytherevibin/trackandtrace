import Link from "next/link";
import { Plate } from "@/components/ui/plate";
import { messages } from "@/messages";
import { BODY, H3, SHEET_LINK, SectionKicker } from "./sheet-type";

const FEATURES = [
  { key: "watchlist", href: "/watchlist" },
  { key: "preBooking", href: "/pre-booking" },
  { key: "accuracy", href: "/accuracy" },
] as const;

/** 06 · More than a check: three feature plates, each opening its page. */
export function Features() {
  const m = messages.home.features;
  return (
    <section aria-label={m.kicker} className="section-pad">
      <SectionKicker rule="mb-8">{m.kicker}</SectionKicker>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-[clamp(28px,3vw,48px)]">
        {FEATURES.map(({ key, href }) => {
          const cell = m[key];
          return (
            <Plate key={key} as="article" padding="lg">
              <h3 className={H3}>{cell.title}</h3>
              <p className={`mt-3.5 ${BODY}`}>{cell.detail}</p>
              <p className="mt-4">
                <Link href={href} className={SHEET_LINK}>
                  {m.open(cell.title)}
                </Link>
              </p>
            </Plate>
          );
        })}
      </div>
    </section>
  );
}
