import {
  invoiceCommentRepository,
  type InvoiceCommentSummary,
  type InvoiceCommentWithAuthor,
} from "@/repositories/invoiceCommentRepository";
import { invoiceRepository } from "@/repositories/invoiceRepository";
import { InvoiceNotFoundError } from "@/services/invoiceService";
import type { InvoiceCommentInput } from "@/lib/validation/invoiceComment";
import type { InvoiceComment, Role } from "@/generated/prisma/client";

export class InvoiceCommentNotFoundError extends Error {
  constructor() {
    super("That comment no longer exists.");
    this.name = "InvoiceCommentNotFoundError";
  }
}

export class InvoiceCommentDeleteForbiddenError extends Error {
  constructor() {
    super("Only the comment's author or an admin can delete it.");
    this.name = "InvoiceCommentDeleteForbiddenError";
  }
}

/** Who is acting — the signed-in user behind a Server Action (or, later, an API token). */
export type CommentActor = { userId: string; role: Role };

/**
 * Operational notes against an invoice (`Docs/implementation_decisions.md`
 * §31). Deliberately independent of the invoice lifecycle: a comment can be
 * added in any status, is never part of the document or the SENT snapshot,
 * and the invoice row itself is never touched (so `updatedAt`, which the
 * Activity tab reads as the last status change, stays meaningful).
 * Add + delete only, no edit — a log reads honestly when entries are
 * immutable; delete is limited to the author or an `ADMIN`.
 */
function listForInvoice(invoiceId: string): Promise<InvoiceCommentWithAuthor[]> {
  return invoiceCommentRepository.findByInvoice(invoiceId);
}

async function add(
  invoiceId: string,
  input: InvoiceCommentInput,
  authorUserId: string | null,
): Promise<InvoiceComment> {
  const invoice = await invoiceRepository.findById(invoiceId);
  if (!invoice) throw new InvoiceNotFoundError();
  return invoiceCommentRepository.create({
    invoiceId,
    authorUserId,
    body: input.body,
  });
}

async function remove(commentId: string, actor: CommentActor): Promise<void> {
  const comment = await invoiceCommentRepository.findById(commentId);
  if (!comment) throw new InvoiceCommentNotFoundError();
  if (!canDelete(comment, actor)) {
    throw new InvoiceCommentDeleteForbiddenError();
  }
  await invoiceCommentRepository.deleteById(commentId);
}

/** Pure — shared by `remove` and by the UI deciding whether to show a Delete button. */
function canDelete(
  comment: { authorUserId: string | null },
  actor: CommentActor | null,
): boolean {
  if (!actor) return false;
  return actor.role === "ADMIN" || comment.authorUserId === actor.userId;
}

function summarizeByInvoiceIds(
  invoiceIds: string[],
): Promise<Map<string, InvoiceCommentSummary>> {
  return invoiceCommentRepository.summarizeByInvoiceIds(invoiceIds);
}

export const invoiceCommentService = {
  listForInvoice,
  add,
  remove,
  canDelete,
  summarizeByInvoiceIds,
};
