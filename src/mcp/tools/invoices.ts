import { z } from "zod";
import { defineTool, requireConfirm } from "@/mcp/core";
import {
  confirmSchema,
  idSchema,
  notFound,
  revalidateAfterWrite,
} from "@/mcp/tools/shared";
import { ROLES } from "@/lib/permissions";
import {
  invoiceBaseSchema,
  invoiceSchema,
  type InvoiceInput,
} from "@/lib/validation/invoice";
import { invoiceService } from "@/services/invoiceService";
import { invoiceCommentService } from "@/services/invoiceCommentService";
import { isOverdue, toDateInputValue } from "@/lib/dates";
import type {
  InvoiceListItem,
  InvoiceWithItems,
} from "@/repositories/invoiceRepository";

function invoiceSummary(invoice: InvoiceListItem) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    overdue: invoice.status === "SENT" && isOverdue(invoice.dueDate),
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    subtotal: invoice.subtotal,
    total: invoice.total,
    currency: invoice.currency,
    convertedTotal: invoice.convertedTotal,
    convertedCurrency: invoice.convertedCurrency,
    project: { id: invoice.project.id, name: invoice.project.name },
    client: invoice.project.client,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
}

/** Full detail minus the encrypted payment-details snapshot (bank details never leave the app over MCP). */
function invoiceDetail(invoice: InvoiceWithItems) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    overdue: invoice.status === "SENT" && isOverdue(invoice.dueDate),
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    subtotal: invoice.subtotal,
    total: invoice.total,
    currency: invoice.currency,
    convertedTotal: invoice.convertedTotal,
    convertedCurrency: invoice.convertedCurrency,
    itemsNote: invoice.itemsNote,
    bottomNote: invoice.bottomNote,
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      isFlatAmount: item.isFlatAmount,
      isReferralCredit: item.isReferralCredit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      durationText: item.durationText,
      sortOrder: item.sortOrder,
    })),
    fromParty: invoice.fromPartySnapshot,
    toParty: invoice.toPartySnapshot,
    project: {
      id: invoice.project.id,
      name: invoice.project.name,
      client: { id: invoice.project.client.id, name: invoice.project.client.name },
      contractor: {
        id: invoice.project.contractor.id,
        name: invoice.project.contractor.name,
      },
    },
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
}

/** The form-shaped input an existing draft corresponds to — the base an `update_draft_invoice` merge starts from (mirrors the edit page). */
export function invoiceToInput(invoice: InvoiceWithItems): InvoiceInput {
  return {
    invoiceNumber: invoice.invoiceNumber,
    issueDate: toDateInputValue(invoice.issueDate),
    dueDate: toDateInputValue(invoice.dueDate),
    periodStart: invoice.periodStart ? toDateInputValue(invoice.periodStart) : "",
    periodEnd: invoice.periodEnd ? toDateInputValue(invoice.periodEnd) : "",
    convertedTotal: invoice.convertedTotal?.toString() ?? "",
    itemsNote: invoice.itemsNote ?? "",
    bottomNote: invoice.bottomNote ?? "",
    items: invoice.items.map((item) => ({
      description: item.description,
      isFlatAmount: item.isFlatAmount,
      isReferralCredit: item.isReferralCredit,
      quantity: item.quantity?.toString() ?? "",
      unitPrice: item.unitPrice?.toString() ?? "",
      amount: item.isReferralCredit
        ? item.amount.abs().toString()
        : item.isFlatAmount
          ? item.amount.toString()
          : "",
      durationText: item.durationText ?? "",
    })),
  };
}

async function loadInvoice(invoiceId: string): Promise<InvoiceWithItems> {
  const invoice = await invoiceService.getById(invoiceId);
  return invoice ?? notFound(`Invoice ${invoiceId}`);
}

const ITEMS_DOC =
  "items: each {description, isFlatAmount, isReferralCredit?, quantity, unitPrice, amount, durationText} with every key present as a string (empty string when not applicable). Hourly item: quantity > 0 and unitPrice ≥ 0, amount is computed server-side. Flat item (isFlatAmount true): amount ≥ 0 and durationText required (e.g. \"Fixed\", \"50%\"). At most one referral-credit item (amount is the positive credit, subtracted from the total).";

const statusSchema = z.enum(["DRAFT", "SENT", "PAID", "VOID"]);

export const listInvoices = defineTool({
  name: "list_invoices",
  title: "List invoices",
  description:
    "Lists invoices newest first by issue date. Filter by status, project, party (as client or contractor) and/or overdue (SENT and past due date). ledger defaults to CLIENT; pass INTERNAL for internal projects' invoices (ignored when projectId is given). Filters combine.",
  inputSchema: {
    status: statusSchema.optional(),
    projectId: idSchema.optional(),
    partyId: idSchema.optional(),
    overdue: z.boolean().optional(),
    ledger: z.enum(["CLIENT", "INTERNAL"]).optional(),
  },
  scope: "READ",
  annotations: { readOnlyHint: true },
  handler: async ({ status, projectId, partyId, overdue, ledger }) => {
    let invoices: InvoiceListItem[] = projectId
      ? await invoiceService.listByProject(projectId)
      : partyId
        ? await invoiceService.listByParty(partyId, { ledger })
        : status
          ? await invoiceService.listByStatus(status, { ledger })
          : await invoiceService.list({ ledger });
    if (status) invoices = invoices.filter((invoice) => invoice.status === status);
    if (projectId && partyId) {
      invoices = invoices.filter(
        (invoice) => invoice.project.client.id === partyId,
      );
    }
    if (overdue) {
      invoices = invoices.filter(
        (invoice) => invoice.status === "SENT" && isOverdue(invoice.dueDate),
      );
    }
    return { invoices: invoices.map(invoiceSummary) };
  },
});

export const getInvoice = defineTool({
  name: "get_invoice",
  title: "Get invoice",
  description:
    "One invoice in full: line items, notes, the snapshotted from/to party details, status and comment count. Payment details are not included.",
  inputSchema: { invoiceId: idSchema },
  scope: "READ",
  annotations: { readOnlyHint: true },
  target: ({ invoiceId }) => ({ type: "invoice", id: invoiceId }),
  handler: async ({ invoiceId }) => {
    const invoice = await loadInvoice(invoiceId);
    const comments = await invoiceCommentService.summarizeByInvoiceIds([invoiceId]);
    return {
      invoice: invoiceDetail(invoice),
      commentCount: comments.get(invoiceId)?.count ?? 0,
    };
  },
});

export const previewNextInvoiceNumber = defineTool({
  name: "preview_next_invoice_number",
  title: "Preview next invoice number",
  description:
    "The invoice number the app would suggest for a new invoice in this project, for the given issue date (yyyy-mm-dd, default today), plus the default period start that chains off the last sent invoice.",
  inputSchema: {
    projectId: idSchema,
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  },
  scope: "READ",
  annotations: { readOnlyHint: true },
  target: ({ projectId }) => ({ type: "project", id: projectId }),
  handler: async ({ projectId, issueDate }) => {
    const [preview, defaultPeriodStart] = await Promise.all([
      invoiceService.previewNextInvoiceNumber(projectId, issueDate),
      invoiceService.previewNextPeriodStart(projectId),
    ]);
    return {
      suggestedNumber: preview.suggested,
      conflictingLastInvoiceNumber: preview.conflictingLastInvoiceNumber,
      defaultPeriodStart,
    };
  },
});

export const createDraftInvoice = defineTool({
  name: "create_draft_invoice",
  title: "Create draft invoice",
  description: `Creates a DRAFT invoice for a project. Omit invoiceNumber to use the project's next number for the issue date. Dates are yyyy-mm-dd. periodStart/periodEnd describe the billing period and print on the document. ${ITEMS_DOC} The draft is reviewed and sent from the app or with mark_invoice_sent.`,
  inputSchema: {
    projectId: idSchema,
    ...invoiceBaseSchema.shape,
    invoiceNumber: z.string().trim().optional(),
  },
  scope: "WRITE",
  roles: ROLES.writeInvoices,
  target: ({ projectId }) => ({ type: "project", id: projectId }),
  handler: async ({ projectId, ...rest }, ctx) => {
    const invoiceNumber =
      rest.invoiceNumber && rest.invoiceNumber.length > 0
        ? rest.invoiceNumber
        : (await invoiceService.previewNextInvoiceNumber(projectId, rest.issueDate))
            .suggested;
    const input = invoiceSchema.parse({ ...rest, invoiceNumber });
    const created = await invoiceService.createDraft(
      projectId,
      input,
      ctx.principal.userId,
    );
    revalidateAfterWrite();
    return { invoice: invoiceDetail(await loadInvoice(created.id)) };
  },
});

export const updateDraftInvoice = defineTool({
  name: "update_draft_invoice",
  title: "Update draft invoice",
  description: `Updates a DRAFT invoice (sent invoices are locked). Only the fields you pass change; if you pass items, the whole item list is replaced. ${ITEMS_DOC}`,
  inputSchema: {
    invoiceId: idSchema,
    ...Object.fromEntries(
      Object.entries(invoiceBaseSchema.shape).map(([key, schema]) => [
        key,
        schema.optional(),
      ]),
    ),
  } as { invoiceId: typeof idSchema } & {
    [K in keyof typeof invoiceBaseSchema.shape]: z.ZodOptional<
      (typeof invoiceBaseSchema.shape)[K]
    >;
  },
  scope: "WRITE",
  roles: ROLES.writeInvoices,
  target: ({ invoiceId }) => ({ type: "invoice", id: invoiceId }),
  handler: async ({ invoiceId, ...patch }) => {
    const existing = await loadInvoice(invoiceId);
    const merged = { ...invoiceToInput(existing) };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
    }
    await invoiceService.updateDraft(invoiceId, invoiceSchema.parse(merged));
    revalidateAfterWrite();
    return { invoice: invoiceDetail(await loadInvoice(invoiceId)) };
  },
});

export const markInvoiceSent = defineTool({
  name: "mark_invoice_sent",
  title: "Mark invoice sent",
  description:
    "DRAFT → SENT. Runs the same send validation as the app (at least one item, dates, converted total for dual-currency projects) and permanently locks the invoice's snapshots and content.",
  inputSchema: { invoiceId: idSchema },
  scope: "WRITE",
  roles: ROLES.writeInvoices,
  target: ({ invoiceId }) => ({ type: "invoice", id: invoiceId }),
  handler: async ({ invoiceId }) => {
    await loadInvoice(invoiceId);
    await invoiceService.transitionStatus(invoiceId, "SENT");
    revalidateAfterWrite();
    return { invoice: invoiceDetail(await loadInvoice(invoiceId)) };
  },
});

export const markInvoicePaid = defineTool({
  name: "mark_invoice_paid",
  title: "Mark invoice paid",
  description: "SENT → PAID. Terminal: nothing returns from PAID.",
  inputSchema: { invoiceId: idSchema },
  scope: "WRITE",
  roles: ROLES.writeInvoices,
  target: ({ invoiceId }) => ({ type: "invoice", id: invoiceId }),
  handler: async ({ invoiceId }) => {
    await loadInvoice(invoiceId);
    await invoiceService.transitionStatus(invoiceId, "PAID");
    revalidateAfterWrite();
    return { invoice: invoiceDetail(await loadInvoice(invoiceId)) };
  },
});

export const voidInvoice = defineTool({
  name: "void_invoice",
  title: "Void invoice",
  description:
    "DRAFT or SENT → VOID. Terminal and excluded from every total from then on. Irreversible — requires confirm: true.",
  inputSchema: { invoiceId: idSchema, confirm: confirmSchema },
  scope: "WRITE_DESTRUCTIVE",
  roles: ROLES.writeInvoices,
  annotations: { destructiveHint: true },
  target: ({ invoiceId }) => ({ type: "invoice", id: invoiceId }),
  handler: async ({ invoiceId, confirm }) => {
    requireConfirm(confirm, "Voiding an invoice");
    await loadInvoice(invoiceId);
    await invoiceService.transitionStatus(invoiceId, "VOID");
    revalidateAfterWrite();
    return { invoice: invoiceDetail(await loadInvoice(invoiceId)) };
  },
});

export const deleteInvoice = defineTool({
  name: "delete_invoice",
  title: "Delete invoice",
  description:
    "Permanently deletes an invoice, its line items and comments, in any status. Irreversible — requires confirm: true.",
  inputSchema: { invoiceId: idSchema, confirm: confirmSchema },
  scope: "WRITE_DESTRUCTIVE",
  roles: ROLES.writeInvoices,
  annotations: { destructiveHint: true },
  target: ({ invoiceId }) => ({ type: "invoice", id: invoiceId }),
  handler: async ({ invoiceId, confirm }) => {
    requireConfirm(confirm, "Deleting an invoice");
    await loadInvoice(invoiceId);
    await invoiceService.delete(invoiceId);
    revalidateAfterWrite();
    return { deleted: true, invoiceId };
  },
});

export const INVOICE_TOOLS = [
  listInvoices,
  getInvoice,
  previewNextInvoiceNumber,
  createDraftInvoice,
  updateDraftInvoice,
  markInvoiceSent,
  markInvoicePaid,
  voidInvoice,
  deleteInvoice,
];
