import { NativeSelect, type NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/utils/cn";

/**
 * A picker, with the sheet's own label beside it: the `.well.pick` of AuditLog.dc.html:116 and
 * ConsoleLeads.dc.html's filter bar. `""` is the first option, "All" or whatever the caller calls
 * it, and is never sent to the database as an empty string (each module's filters.ts sees to that).
 *
 * `stacked` is the same control where a 390px row has no space for a label beside a select: the
 * label goes above it and the select takes the width, at the 44px the phone sheets give every
 * control. Same label, same options, same `onPick`, so both widths write the same filter model
 * and the same address.
 *
 * Lifted out of the audit log's filter bar when Leads needed the same control, unchanged but for
 * `all`, which was that module's own word.
 */
export function Picker({
  label,
  value,
  options,
  all,
  onPick,
  stacked = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly NativeSelectOption[];
  /** What the empty choice is called: "All", "Any time". */
  readonly all: string;
  readonly onPick: (value: string) => void;
  readonly stacked?: boolean;
}) {
  return (
    <label className={cn("flex gap-2", stacked ? "flex-col" : "items-center")}>
      <span className="legend whitespace-nowrap text-ink-3">{label}</span>
      <NativeSelect
        size={stacked ? "lg" : "md"}
        className={stacked ? undefined : "w-auto min-w-[10ch]"}
        value={value}
        onChange={(event) => onPick(event.target.value)}
        options={[{ value: "", label: all }, ...options]}
      />
    </label>
  );
}
