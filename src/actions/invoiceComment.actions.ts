"use server";

import { revalidatePath } from "next/cache";
import {
  invoiceCommentService,
  InvoiceCommentNotFoundError,
  InvoiceCommentDeleteForbiddenError,
} from "@/services/invoiceCommentService";
import { InvoiceNotFoundError } from "@/services/invoiceService";
import { invoiceCommentSchema } from "@/lib/validation/invoiceComment";
import { requireSession } from "@/lib/authz";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

function friendlyErrorMessage(error: unknown): string {
  if (
    error instanceof InvoiceNotFoundError ||
    error instanceof InvoiceCommentNotFoundError ||
    error instanceof InvoiceCommentDeleteForbiddenError
  ) {
    return error.message;
  }
  console.error("Unexpected invoice comment action error:", error);
  return "Something went wrong. Please try again.";
}

/**
 * Comment counts show on every invoice list (Invoices page, project and
 * party tabs, Projects workspace) as well as the invoice's own Activity tab,
 * so the whole app layout is revalidated rather than enumerating paths.
 */
function revalidateCommentSurfaces(): void {
  revalidatePath("/", "layout");
}

export async function addInvoiceCommentAction(
  invoiceId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireSession();
  if (!check.ok) return { success: false, error: check.error };

  const parsed = invoiceCommentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const comment = await invoiceCommentService.add(
      invoiceId,
      parsed.data,
      check.session.user.id,
    );
    revalidateCommentSurfaces();
    return { success: true, data: { id: comment.id } };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error) };
  }
}

export async function deleteInvoiceCommentAction(
  commentId: string,
): Promise<ActionResult<null>> {
  const check = await requireSession();
  if (!check.ok) return { success: false, error: check.error };

  try {
    await invoiceCommentService.remove(commentId, {
      userId: check.session.user.id,
      role: check.session.user.role,
    });
    revalidateCommentSurfaces();
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error) };
  }
}
