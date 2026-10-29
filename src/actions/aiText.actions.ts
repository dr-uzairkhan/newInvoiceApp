"use server";

import { z } from "zod";
import { aiTextService, type ImproveTextField } from "@/services/aiTextService";
import { requireSession } from "@/lib/authz";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

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
