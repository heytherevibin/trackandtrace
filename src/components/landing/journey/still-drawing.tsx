"use client";

import { useSyncExternalStore } from "react";
import { WIDE_QUERY, type StillKind } from "./still-shapes";
import { StillSvg } from "./still-svg";

// The still drawing of the train (spec §3.C–D; J4-4): the baked shapes, one <use> per part. Their files are fetched
// only when the page draws still (<html data-drawing="still">, or a journey that failed), and only the shape this
// width shows, so a live page never downloads them. React owns the hrefs; the journey only lights a part (data-hot)
// and places the holder (still.ts).

type Shown = "none" | "wide" | "tall";

function read(): Shown {
  const { dataset } = document.documentElement;
  if (dataset.drawing !== "still" && dataset.journey !== "failed") return "none";
  return window.matchMedia(WIDE_QUERY).matches ? "wide" : "tall";
}

function subscribe(change: () => void): () => void {
  const observer = new MutationObserver(change);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-drawing", "data-journey"] });
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener("change", change);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", change);
  };
}

const onServer = (): Shown => "none";

export function StillDrawing({ kind, className }: { readonly kind: StillKind; readonly className: string }) {
  const shown = useSyncExternalStore(subscribe, read, onServer);
  return (
    <div className={`still-drawing ${className}`} aria-hidden="true">
      <StillSvg kind={kind} wide drawn={shown === "wide"} />
      <StillSvg kind={kind} wide={false} drawn={shown === "tall"} />
    </div>
  );
}
