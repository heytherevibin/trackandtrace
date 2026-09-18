import { Corners } from "@/components/ui/corners";
import { messages } from "@/messages";
import { PlatformDrawing } from "./platform-drawing";
import { BODY, H2, SectionKicker } from "./sheet-type";

/** 07 · Where it gets used: the copy beside a framed, duotoned 3:2 figure of a platform. */
export function PhotoSplit() {
  const m = messages.home.photo;
  return (
    <section aria-labelledby="photo-title" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-center gap-x-[clamp(24px,5vw,96px)] gap-y-6 pb-[72px] pt-12">
      <div className="min-w-0">
        <SectionKicker rule="mb-3">{m.kicker}</SectionKicker>
        <h2 id="photo-title" className={H2}>
          {m.title}
        </h2>
        <p className={`mt-5 max-w-[48ch] ${BODY}`}>{m.bodyOne}</p>
        <p className={`mt-4 max-w-[48ch] ${BODY}`}>{m.bodyTwo}</p>
      </div>
      <figure className="blueprint duotone relative m-0 overflow-visible">
        <PlatformDrawing className="block aspect-[3/2] w-full text-ink-1/70" />
        <Corners />
      </figure>
    </section>
  );
}
