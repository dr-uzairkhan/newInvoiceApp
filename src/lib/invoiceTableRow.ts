import type { InvoiceListItem } from "@/repositories/invoiceRepository";
import type { InvoiceStatus } from "@/generated/prisma/client";
import type { InvoiceCommentSummary } from "@/repositories/invoiceCommentRepository";

/**
 * Next.js Server→Client Component props must be plain-serializable — a
 * Prisma `Decimal` instance (Invoice.total/subtotal) is not, so the invoices
 * list page maps each row through this function before handing it to the
 * (client) InvoiceTable component, rather than passing `InvoiceListItem`
 * directly. Kept in a plain module (no "use client") since a Server
 * Component can't call a function exported from a client module.
 */
export type InvoiceTableRow = {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  total: string;
  currency: string;
  project: { id: string; name: string; client: { id: string; name: string } };
  /** Operational comments (§31) — count badge + newest body for the row's hover/dialog context. */
  commentCount: number;
  latestComment: string | null;
};

export function toInvoiceTableRow(
  invoice: InvoiceListItem,
  comments?: InvoiceCommentSummary,
): InvoiceTableRow {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    total: invoice.total.toString(),
    currency: invoice.currency,
    project: {
      id: invoice.project.id,
      name: invoice.project.name,
      client: {
        id: invoice.project.client.id,
        name: invoice.project.client.name,
      },
    },
    commentCount: comments?.count ?? 0,
    latestComment: comments?.latestBody ?? null,
  };
}
