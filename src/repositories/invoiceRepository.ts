import { prisma } from "@/lib/prisma";
import { startOfTodayUTC } from "@/lib/dates";
import { Prisma } from "@/generated/prisma/client";
import type {
  DisplayCurrency,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
} from "@/generated/prisma/client";
import type { ProjectWithRelations } from "@/repositories/projectRepository";

/**
 * Thin Prisma wrappers only — no validation, no business rules.
 */
export type InvoiceItemWriteInput = {
  description: string;
  isFlatAmount: boolean;
  isReferralCredit: boolean;
  quantity: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal | null;
  amount: Prisma.Decimal;
  durationText: string | null;
  sortOrder: number;
};

export type InvoiceWriteInput = {
  projectId: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  subtotal: Prisma.Decimal;
  total: Prisma.Decimal;
  currency: DisplayCurrency;
  convertedTotal: Prisma.Decimal | null;
  convertedCurrency: string | null;
  fromPartySnapshot: Prisma.InputJsonValue;
  toPartySnapshot: Prisma.InputJsonValue;
  paymentDetailsSnapshot: Prisma.InputJsonValue;
  itemsNote: string | null;
  bottomNote: string | null;
  items: InvoiceItemWriteInput[];
};

export type InvoiceWithItems = Invoice & {
  items: InvoiceItem[];
  project: ProjectWithRelations;
};

export type InvoiceListItem = Invoice & {
  project: { id: string; name: string; client: { id: string; name: string } };
};

/** Shared by every query below that returns InvoiceListItem-shaped rows. */
const LIST_ITEM_INCLUDE = {
  project: {
    select: {
      id: true,
      name: true,
      client: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.InvoiceInclude;

function findMany(filters?: {
  projectId?: string;
  status?: InvoiceStatus;
  partyId?: string;
  /**
   * M44 — defaults to `createdAt`/`desc` (existing behavior for every
   * caller that doesn't pass this). `listByProject` is the only caller
   * that requests `invoiceNumber` — sorting mixed-project results by
   * invoice-number text would interleave unrelated numbering schemes
   * meaninglessly, so this is deliberately not the default.
   */
  orderBy?: "createdAt" | "invoiceNumber";
  orderDirection?: "asc" | "desc";
}): Promise<InvoiceListItem[]> {
  const orderField = filters?.orderBy ?? "createdAt";
  const orderDirection = filters?.orderDirection ?? "desc";
  return prisma.invoice.findMany({
    where: {
      ...(filters?.projectId ? { projectId: filters.projectId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.partyId
        ? {
            project: {
              OR: [
                { clientId: filters.partyId },
                { contractorId: filters.partyId },
              ],
            },
          }
        : {}),
    },
    include: LIST_ITEM_INCLUDE,
    orderBy: { [orderField]: orderDirection },
  });
}

/** Dashboard (M10) — stats row counts, excluding VOID by construction (callers pass DRAFT/SENT). */
function countByStatus(status: InvoiceStatus): Promise<number> {
  return prisma.invoice.count({ where: { status } });
}

/** Party detail page's tab badge — avoids fetching+joining the full list just to count it. */
function countByParty(partyId: string): Promise<number> {
  return prisma.invoice.count({
    where: {
      project: {
        OR: [{ clientId: partyId }, { contractorId: partyId }],
      },
    },
  });
}

/**
 * Dashboard (M10) — USD-only outstanding subtext (Docs/ui_design_guide.md
 * §16); subtotal === total, no tax. M26 — scoped to
 * `currency: "USD"` explicitly, not every invoice: a `SINGLE`-mode non-USD
 * invoice's `subtotal` is genuinely denominated in that other currency, and
 * blending it into a raw sum here would silently mix currencies. `DUAL`-mode
 * invoices always have `currency: "USD"` regardless of their project's
 * `displayCurrency`, so they're correctly still included.
 */
async function sumSubtotalByStatus(
  status: InvoiceStatus,
): Promise<Prisma.Decimal> {
  const result = await prisma.invoice.aggregate({
    where: { status, currency: "USD" },
    _sum: { subtotal: true },
  });
  return result._sum.subtotal ?? new Prisma.Decimal(0);
}

/**
 * Dashboard (M10) — M26. The non-USD counterpart to
 * `sumSubtotalByStatus` above: one same-currency grouped sum per non-USD
 * currency actually present among invoices of this status, rendered as
 * secondary breakdown lines rather than blended into the primary USD figure.
 */
async function sumSubtotalByStatusGroupedByNonUsdCurrency(
  status: InvoiceStatus,
): Promise<{ currency: string; total: Prisma.Decimal }[]> {
  const rows = await prisma.invoice.groupBy({
    by: ["currency"],
    where: { status, currency: { not: "USD" } },
    _sum: { subtotal: true },
  });
  return rows.map((row) => ({
    currency: row.currency,
    total: row._sum.subtotal ?? new Prisma.Decimal(0),
  }));
}

/** Dashboard (M10) — Needs Attention's overdue set: SENT + past-due, most overdue first. */
function findOverdueCandidates(): Promise<InvoiceListItem[]> {
  return prisma.invoice.findMany({
    where: { status: "SENT", dueDate: { lt: startOfTodayUTC() } },
    include: LIST_ITEM_INCLUDE,
    orderBy: { dueDate: "asc" },
  });
}

/**
 * M27 dashboard Priority Feed (Docs/ui_design_guide.md §16) — drafts older
 * than the stale-draft cutoff (`src/lib/dashboardTrend.ts`'s
 * `STALE_DRAFT_DAYS`), oldest/most-stale first.
 */
function findStaleDrafts(cutoff: Date): Promise<InvoiceListItem[]> {
  return prisma.invoice.findMany({
    where: { status: "DRAFT", createdAt: { lte: cutoff } },
    include: LIST_ITEM_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Dashboard Action Required panel — SENT invoices due within the window
 * ending at `cutoff` but not yet overdue (`dueDate >= today`), soonest-due
 * first. Mirrors findOverdueCandidates/findStaleDrafts's shape.
 */
function findDueSoon(cutoff: Date): Promise<InvoiceListItem[]> {
  return prisma.invoice.findMany({
    where: {
      status: "SENT",
      dueDate: { gte: startOfTodayUTC(), lte: cutoff },
    },
    include: LIST_ITEM_INCLUDE,
    orderBy: { dueDate: "asc" },
  });
}

/**
 * Invoices list "Paid this month" stat — full rows (not just timestamps
 * like findUpdatedByStatusSince) for a given status updated since `since`.
 * Reliable for PAID specifically: a PAID invoice is terminal, so its
 * updatedAt is exactly the moment it became PAID, never overwritten again.
 */
function findByStatusSince(
  status: InvoiceStatus,
  since: Date,
): Promise<InvoiceListItem[]> {
  return prisma.invoice.findMany({
    where: { status, updatedAt: { gte: since } },
    include: LIST_ITEM_INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Recent Activity's invoice-side events (M10, dashboard-wide; reused by the
 * project detail Overview tab's Recent activity panel, scoped via
 * `projectId`). `updatedAt` only changes for a non-DRAFT invoice via
 * transitionStatus (updateDraft is DRAFT-only), so it's exactly the
 * timestamp of the most recent lifecycle transition into that status — no
 * separate event log needed.
 */
function findRecentByStatuses(
  statuses: InvoiceStatus[],
  limit: number,
  projectId?: string,
): Promise<InvoiceListItem[]> {
  return prisma.invoice.findMany({
    where: {
      status: { in: statuses },
      ...(projectId ? { projectId } : {}),
    },
    include: LIST_ITEM_INCLUDE,
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

/**
 * M27 dashboard trend (Docs/ui_design_guide.md §16) — invoices that entered
 * `status` within the trailing window, keyed off `createdAt`. Used for the
 * Draft Invoices stat's "entered" count.
 */
function findCreatedByStatusSince(
  status: InvoiceStatus,
  since: Date,
): Promise<{ createdAt: Date }[]> {
  return prisma.invoice.findMany({
    where: { status, createdAt: { gte: since } },
    select: { createdAt: true },
  });
}

/**
 * M27 dashboard trend — invoices currently in `status` whose `updatedAt`
 * falls within the trailing window. Since `DRAFT→SENT` is the only path
 * into SENT and `SENT→PAID` the only path into PAID, this is an exact (not
 * approximate) proxy for "entered SENT"/"entered PAID" respectively — used
 * for the Draft "exited to Sent" and Sent/Unpaid "entered"/"exited to Paid"
 * counts. A stray DRAFT→VOID or SENT→VOID isn't captured by any of these
 * (VOID can originate from either, so it's deliberately left out of both
 * rather than guessed at) — an accepted approximation gap.
 */
function findUpdatedByStatusSince(
  status: InvoiceStatus,
  since: Date,
): Promise<{ updatedAt: Date }[]> {
  return prisma.invoice.findMany({
    where: { status, updatedAt: { gte: since } },
    select: { updatedAt: true },
  });
}

/**
 * M27 dashboard trend — invoices resolved (PAID or VOID) within the
 * trailing window, with `dueDate` alongside so the caller can filter to
 * only those that were actually overdue at resolution time
 * (`dueDate < updatedAt`) in plain JS, since Prisma has no built-in
 * column-to-column comparison filter.
 */
function findResolvedSince(
  since: Date,
): Promise<{ dueDate: Date; updatedAt: Date }[]> {
  return prisma.invoice.findMany({
    where: { status: { in: ["PAID", "VOID"] }, updatedAt: { gte: since } },
    select: { dueDate: true, updatedAt: true },
  });
}

function findById(id: string): Promise<InvoiceWithItems | null> {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      project: {
        include: {
          client: true,
          contractor: true,
          preferredPaymentMethod: true,
        },
      },
    },
  });
}

/**
 * M18 (Autofill from last invoice) — the most
 * recently *issued* invoice for a project, any status (a stray DRAFT/VOID
 * still counts as "last time" — a deliberate scope decision).
 * Includes items since Autofill copies them; no party/payment-method
 * relations needed here (unlike findById), so a lighter include than that.
 */
function findMostRecentByProject(
  projectId: string,
): Promise<(Invoice & { items: InvoiceItem[] }) | null> {
  return prisma.invoice.findFirst({
    where: { projectId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
    orderBy: { issueDate: "desc" },
  });
}

/**
 * M39 — the create form's `periodStart` default chains off `periodEnd`
 * here; invoiceNumberService's format-mismatch warning chains off
 * `invoiceNumber`. Most recently issued SENT/PAID invoice for a project
 * (DRAFT doesn't count, nothing's final yet; VOID doesn't count, it was
 * never really billed).
 */
function findMostRecentSentOrPaidByProject(
  projectId: string,
): Promise<Pick<Invoice, "periodEnd" | "invoiceNumber"> | null> {
  return prisma.invoice.findFirst({
    where: { projectId, status: { in: ["SENT", "PAID"] } },
    select: { periodEnd: true, invoiceNumber: true },
    orderBy: { issueDate: "desc" },
  });
}

/** Sourced for invoiceNumberService's per-project sequence computation. */
function findInvoiceNumbersForProject(projectId: string): Promise<string[]> {
  return prisma.invoice
    .findMany({ where: { projectId }, select: { invoiceNumber: true } })
    .then((rows) => rows.map((row) => row.invoiceNumber));
}

function itemsCreateInput(items: InvoiceItemWriteInput[]) {
  return items.map((item) => ({
    description: item.description,
    isFlatAmount: item.isFlatAmount,
    isReferralCredit: item.isReferralCredit,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: item.amount,
    durationText: item.durationText,
    sortOrder: item.sortOrder,
  }));
}

/**
 * `createdByUserId` is a separate parameter, not part of `InvoiceWriteInput`
 * (M28) — that type is shared with `replaceItemsAndUpdate` below, and this
 * field is set once at creation only, never touched by an update.
 */
function createWithItems(
  data: InvoiceWriteInput,
  createdByUserId: string | null,
): Promise<Invoice> {
  const { items, ...invoiceData } = data;
  return prisma.invoice.create({
    data: {
      ...invoiceData,
      createdByUserId,
      items: { create: itemsCreateInput(items) },
    },
  });
}

/**
 * Delete-and-recreate every InvoiceItem row on
 * each DRAFT save rather than diffing; items have no identity referenced
 * elsewhere, so this is simpler and equally correct. Wrapped in a
 * transaction since it's two dependent writes, unlike createWithItems's
 * single nested-write query.
 */
function replaceItemsAndUpdate(
  id: string,
  data: InvoiceWriteInput,
): Promise<Invoice> {
  const { items, ...invoiceData } = data;
  return prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    return tx.invoice.update({
      where: { id },
      data: {
        ...invoiceData,
        items: { create: itemsCreateInput(items) },
      },
    });
  });
}

/** Fields relocked at the exact moment of a DRAFT→SENT transition (§10). */
export type SentSnapshotUpdate = {
  fromPartySnapshot: Prisma.InputJsonValue;
  toPartySnapshot: Prisma.InputJsonValue;
  paymentDetailsSnapshot: Prisma.InputJsonValue;
  currency: DisplayCurrency;
  convertedTotal: Prisma.Decimal | null;
  convertedCurrency: string | null;
};

/**
 * `snapshotUpdate` is only ever passed for the DRAFT→SENT transition (the
 * one moment snapshot fields are ever touched again after creation) — every
 * other transition is a bare status change.
 */
function updateStatus(
  id: string,
  status: InvoiceStatus,
  snapshotUpdate?: SentSnapshotUpdate,
): Promise<Invoice> {
  return prisma.invoice.update({
    where: { id },
    data: { status, ...snapshotUpdate },
  });
}

/** Story 5.6 — deletable in any status; InvoiceItem rows cascade (schema `onDelete: Cascade`). */
function deleteById(id: string): Promise<Invoice> {
  return prisma.invoice.delete({ where: { id } });
}

export const invoiceRepository = {
  findMany,
  findById,
  findMostRecentByProject,
  findMostRecentSentOrPaidByProject,
  findInvoiceNumbersForProject,
  createWithItems,
  replaceItemsAndUpdate,
  updateStatus,
  deleteById,
  countByStatus,
  countByParty,
  sumSubtotalByStatus,
  sumSubtotalByStatusGroupedByNonUsdCurrency,
  findOverdueCandidates,
  findRecentByStatuses,
  findStaleDrafts,
  findDueSoon,
  findByStatusSince,
  findCreatedByStatusSince,
  findUpdatedByStatusSince,
  findResolvedSince,
};
