"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/utils/cn";

// The one authored landing moment: sections below the fold rise into place as
// they enter. Content is visible in the server HTML; the hidden state is only
// applied by JavaScript to elements that are not yet on screen.

export function RevealOnView({ children, className, delay = 0 }: { readonly children: ReactNode; readonly className?: string; readonly delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) return;
    el.dataset.pending = "true";
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          delete el.dataset.pending;
          observer.disconnect();
        }
      },
      { rootMargin: "-40px", threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} data-reveal className={cn(className)} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}
