import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

/* ------------------------------------------------------------------ */
/* In-house primitives — one grammar, no one-off overrides.             */
/* ------------------------------------------------------------------ */

type Variant = "primary" | "ghost" | "outline";
type Tone = "go" | "watch" | "stop" | "neutral";
type Size = "sm" | "md" | "lg";

const variantCls: Record<Variant, string> = {
  primary:
    "bg-bone text-ink-1 hover:bg-[#faf4e4] border border-transparent shadow-[0_12px_28px_-10px_rgba(236,228,210,0.4),0_4px_8px_-4px_rgba(236,228,210,0.15)]",
  ghost: "bg-transparent text-bone hover:bg-ink-3 border border-transparent",
  outline:
    "bg-transparent text-bone border border-(--line-2) hover:border-(--line-3) hover:bg-ink-2 shadow-[0_8px_20px_-12px_rgba(0,0,0,0.4)]",
};

const sizeCls: Record<Size, string> = {
  sm: "px-3.5 py-2 text-[12px]",
  md: "px-5 py-2.5 text-[13px]",
  lg: "px-6 py-3.5 text-[14px]",
};

export function Button({
  variant = "primary",
  tone = "neutral",
  size = "md",
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  tone?: Tone;
  size?: Size;
}) {
  const toneText =
    tone === "go"
      ? "text-go"
      : tone === "watch"
        ? "text-watch"
        : tone === "stop"
          ? "text-stop"
          : "";
  return (
    <button
      className={`btn-press group inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[0.02em] cursor-pointer select-none ${variantCls[variant]} ${sizeCls[size]} ${toneText} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Button-in-button trailing icon capsule (agency craft floor). */
export function ButtonIcon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex size-6 items-center justify-center rounded-full bg-black/10 text-current transition-transform duration-200 ease-out group-hover:translate-x-[2px] group-hover:scale-105">
      {children}
    </span>
  );
}

/** The world's arrow — thin, precise, single glyph used everywhere. */
export function ArrowIcon({
  dir = "right",
  size = 12,
  className = "",
}: {
  dir?: "right" | "left" | "up" | "down";
  size?: number;
  className?: string;
}) {
  const rotate =
    dir === "left"
      ? "rotate-180"
      : dir === "up"
        ? "-rotate-90"
        : dir === "down"
          ? "rotate-90"
          : "";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${rotate} ${className}`}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Small vertical label above a value — engraved plate convention. */
export function PlateLabel({
  children,
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`plate-label ${className}`} {...rest}>
      {children}
    </div>
  );
}

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
  size?: Size;
}

export function Chip({
  tone = "neutral",
  dot = false,
  size = "md",
  children,
  className = "",
  ...rest
}: ChipProps) {
  const tones: Record<Tone, string> = {
    go: "text-go border-go-t30 bg-go-t10",
    watch: "text-watch border-watch-t30 bg-watch-t10",
    stop: "text-stop border-stop-t30 bg-stop-t10",
    neutral: "text-steel-2 border-(--line-2) bg-ink-3",
  };
  const dotTones: Record<Tone, string> = {
    go: "bg-go",
    watch: "bg-watch",
    stop: "bg-stop",
    neutral: "bg-steel",
  };
  const sizeCls: Record<Size, string> = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-3 py-1 text-[11px]",
    lg: "px-3.5 py-1.5 text-[12px]",
  };
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border font-medium tracking-[0.08em] uppercase ${tones[tone]} ${sizeCls[size]} ${className}`}
      {...rest}
    >
      {dot && <span className={`led ${dotTones[tone]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Bezel card — outer shell + inner plate (double-bezel). */
export function Bezel({
  children,
  className = "",
  pad = true,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
  as?: "div" | "section" | "article" | "aside";
}) {
  return (
    <Tag className={`bezel ${pad ? "p-3 sm:p-3.5" : ""} ${className}`}>
      <div className="bezel-plate h-full w-full overflow-hidden">{children}</div>
    </Tag>
  );
}

/** Header row of an instrument panel. */
export function PanelHead({
  kicker,
  title,
  right,
}: {
  kicker: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-(--line) px-6 py-4 sm:px-8">
      <div>
        <PlateLabel>{kicker}</PlateLabel>
        <h2 className="mt-1.5 text-[16px] font-semibold tracking-[0.01em] text-bone">
          {title}
        </h2>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/** Standard page header — identical anatomy on every surface. */
export function PageHead({
  kicker,
  title,
  lead,
  right,
}: {
  kicker: string;
  title: string;
  lead?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="max-w-2xl">
        <PlateLabel>{kicker}</PlateLabel>
        <h1 className="mt-2 text-balance text-4xl font-[800] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
          {title}
        </h1>
        {lead && <p className="mt-5 text-[15.5px] leading-[1.7] text-steel-2">{lead}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function KeyValue({
  k,
  v,
  mono = true,
  className = "",
}: {
  k: string;
  v: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <PlateLabel>{k}</PlateLabel>
      <div
        className={`mt-1 truncate text-[13px] ${mono ? "font-data text-bone" : "text-bone/90"}`}
      >
        {v}
      </div>
    </div>
  );
}

/** Ruled column pair used on ticket plates. */
export function RuledRow({
  left,
  right,
  tone = "neutral",
}: {
  left: ReactNode;
  right: ReactNode;
  tone?: Tone;
}) {
  const tones: Record<Tone, string> = {
    go: "text-go",
    watch: "text-watch",
    stop: "text-stop-bright",
    neutral: "text-bone",
  };
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-(--line) py-2 last:border-b-0">
      <span className="min-w-0 text-[12px] text-steel-2">{left}</span>
      <span className={`font-data text-[13px] font-medium ${tones[tone]}`}>{right}</span>
    </div>
  );
}

/** Signal aspect lamps — GO / WATCH / STOP with the active one lit. */
export function AspectLamps({
  active,
  settled = true,
  size = "md",
}: {
  active: "go" | "watch" | "stop";
  settled?: boolean;
  size?: "sm" | "md";
}) {
  const lamps: { id: "go" | "watch" | "stop"; label: string; lit: string; off: string }[] = [
    { id: "go", label: "GO", lit: "bg-go shadow-[0_0_14px_2px_rgba(47,191,113,0.55)]", off: "bg-ink-4" },
    { id: "watch", label: "WATCH", lit: "bg-watch shadow-[0_0_14px_2px_rgba(242,169,59,0.5)]", off: "bg-ink-4" },
    { id: "stop", label: "STOP", lit: "bg-stop shadow-[0_0_14px_2px_rgba(229,72,77,0.55)]", off: "bg-ink-4" },
  ];
  const dot = size === "sm" ? "size-2" : "size-2.5";
  return (
    <div
      className="inline-flex items-center gap-3 rounded-full border border-(--line) bg-ink-1 px-3 py-1.5"
      role="img"
      aria-label={`Signal aspect: ${active.toUpperCase()}`}
    >
      {lamps.map((l) => (
        <span key={l.id} className="inline-flex items-center gap-1.5">
          <span
            className={`${dot} rounded-full transition-all duration-300 ${
              l.id === active ? `${l.lit} ${settled ? "" : "lamp-live"}` : l.off
            }`}
            aria-hidden="true"
          />
          <span
            className={`font-data text-[10px] tracking-[0.18em] ${
              l.id === active ? (active === "go" ? "text-go" : active === "watch" ? "text-watch" : "text-stop") : "text-steel/60"
            }`}
          >
            {l.label}
          </span>
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Select field — engraved control with a drawn chevron, used wherever  */
/* a dropdown belongs.                                                  */
/* ------------------------------------------------------------------ */

export function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <label>
      <PlateLabel>{label}</PlateLabel>
      <div className="relative mt-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="well w-full cursor-pointer appearance-none px-4 py-3 pr-9 font-data text-[13px] text-bone placeholder:text-steel/50 focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--steel)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </label>
  );
}