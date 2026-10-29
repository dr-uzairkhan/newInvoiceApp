import { defineTool } from "@/mcp/core";
import { idSchema, notFound, type RawContentResult } from "@/mcp/tools/shared";
import { invoiceService } from "@/services/invoiceService";
import { documentService } from "@/services/documentService";
import { renderInvoicePdf } from "@/lib/pdf/renderInvoicePdf";

/**
 * Always the in-process pdf-lib renderer: an MCP call has no browser
 * session to hand to the headless-Chromium path, and pdf-lib is what
 * production uses anyway (`Docs/implementation_decisions.md` §12.2).
 */
export const getInvoicePdf = defineTool({
  name: "get_invoice_pdf",
  title: "Get invoice PDF",
  description:
    "Renders the invoice document as a PDF and returns it as an embedded binary resource (base64). Same figures as the app's download.",
  inputSchema: { invoiceId: idSchema },
  scope: "READ",
  annotations: { readOnlyHint: true },
  target: ({ invoiceId }) => ({ type: "invoice", id: invoiceId }),
  handler: async ({ invoiceId }): Promise<RawContentResult> => {
    const invoice = await invoiceService.getById(invoiceId);
    if (!invoice) notFound(`Invoice ${invoiceId}`);
    const pdf = await renderInvoicePdf(
      documentService.assembleInvoiceDocumentData(invoice),
    );
    const filename = `${invoice.invoiceNumber.replace(/[^a-zA-Z0-9-_]+/g, "_")}.pdf`;
    return {
      rawContent: [
        {
          type: "resource",
          resource: {
            uri: `invoice://${invoiceId}/${filename}`,
            mimeType: "application/pdf",
            blob: Buffer.from(pdf).toString("base64"),
          },
        },
      ],
    };
  },
});

export const DOCUMENT_TOOLS = [getInvoicePdf];
