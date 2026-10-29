import { z } from "zod";

/**
 * An operational note on an invoice (`InvoiceComment`) — plain text, never
 * printed on the document. Shared by the composer, the row-menu dialog and
 * the server action so both sides validate identically.
 */
export const invoiceCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something first")
    .max(2000, "Keep a comment under 2000 characters"),
});

export type InvoiceCommentInput = z.infer<typeof invoiceCommentSchema>;
