import { z } from "zod";
import { runWithFallback } from "@/lib/ai-providers/fallbackRunner";
import { formatDisplayDate } from "@/lib/dates";

/**
 * The AI capability in the app (`Docs/implementation_decisions.md` §19):
 * rewrite a single piece of text the admin already typed, for them to
 * review. Two entry points, both field-level: "Improve" (grammar and
 * clarity, facts untouched) and the Autofill date refresh (only the dates in
 * a carried-over note change). Neither sees any other field or saves
 * anything, and a provider failure simply yields `null` (the caller falls
 * back to the text as it was).
 */
export type ImproveTextField = "itemDescription" | "itemsNote" | "bottomNote";

const FIELD_GUIDANCE: Record<ImproveTextField, string> = {
  itemDescription:
    "The text is a single invoice line-item description. Keep it to one line, no trailing period, suitable for a table cell.",
  itemsNote:
    "The text is a short note printed in italics under the invoice's line items, describing the work as a whole.",
  bottomNote:
    "The text is a short note printed near the bottom of the invoice (payment instructions, thanks, terms).",
};

/** `runWithFallback` is JSON-only, so the model is asked for a one-key object rather than bare text. */
export const improvedTextSchema = z.object({
  text: z.string().trim().min(1),
});

export function buildImproveTextSystemPrompt(field: ImproveTextField): string {
  return [
    "You are a careful copy editor for business invoice text.",
    "Improve the grammar, spelling, punctuation and clarity of the text the user provides.",
    "Keep the meaning, and keep every number, date, name, currency amount, code and reference exactly as written.",
    "Never add, remove or invent information. Keep it concise and in the same language as the input.",
    "Preserve line breaks that separate distinct points.",
    FIELD_GUIDANCE[field],
    'Respond with JSON only, in exactly this shape and nothing else: {"text": "<improved text>"}',
  ].join(" ");
}

async function improveText(
  text: string,
  field: ImproveTextField,
): Promise<string | null> {
  const original = text.trim();
  if (!original) return null;
  const result = await runWithFallback({
    systemPrompt: buildImproveTextSystemPrompt(field),
    userPrompt: original,
    schema: improvedTextSchema,
  });
  return result?.text ?? null;
}

/**
 * Autofill carries the previous invoice's items note forward. Where that
 * note narrates a billing period ("1st – 15th Oct", "May - June 2026",
 * "Covers services rendered …"), the dates belong to the old invoice, so
 * the model is asked to move them to this invoice's period and change
 * nothing else — the note's own wording and date format stay as the admin
 * wrote them. A note with no dates must come back unchanged.
 */
export function buildUpdateNoteDatesSystemPrompt(period: {
  start: Date;
  end: Date;
}): string {
  const start = formatDisplayDate(period.start);
  const end = formatDisplayDate(period.end);
  return [
    "You are a careful copy editor for business invoice text.",
    "The user provides a short note that was copied from a previous invoice and will be printed under the line items of a new invoice.",
    `The new invoice covers the billing period from ${start} to ${end}.`,
    "If the note mentions any dates, a date range, a month, or a billing period, update them so they describe the new billing period instead.",
    "Keep the note's wording, order, punctuation, line breaks and date format exactly as written (for example '1st – 15th Oct' stays in that style with the new dates).",
    "Change nothing except those dates. If the note contains no dates or periods, return it exactly as given.",
    "Never add, remove or invent information.",
    'Respond with JSON only, in exactly this shape and nothing else: {"text": "<updated note>"}',
  ].join(" ");
}

async function updateNoteDates(
  note: string,
  period: { start: Date; end: Date },
): Promise<string | null> {
  const original = note.trim();
  if (!original) return null;
  const result = await runWithFallback({
    systemPrompt: buildUpdateNoteDatesSystemPrompt(period),
    userPrompt: original,
    schema: improvedTextSchema,
  });
  return result?.text ?? null;
}

export const aiTextService = { improveText, updateNoteDates };
