"use server";

import { revalidatePath } from "next/cache";
import { PartyDeletionBlockedError } from "@/services/partyService";
import { partyService } from "@/services/partyService";
import { partyAddressService } from "@/services/partyAddressService";
import { partyCoreSchema, partySchema } from "@/lib/validation/party";
import { requireRole } from "@/lib/authz";
import { ROLES } from "@/lib/permissions";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * `defaultAddressId` is the id of the first address the create form may have
 * saved alongside the party — so an embedded caller (the project form's
 * inline "create new party") can show it in its address picker without a
 * refetch.
 */
export async function createPartyAction(
  input: unknown,
): Promise<ActionResult<{ id: string; defaultAddressId: string | null }>> {
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
  const addresses = await partyAddressService.listForParty(party.id);
  revalidatePath("/parties");
  return {
    success: true,
    data: {
      id: party.id,
      defaultAddressId: addresses.find((a) => a.isDefault)?.id ?? null,
    },
  };
}

export async function updatePartyAction(
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireRole(ROLES.writeParties);
  if (!check.ok) return { success: false, error: check.error };

  // Only the party's own fields — addresses have their own actions.
  const parsed = partyCoreSchema.safeParse(input);
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
