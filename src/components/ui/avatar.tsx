import Image from "next/image";
import { cn } from "@/utils/cn";

const SIZE = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" } as const;
const PX = { sm: 32, md: 40, lg: 56 } as const;

/** Initials on a key cap, or the account photo when one exists. */
export function Avatar({ name, src, size = "md", className }: { readonly name: string; readonly src?: string | null; readonly size?: keyof typeof SIZE; readonly className?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-key-cap font-label font-semibold text-key-cap-ink", SIZE[size], className)}>
      {src ? <Image src={src} alt="" width={PX[size]} height={PX[size]} className="size-full object-cover" referrerPolicy="no-referrer" /> : <span aria-hidden="true">{initial}</span>}
      <span className="sr-only">{name}</span>
    </span>
  );
}
