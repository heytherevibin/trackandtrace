import { z } from "zod";
import { bookingClassSchema, quotaSchema } from "@/types/schemas";

// One journey, asked about either one class or several.
//
// A union rather than two optional fields, so the handler narrows instead of asserting: past the
// parse, `travelClass` and `travelClasses` cannot both be present and cannot both be missing, and
// the compiler knows it. Neither present is not a question, and defaulting would pick a class for
// someone — spending a request on a berth they never said they wanted.
//
// `travelClasses` is what a row of the route list posts when it is opened: the classes the search
// named but did not ask.

const journey = {
  trainNo: z.string().regex(/^\d{5}$/),
  from: z.string().min(2).max(5),
  to: z.string().min(2).max(5),
  journeyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quota: quotaSchema,
};

const oneClass = z.object({ ...journey, travelClass: bookingClassSchema }).strict();

const manyClasses = z
  .object({
    ...journey,
    // Made a set at the boundary, before the cap: a repeat must not be a way past it, because the
    // cap is what bounds how many requests one expand can spend.
    travelClasses: z
      .array(bookingClassSchema)
      .min(1)
      .transform((list) => [...new Set(list)])
      .refine((list) => list.length <= 6, { message: "Ask for at most six classes at once." }),
  })
  .strict();

export const availabilityBodySchema = z.union([oneClass, manyClasses]);

export type AvailabilityBody = z.infer<typeof availabilityBodySchema>;
