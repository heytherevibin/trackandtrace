import { z } from "zod";
import { bookingClassSchema, quotaSchema } from "@/types/schemas";

/**
 * A search: two stations, a date, and the classes to lead with.
 *
 * The classes arrive as a list and are made a SET here, at the boundary, before the cap is
 * applied. A repeat must not be a way past the cap, because the cap is what bounds how many
 * requests one search can spend — and everything past this line trusts the list to be distinct.
 */
export const routeAvailabilityBodySchema = z
  .object({
    from: z.string().min(2).max(5),
    to: z.string().min(2).max(5),
    journeyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    quota: quotaSchema,
    classes: z
      .array(bookingClassSchema)
      .min(1)
      .transform((list) => [...new Set(list)])
      .refine((list) => list.length <= 7, { message: "Pick at most seven classes." }),
  })
  .strict();

export type RouteAvailabilityBody = z.infer<typeof routeAvailabilityBodySchema>;
