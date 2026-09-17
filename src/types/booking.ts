import type { BookingClass, Quota } from "./domain";

// Real IRCTC codes only. Labels live in the messages module.
export const CLASS_VALUES: readonly BookingClass[] = ["SL", "3A", "2A", "1A", "CC", "EC", "2S"];
export const QUOTA_VALUES: readonly Quota[] = ["GN", "PQWL", "RLWL", "TQWL", "LD", "TQ"];
