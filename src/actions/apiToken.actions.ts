"use server";

import { revalidatePath } from "next/cache";
import {
  apiTokenService,
  ApiTokenNotFoundError,
} from "@/services/apiTokenService";
import { apiTokenSchema } from "@/lib/validation/apiToken";
import { requireRole } from "@/lib/authz";
import { ROLES } from "@/lib/permissions";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * The plaintext token is returned exactly once, here, for the admin to copy
 * into their MCP client; it is never stored and can never be shown again.
 */
export async function createApiTokenAction(
  input: unknown,
): Promise<ActionResult<{ id: string; plaintext: string }>> {
  const check = await requireRole(ROLES.manageApiTokens);
  if (!check.ok) return { success: false, error: check.error };

  const parsed = apiTokenSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { token, plaintext } = await apiTokenService.create(
    parsed.data,
    check.session.user.id,
  );
  revalidatePath("/settings/tokens");
  return { success: true, data: { id: token.id, plaintext } };
}

export async function revokeApiTokenAction(
  id: string,
): Promise<ActionResult<null>> {
  const check = await requireRole(ROLES.manageApiTokens);
  if (!check.ok) return { success: false, error: check.error };

  try {
    await apiTokenService.revoke(id);
  } catch (error) {
    if (error instanceof ApiTokenNotFoundError) {
      return { success: false, error: error.message };
    }
    console.error("Unexpected API token action error:", error);
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidatePath("/settings/tokens");
  return { success: true, data: null };
}
