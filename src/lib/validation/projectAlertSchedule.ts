import { z } from "zod";

/**
 * M29 — a day-of-month reminder for a Project. Flat schema, no
 * .partial()/superRefine() split: unlike invoice.ts's item schemas, this
 * entity has no partial variant to compose with.
 */
export const projectAlertScheduleSchema = z.object({
  dayOfMonth: z
    .number()
    .int()
    .min(1, "Pick a day between 1 and 31")
    .max(31, "Pick a day between 1 and 31"),
  recurring: z.boolean(),
  label: z.string().trim().optional().or(z.literal("")),
});

export type ProjectAlertScheduleInput = z.infer<
  typeof projectAlertScheduleSchema
>;
