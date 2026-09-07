import { z } from "zod";

/** Up to 2 decimal places, matching Decimal(10,2)/Decimal(12,2) column precision. */
const DECIMAL_PATTERN = /^\d+(\.\d{1,2})?$/;

function isValidDecimal(value: string, allowZero: boolean): boolean {
  if (!DECIMAL_PATTERN.test(value)) return false;
  const num = Number(value);
  return allowZero ? num >= 0 : num > 0;
}

/**
 * Docs/mvp_user_stories.md Story 4.1/4.2 — description plus a per-item
 * Hourly/Flat toggle (M14, Docs/implementation_decisions.md §10):
 * Hourly requires quantity/unitPrice (amount is always backend-calculated
 * from them, never accepted from the client — Docs/product_spec.md §1.5);
 * Flat requires `amount` directly from the client instead (the one narrow,
 * deliberate exception to that rule) and leaves quantity/unitPrice blank.
 * `invoiceItemBaseSchema` is exported unrefined so aiSuggestions.ts can
 * `.partial()` it — `.partial()` doesn't compose with the `superRefine()`-
 * wrapped `invoiceItemSchema` below (a ZodEffects, not a ZodObject).
 */
export const invoiceItemBaseSchema = z.object({
  description: z.string().trim().min(1, "Description is required"),
  isFlatAmount: z.boolean(),
  /**
   * M35 — implies the same null-quantity/unitPrice, direct-`amount` shape as
   * `isFlatAmount` on its own. Optional (not `.default()`) so its zod input
   * and output types stay identical — a `.default()` here would give
   * `zodResolver` an input-shaped type that no longer matches `InvoiceInput`
   * (the schema's output type), which `useForm<InvoiceInput>` requires.
   * An AI-generated item, which never includes this key, still validates
   * fine as `undefined` — every read site treats that the same as `false`.
   */
  isReferralCredit: z.boolean().optional(),
  quantity: z.string().trim(),
  unitPrice: z.string().trim(),
  amount: z.string().trim(),
  /**
   * M48 — free-text label shown in the Duration column in place of
   * Unit(Hrs)/Rate for a Flat-amount row (e.g. "Fixed", "50%", "2 weeks").
   * Required only when `isFlatAmount` and not `isReferralCredit` (see
   * `invoiceItemSchema` below); plain string (not `.optional()`) for the
   * same `.partial()` composability reason as `quantity`/`unitPrice`/`amount`.
   */
  durationText: z.string().trim(),
});

export const invoiceItemSchema = invoiceItemBaseSchema.superRefine(
  (item, ctx) => {
    if (item.isReferralCredit) {
      if (!isValidDecimal(item.amount, true)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: "Amount must be zero or greater",
        });
      }
      return;
    }
    if (item.isFlatAmount) {
      if (!isValidDecimal(item.amount, true)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: "Amount must be zero or greater",
        });
      }
      if (!item.durationText) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["durationText"],
          message: "Duration is required",
        });
      }
      return;
    }
    if (!isValidDecimal(item.quantity, false)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantity"],
        message: "Quantity must be greater than 0",
      });
    }
    if (!isValidDecimal(item.unitPrice, true)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unitPrice"],
        message: "Unit price must be zero or greater",
      });
    }
  },
);

/**
 * Docs/mvp_user_stories.md Story 4.1 — invoiceNumber/issueDate/dueDate are
 * always required; convertedTotal is optional here regardless of the
 * project's DisplayCurrency (the "required before SEND if non-USD" rule is
 * Story 4.4's validateForSend, which is M6's job, not draft-save time).
 * At least one line item is required at this stage for UX (M5), even though
 * the backend-enforced "must have ≥1 item before send" gate is also M6.
 * `itemsNote`/`bottomNote` (M14) are both independently optional, plain
 * admin-authored content — not a snapshot of live external data.
 * `invoiceBaseSchema` is exported unrefined, same reason as
 * `invoiceItemBaseSchema` above, so aiSuggestions.ts can `.partial()` it.
 */
export const invoiceBaseSchema = z.object({
  invoiceNumber: z.string().trim().min(1, "Invoice number is required"),
  issueDate: z.string().trim().min(1, "Issue date is required"),
  dueDate: z.string().trim().min(1, "Due date is required"),
  /**
   * M39 — the billing period this invoice covers, independent of
   * issueDate/dueDate. Both optional (a flat one-off fee has no period) and
   * independently optional of each other at this layer — the "periodEnd
   * can't be before periodStart" ordering rule is enforced by
   * `invoiceSchema`'s `superRefine` below, not here, so `.partial()` (used
   * by aiSuggestions.ts) stays valid.
   */
  periodStart: z.string().trim().optional().or(z.literal("")),
  periodEnd: z.string().trim().optional().or(z.literal("")),
  convertedTotal: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || DECIMAL_PATTERN.test(value), {
      message: "Enter a valid amount",
    }),
  itemsNote: z.string().trim().optional().or(z.literal("")),
  bottomNote: z.string().trim().optional().or(z.literal("")),
  items: z.array(invoiceItemSchema).min(1, "Add at least one line item"),
});

export const invoiceSchema = invoiceBaseSchema.superRefine((data, ctx) => {
  // M35 — app-enforced only, no DB constraint (may be relaxed later).
  if (data.items.filter((item) => item.isReferralCredit).length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["items"],
      message: "Only one referral credit line item is allowed.",
    });
  }
  // M39 — only checked when both are actually set; either/both blank is fine.
  if (data.periodStart && data.periodEnd && data.periodEnd < data.periodStart) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["periodEnd"],
      message: "Period end must be on or after period start.",
    });
  }
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
