// Real IRCTC codes only. Labels live in the messages module. The pre-booking form offers a fixed subset;
// a reservation record may carry any code in domain.ts.

export const CLASS_VALUES = ["SL", "3A", "2A", "1A", "CC", "EC", "2S"] as const;
export const QUOTA_VALUES = ["GN", "PQWL", "RLWL", "TQWL", "LD", "TQ"] as const;

export type FormClass = (typeof CLASS_VALUES)[number];
export type FormQuota = (typeof QUOTA_VALUES)[number];
