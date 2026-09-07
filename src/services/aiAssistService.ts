import type { ZodType } from "zod";
import { runWithFallback } from "@/lib/ai-providers/fallbackRunner";
import { toDateInputValue } from "@/lib/dates";
import {
  partySuggestionSchema,
  paymentMethodSuggestionSchema,
  invoiceAssistResponseSchema,
  invoiceNoteClassificationSchema,
  type PartySuggestion,
  type PaymentMethodSuggestion,
  type InvoiceAssistResponse,
} from "@/lib/validation/aiSuggestions";

export type AiFormType = "party" | "paymentMethod" | "invoice";

/** The two form types still served by the original single-shot, no-context path. */
type SingleShotFormType = "party" | "paymentMethod";

const JSON_ONLY_RULE =
  "Respond with ONLY a single raw JSON object — no markdown code fences, no prose before or after. " +
  "Omit any key you cannot confidently determine from the prompt; never invent placeholder values or guess.";

const SYSTEM_PROMPTS: Record<SingleShotFormType, string> = {
  party: `You fill in a "Party" form field (a contractor or client on an invoicing app) from a natural-language description.
${JSON_ONLY_RULE}
JSON shape (all keys optional):
{
  "name": string,
  "email": string,
  "type": "INDIVIDUAL" | "ORGANIZATION",
  "street1": string, "street2": string, "city": string, "state": string, "postalCode": string, "country": string
}`,
  paymentMethod: `You fill in a "Payment Method" form for a specific party on an invoicing app (the owning party is already fixed — never mention or infer one).
${JSON_ONLY_RULE}
JSON shape (all keys optional):
{
  "type": "BANK_WIRE" | "ZELLE" | "PAYONEER" | "CUSTOM",
  "label": string,
  "isDefault": boolean,
  "fields": [ { "key": string, "label": string, "value": string }, ... ]
}
"fields" is an ordered list of the actual payment instruction lines (e.g. account number, routing number, Zelle email) — key is a short machine-friendly id, label is the customer-facing name shown on invoices, value is the actual data.`,
};

export type AiSuggestion = PartySuggestion | PaymentMethodSuggestion;

/**
 * Every suggestion schema is a `.partial()` of a real form schema (see
 * aiSuggestions.ts), so each is individually a `ZodType<AiSuggestion>` by
 * structural widening — cast once here rather than fighting TypeScript's
 * generic inference over a Record-indexed union of distinct object shapes.
 */
const SCHEMAS: Record<SingleShotFormType, ZodType<AiSuggestion>> = {
  party: partySuggestionSchema as ZodType<AiSuggestion>,
  paymentMethod: paymentMethodSuggestionSchema as ZodType<AiSuggestion>,
};

/**
 * aiAssistService — walks the configured
 * provider/model fallback sequence, returns a partial, schema-validated
 * suggestion, or null if every provider failed/is unconfigured. Never
 * throws — the caller (the Server Action) always gets a clean result.
 * Party/Payment Method only — Invoice uses `runInvoicePrompt` below.
 */
async function runPrompt(
  formType: SingleShotFormType,
  promptText: string,
): Promise<AiSuggestion | null> {
  return runWithFallback({
    systemPrompt: SYSTEM_PROMPTS[formType],
    userPrompt: promptText,
    schema: SCHEMAS[formType],
  });
}

export type InvoiceAiContext = {
  project: {
    name: string;
    contractorName: string;
    clientName: string;
    preferredPaymentMethodLabel: string | null;
    /** M26 — the invoice's actual resolved currency (never assume USD). */
    currency: string;
    invoiceNumberFormat: string;
  };
  /** The invoice form's current field values (react-hook-form's getValues()) — whatever's already there, from Autofill or hand-typing. */
  currentValues: unknown;
};

/**
 * M18 (AI-assist context + clarification) — unlike
 * the single-shot party/paymentMethod path, the invoice prompt is rebuilt
 * per-call (today's real date + this project's fixed context + the form's
 * current values change every time) and its response is a discriminated
 * union: a confident suggestion, or a clarifying question when the model
 * can't proceed without an answer. The panel loops a clarifying question
 * back with the user's reply as a new `promptText` (the accumulated
 * transcript) — this function itself is still a single, stateless call.
 */
function buildInvoiceSystemPrompt(context: InvoiceAiContext): string {
  const today = toDateInputValue(new Date());
  const { currency } = context.project;
  return `You fill in an invoice's line items and dates on an invoicing app, using the fixed project context and the form's current values given below. The contractor, client, and payment method are already fixed by the project and must never appear in your output.

${JSON_ONLY_RULE}

Today's date is ${today} (YYYY-MM-DD). Resolve every relative date ("in 2 weeks", "next Monday", "this month") and every bare month/day date ("July 13") against this real date — never assume a different year, and never rely on any other notion of "today."

Respond with EXACTLY ONE of these two JSON shapes — no other top-level keys, no mixing the two, no markdown fences, no prose:

Shape A — a confident suggestion, with every extracted field nested inside "suggestion" exactly like this real example:
{
  "responseType": "suggestion",
  "suggestion": {
    "invoiceNumber": string,
    "issueDate": "YYYY-MM-DD",
    "dueDate": "YYYY-MM-DD",
    "convertedTotal": string (a plain decimal number, only if this project uses a converted total and the prompt gives one — omit entirely for a project whose invoices are already single-currency),
    "itemsNote": string (an optional note describing the line items as a whole, only if the prompt gives one),
    "bottomNote": string (a separate optional note shown near the bottom of the document, only if the prompt gives one),
    "items": [
      {
        "description": string,
        "isFlatAmount": boolean (true for a flat lump-sum item with no hours/rate; false, the default, for an hourly item),
        "quantity": string (plain decimal for an hourly item; "" — an empty string, the key must still be present — for a flat item),
        "unitPrice": string (plain decimal, in ${currency}, for an hourly item; "" for a flat item),
        "amount": string (plain decimal, in ${currency}, for a flat item; "" for an hourly item — its amount is always computed automatically from quantity × unitPrice, never guess a value here),
        "durationText": string (a short free-text label shown instead of hours/rate on a flat item, e.g. "Fixed", "50%", "2 weeks" — REQUIRED, non-empty, whenever isFlatAmount is true; "" for an hourly item)
      }
    ]
  }
}
Every key inside "suggestion" is optional at the top level — omit any you cannot confidently determine, never invent a placeholder. "suggestion" itself must still be present (use {} if nothing can be determined) and must always be a nested object, never flattened into the top level. This omit-if-unsure rule does NOT apply inside an "items" entry, though: if you include "items" at all, every entry in it must have all six keys present (description, isFlatAmount, quantity, unitPrice, amount, durationText) — never omit one, use an empty string "" for whichever of quantity/unitPrice/amount/durationText doesn't apply to that item's isFlatAmount. A flat item without a meaningful duration to name should get "durationText": "Fixed" rather than an empty string, since that key is required non-empty whenever isFlatAmount is true. Never include a seventh key ("isReferralCredit" or any other) on an item — that field is set only by the admin through a dedicated button, never by you.

Shape B — a single clarifying question, ONLY when something essential is missing or ambiguous and you genuinely cannot proceed without knowing it (e.g. the prompt names 3 line items but gives rates for only 2). Never ask about something you could reasonably omit instead — omitting a field from "suggestion" is always preferable to asking:
{ "responseType": "clarification", "question": "a single, specific question" }

Fixed project context (already fixed — never ask about or restate any of this):
- Project: ${context.project.name}
- Contractor: ${context.project.contractorName}
- Client: ${context.project.clientName}
- Preferred payment method: ${context.project.preferredPaymentMethodLabel ?? "none on file"}
- Currency: ${currency} — every line item quantity/unitPrice/amount you produce must be in this currency
- Invoice number format: ${context.project.invoiceNumberFormat}

Current form state (already filled in — whether from a prior Autofill or typed by hand; treat this as the starting point for a "same as this, but ..." request; only include a "suggestion" key for something you are adding or changing, never repeat an unchanged value):
${JSON.stringify(context.currentValues)}`;
}

async function runInvoicePrompt(params: {
  promptText: string;
  context: InvoiceAiContext;
}): Promise<InvoiceAssistResponse | null> {
  const response = await runWithFallback({
    systemPrompt: buildInvoiceSystemPrompt(params.context),
    userPrompt: params.promptText,
    schema: invoiceAssistResponseSchema,
  });

  // M35 — defense-in-depth: isReferralCredit is a real field on the shared
  // item schema (so the manual form can use it), which means the schema
  // above would otherwise accept a model-hallucinated `true` here. Forced
  // false unconditionally rather than trusting prompt wording alone.
  if (response?.responseType === "suggestion" && response.suggestion.items) {
    response.suggestion.items = response.suggestion.items.map((item) => ({
      ...item,
      isReferralCredit: false,
    }));
  }

  return response;
}

const NOTE_CLASSIFICATION_SYSTEM_PROMPT = `You look at the "Items note" field copied from a contractor's previous invoice on an invoicing app, while it's being carried over to a new invoice for the same project. This note sits below the invoice's line items, and is very often just a plain-English sentence stating the billing period the old invoice covered (e.g. "Covers services rendered Jul 1 – Jul 31, 2026." or similar phrasing that ONLY states a date range and nothing else) — the new invoice will cover a different period, so a note like that must not be copied over verbatim.

Decide whether the note ONLY states a period/date range with no other content, or whether it also says something else (extra description, conditions, a different subject entirely, or anything beyond just naming the dates it covers).

${JSON_ONLY_RULE}
JSON shape: { "isDefaultPeriodNote": boolean } — true if the note is purely a period/date-range statement with no other content; false if it says anything more or different, even alongside a period statement.`;

/**
 * Autofill-from-last-invoice's `itemsNote` carryover — see
 * `invoiceNoteClassificationSchema`. `null` (not `false`) on any provider
 * failure/unconfigured state, same "never throws, null means unknown" shape
 * as the rest of this module — the caller falls back to the safer default
 * (copy the note verbatim) when it can't confidently classify.
 */
async function classifyItemsNotePeriod(note: string): Promise<boolean | null> {
  const result = await runWithFallback({
    systemPrompt: NOTE_CLASSIFICATION_SYSTEM_PROMPT,
    userPrompt: note,
    schema: invoiceNoteClassificationSchema,
  });
  return result?.isDefaultPeriodNote ?? null;
}

export const aiAssistService = {
  runPrompt,
  runInvoicePrompt,
  classifyItemsNotePeriod,
};
