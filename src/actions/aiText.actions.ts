"use server";

import { z } from "zod";
import { aiTextService, type ImproveTextField } from "@/services/aiTextService";
import { requireSession } from "@/lib/authz";

export type ActionResult<T> =
  { success: true; data: T } | { success: false; error: string };

const requestSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  field: z.enum(["itemDescription", "itemsNote", "bottomNote"]),
});

/**
 * The "Improve" button beside an invoice text field. Never throws to the
 * client — provider/parse failures are swallowed inside the fallback
 * runner; a `null` result just means "no suggestion available", reported
 * as a normal, non-blocking result so the field is left exactly as typed.
 */
export async function improveTextAction(
  text: string,
  field: ImproveTextField,
): Promise<ActionResult<{ text: string }>> {
  const check = await requireSession();
  if (!check.ok) return { success: false, error: check.error };

  const parsed = requestSchema.safeParse({ text, field });
  if (!parsed.success) {
    return { success: false, error: "Type something first." };
  }

  const improved = await aiTextService.improveText(
    parsed.data.text,
    parsed.data.field,
  );
  if (!improved) {
    return {
      success: false,
      error: "Couldn't improve the text right now — it was left as typed.",
    };
  }
  return { success: true, data: { text: improved } };
}

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const noteDatesRequestSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  periodStart: z.string().regex(DATE_INPUT_PATTERN),
  periodEnd: z.string().regex(DATE_INPUT_PATTERN),
});

/**
 * Autofill's note refresh: the previous invoice's items note with any dates
 * in it moved to this invoice's `periodStart`–`periodEnd`. Same contract as
 * `improveTextAction` — a failure is a normal, non-blocking result and the
 * form falls back to carrying the note over verbatim.
 */
export async function updateNoteDatesAction(
  text: string,
  periodStart: string,
  periodEnd: string,
): Promise<ActionResult<{ text: string }>> {
  const check = await requireSession();
  if (!check.ok) return { success: false, error: check.error };

  const parsed = noteDatesRequestSchema.safeParse({
    text,
    periodStart,
    periodEnd,
  });
  if (!parsed.success) {
    return { success: false, error: "Nothing to update." };
  }
  const start = new Date(parsed.data.periodStart);
  const end = new Date(parsed.data.periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { success: false, error: "Nothing to update." };
  }

  const updated = await aiTextService.updateNoteDates(parsed.data.text, {
    start,
    end,
  });
  if (!updated) {
    return {
      success: false,
      error: "Couldn't update the note's dates — it was copied as written.",
    };
  }
  return { success: true, data: { text: updated } };
}
