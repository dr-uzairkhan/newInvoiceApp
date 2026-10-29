import { z } from "zod";
import { runWithFallback } from "@/lib/ai-providers/fallbackRunner";

/**
 * The one AI capability in the app (`Docs/implementation_decisions.md` §19):
 * rewrite a single piece of text the admin already typed, for them to
 * review. It never sees or touches any other field, never saves anything,
 * and a provider failure simply yields `null` (the button reports it and
 * the field is left as it was).
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

export const aiTextService = { improveText };
