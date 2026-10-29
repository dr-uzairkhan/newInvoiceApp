import { defineTool, requireConfirm } from "@/mcp/core";
import {
  confirmSchema,
  idSchema,
  notFound,
  revalidateAfterWrite,
} from "@/mcp/tools/shared";
import { ROLES } from "@/lib/permissions";
import { invoiceCommentSchema } from "@/lib/validation/invoiceComment";
import { invoiceCommentService } from "@/services/invoiceCommentService";
import { invoiceService } from "@/services/invoiceService";

function commentView(comment: {
  id: string;
  invoiceId: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string | null; email: string } | null;
}) {
  return {
    id: comment.id,
    invoiceId: comment.invoiceId,
    body: comment.body,
    createdAt: comment.createdAt,
    author: comment.author
      ? { id: comment.author.id, name: comment.author.name ?? comment.author.email }
      : null,
  };
}

export const listInvoiceComments = defineTool({
  name: "list_invoice_comments",
  title: "List invoice comments",
  description:
    "The operational comments on an invoice (newest first) — notes like \"client confirmed receipt\". Comments are never printed on the invoice.",
  inputSchema: { invoiceId: idSchema },
  scope: "READ",
  annotations: { readOnlyHint: true },
  target: ({ invoiceId }) => ({ type: "invoice", id: invoiceId }),
  handler: async ({ invoiceId }) => {
    if (!(await invoiceService.getById(invoiceId))) notFound(`Invoice ${invoiceId}`);
    const comments = await invoiceCommentService.listForInvoice(invoiceId);
    return { comments: comments.map(commentView) };
  },
});

export const addInvoiceComment = defineTool({
  name: "add_invoice_comment",
  title: "Add invoice comment",
  description:
    "Records an operational note against an invoice, in any status (e.g. after marking it paid). Attributed to the token's owner. Never printed on the invoice.",
  inputSchema: { invoiceId: idSchema, body: invoiceCommentSchema.shape.body },
  scope: "WRITE",
  roles: ROLES.writeComments,
  target: ({ invoiceId }) => ({ type: "invoice", id: invoiceId }),
  handler: async ({ invoiceId, body }, ctx) => {
    const comment = await invoiceCommentService.add(
      invoiceId,
      invoiceCommentSchema.parse({ body }),
      ctx.principal.userId,
    );
    revalidateAfterWrite();
    const comments = await invoiceCommentService.listForInvoice(invoiceId);
    const created = comments.find((row) => row.id === comment.id);
    return { comment: created ? commentView(created) : { id: comment.id } };
  },
});

export const deleteInvoiceComment = defineTool({
  name: "delete_invoice_comment",
  title: "Delete invoice comment",
  description:
    "Deletes a comment. Allowed for the comment's author or an ADMIN. Irreversible — requires confirm: true.",
  inputSchema: { commentId: idSchema, confirm: confirmSchema },
  scope: "WRITE",
  roles: ROLES.writeComments,
  annotations: { destructiveHint: true },
  target: ({ commentId }) => ({ type: "invoiceComment", id: commentId }),
  handler: async ({ commentId, confirm }, ctx) => {
    requireConfirm(confirm, "Deleting a comment");
    await invoiceCommentService.remove(commentId, {
      userId: ctx.principal.userId,
      role: ctx.principal.role,
    });
    revalidateAfterWrite();
    return { deleted: true, commentId };
  },
});

export const COMMENT_TOOLS = [listInvoiceComments, addInvoiceComment, deleteInvoiceComment];
