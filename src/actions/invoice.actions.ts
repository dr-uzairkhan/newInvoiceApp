"use server";

import { revalidatePath } from "next/cache";
import {
  invoiceService,
  ProjectNotFoundError,
  InvoiceNotFoundError,
  InvoiceNotDraftError,
  DuplicateInvoiceNumberError,
  InvalidTransitionError,
  InvoiceSendValidationError,
} from "@/services/invoiceService";
import { invoiceSchema } from "@/lib/validation/invoice";
import type { InvoiceNumberPreview } from "@/services/invoiceService";
import type { InvoiceStatus } from "@/generated/prisma/client";
import { requireSession } from "@/lib/authz";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Any error not one of invoiceService's own named classes used to be
 * re-thrown here uncaught — which Next.js surfaces to the client as an
 * opaque "An unexpected response was received from the server," with no
 * detail on either side. Logging it and returning a generic message keeps
 * this consistent with every other action's `{ success, error }` shape
 * instead of crashing the request.
 */
function friendlyErrorMessage(error: unknown): string {
  if (
    error instanceof ProjectNotFoundError ||
    error instanceof InvoiceNotFoundError ||
    error instanceof InvoiceNotDraftError ||
    error instanceof DuplicateInvoiceNumberError ||
    error instanceof InvalidTransitionError ||
    error instanceof InvoiceSendValidationError
  ) {
    return error.message;
  }
  console.error("Unexpected invoice action error:", error);
  return "Something went wrong. Please try again.";
}

export async function createInvoiceDraftAction(
  projectId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireSession();
  if (!check.ok) return { success: false, error: check.error };

  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const invoice = await invoiceService.createDraft(
      projectId,
      parsed.data,
      check.session.user.id,
    );
    revalidatePath("/invoices");
    return { success: true, data: { id: invoice.id } };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error) };
  }
}

export async function updateInvoiceDraftAction(
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireSession();
  if (!check.ok) return { success: false, error: check.error };

  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const invoice = await invoiceService.updateDraft(id, parsed.data);
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    return { success: true, data: { id: invoice.id } };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error) };
  }
}

export async function transitionInvoiceStatusAction(
  id: string,
  target: InvoiceStatus,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireSession();
  if (!check.ok) return { success: false, error: check.error };

  try {
    const invoice = await invoiceService.transitionStatus(id, target);
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    return { success: true, data: { id: invoice.id } };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error) };
  }
}

export async function deleteInvoiceAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireSession();
  if (!check.ok) return { success: false, error: check.error };

  try {
    await invoiceService.delete(id);
    revalidatePath("/invoices");
    return { success: true, data: { id } };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error) };
  }
}

/**
 * Create form's live re-preview: the number pre-filled at page load was
 * computed for today's date, so when the admin changes the issue date
 * before touching the number, it is recomputed for that date — date tokens
 * and a month/year-scoped `{number}` both depend on it.
 */
export async function previewInvoiceNumberAction(
  projectId: string,
  issueDate: string,
): Promise<ActionResult<InvoiceNumberPreview>> {
  const check = await requireSession();
  if (!check.ok) return { success: false, error: check.error };

  try {
    const preview = await invoiceService.previewNextInvoiceNumber(
      projectId,
      issueDate,
    );
    return { success: true, data: preview };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error) };
  }
}
