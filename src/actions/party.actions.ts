"use server";

import { revalidatePath } from "next/cache";
import {
  partyService,
  PartyDeletionBlockedError,
} from "@/services/partyService";
import { partySchema } from "@/lib/validation/party";
import { requireRole } from "@/lib/authz";
import { ROLES } from "@/lib/permissions";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createPartyAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireRole(ROLES.writeParties);
  if (!check.ok) return { success: false, error: check.error };

  const parsed = partySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const party = await partyService.create(parsed.data);
  revalidatePath("/parties");
  return { success: true, data: { id: party.id } };
}

export async function updatePartyAction(
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireRole(ROLES.writeParties);
  if (!check.ok) return { success: false, error: check.error };

  const parsed = partySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const party = await partyService.update(id, parsed.data);
  revalidatePath("/parties");
  revalidatePath(`/parties/${id}`);
  return { success: true, data: { id: party.id } };
}

export async function deletePartyAction(
  id: string,
): Promise<ActionResult<null>> {
  const check = await requireRole(ROLES.writeParties);
  if (!check.ok) return { success: false, error: check.error };

  try {
    await partyService.delete(id);
  } catch (error) {
    if (error instanceof PartyDeletionBlockedError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePath("/parties");
  return { success: true, data: null };
}
