import type { InvoiceListItem } from "@/repositories/invoiceRepository";
import { invoiceCommentService } from "@/services/invoiceCommentService";
import { toInvoiceTableRow, type InvoiceTableRow } from "@/lib/invoiceTableRow";

/**
 * Server-side counterpart of `toInvoiceTableRow` for a whole list: one
 * comment rollup query for every row (§31), then the pure mapping. Shared
 * by the Invoices page and the project/party Invoices tabs so none of them
 * forgets the rollup.
 */
export async function buildInvoiceTableRows(
  invoices: InvoiceListItem[],
): Promise<InvoiceTableRow[]> {
  const summaries = await invoiceCommentService.summarizeByInvoiceIds(
    invoices.map((invoice) => invoice.id),
  );
  return invoices.map((invoice) =>
    toInvoiceTableRow(invoice, summaries.get(invoice.id)),
  );
}
