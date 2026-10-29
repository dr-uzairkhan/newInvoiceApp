"use server";

import { revalidatePath } from "next/cache";
import {
  paymentMethodService,
  PaymentMethodDeletionBlockedError,
} from "@/services/paymentMethodService";
import { paymentMethodSchema } from "@/lib/validation/paymentMethod";
import { requireRole } from "@/lib/authz";
import { ROLES } from "@/lib/permissions";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createPaymentMethodAction(
  partyId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireRole(ROLES.writePaymentMethods);
  if (!check.ok) return { success: false, error: check.error };

  const parsed = paymentMethodSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const paymentMethod = await paymentMethodService.create(partyId, parsed.data);
  revalidatePath(`/parties/${partyId}`);
  return { success: true, data: { id: paymentMethod.id } };
}

export async function updatePaymentMethodAction(
  id: string,
  partyId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireRole(ROLES.writePaymentMethods);
  if (!check.ok) return { success: false, error: check.error };

  const parsed = paymentMethodSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const paymentMethod = await paymentMethodService.update(
    id,
    partyId,
    parsed.data,
  );
  revalidatePath(`/parties/${partyId}`);
  return { success: true, data: { id: paymentMethod.id } };
}

export async function deletePaymentMethodAction(
  id: string,
  partyId: string,
): Promise<ActionResult<null>> {
  const check = await requireRole(ROLES.writePaymentMethods);
  if (!check.ok) return { success: false, error: check.error };

  try {
    await paymentMethodService.delete(id);
  } catch (error) {
    if (error instanceof PaymentMethodDeletionBlockedError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePath(`/parties/${partyId}`);
  return { success: true, data: null };
}
