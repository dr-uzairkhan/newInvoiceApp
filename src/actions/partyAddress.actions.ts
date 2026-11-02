"use server";

import { revalidatePath } from "next/cache";
import {
  partyAddressService,
  PartyAddressDeletionBlockedError,
} from "@/services/partyAddressService";
import { partyAddressSchema } from "@/lib/validation/partyAddress";
import { requireRole } from "@/lib/authz";
import { ROLES } from "@/lib/permissions";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/** Addresses are part of a party's master data — same gate as the party itself. */
export async function createPartyAddressAction(
  partyId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireRole(ROLES.writeParties);
  if (!check.ok) return { success: false, error: check.error };

  const parsed = partyAddressSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const address = await partyAddressService.create(partyId, parsed.data);
  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/parties");
  return { success: true, data: { id: address.id } };
}

export async function updatePartyAddressAction(
  id: string,
  partyId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireRole(ROLES.writeParties);
  if (!check.ok) return { success: false, error: check.error };

  const parsed = partyAddressSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const address = await partyAddressService.update(id, partyId, parsed.data);
  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/parties");
  return { success: true, data: { id: address.id } };
}

export async function deletePartyAddressAction(
  id: string,
  partyId: string,
): Promise<ActionResult<null>> {
  const check = await requireRole(ROLES.writeParties);
  if (!check.ok) return { success: false, error: check.error };

  try {
    await partyAddressService.delete(id);
  } catch (error) {
    if (error instanceof PartyAddressDeletionBlockedError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/parties");
  return { success: true, data: null };
}
