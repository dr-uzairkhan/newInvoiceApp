"use server";

import { revalidatePath } from "next/cache";
import { aiProviderSettingsService } from "@/services/aiProviderSettingsService";
import { aiProviderSettingSchema } from "@/lib/validation/aiProviderSettings";
import type { AiProviderName } from "@/lib/ai-providers/types";
import { requireRole } from "@/lib/authz";
import { ROLES } from "@/lib/permissions";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Revalidates every route, not just `/settings` — provider config may be
 * read server-side by any page that offers AI text help, and a settings
 * change must take effect on the very next
 * visit to any of them, per M16's core requirement.
 */
function revalidateEverywhere() {
  revalidatePath("/", "layout");
}

export async function updateProviderSettingAction(
  provider: AiProviderName,
  input: unknown,
): Promise<ActionResult<null>> {
  const check = await requireRole(ROLES.manageAiProviders);
  if (!check.ok) return { success: false, error: check.error };

  const parsed = aiProviderSettingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await aiProviderSettingsService.updateProviderSetting(provider, {
    apiKey: parsed.data.apiKey,
    models: parsed.data.models.map((m) => m.value),
    enabled: parsed.data.enabled,
  });
  revalidateEverywhere();
  return { success: true, data: null };
}

export async function moveProviderAction(
  provider: AiProviderName,
  direction: "up" | "down",
): Promise<ActionResult<null>> {
  const check = await requireRole(ROLES.manageAiProviders);
  if (!check.ok) return { success: false, error: check.error };

  await aiProviderSettingsService.moveProvider(provider, direction);
  revalidateEverywhere();
  return { success: true, data: null };
}
