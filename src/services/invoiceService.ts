import { invoiceRepository } from "@/repositories/invoiceRepository";
import type {
  InvoiceItemWriteInput,
  InvoiceListItem,
  InvoiceWithItems,
  InvoiceWriteInput,
} from "@/repositories/invoiceRepository";
import { projectRepository } from "@/repositories/projectRepository";
import type { ProjectWithRelations } from "@/repositories/projectRepository";
import {
  generateInvoiceNumber,
  extractSequence,
} from "@/services/invoiceNumberService";
import type { InvoiceInput } from "@/lib/validation/invoice";
import { Prisma } from "@/generated/prisma/client";
import type {
  DisplayCurrency,
  Invoice,
  InvoiceStatus,
} from "@/generated/prisma/client";
import {
  bucketCounts,
  daysAgo,
  daysFromNow,
  DUE_SOON_WITHIN_DAYS,
  STALE_DRAFT_DAYS,
  TREND_WINDOW_DAYS,
  type StatTrend,
} from "@/lib/dashboardTrend";
import { addDays, startOfMonthUTC, toDateInputValue } from "@/lib/dates";

/**
 * Thrown when a projectId doesn't resolve to a real Project — createDraft is
 * always entered from a real project-picker gate, so this only ever fires
 * against a stale/tampered id.
 */
export class ProjectNotFoundError extends Error {
  constructor() {
    super("Project not found.");
    this.name = "ProjectNotFoundError";
  }
}

export class InvoiceNotFoundError extends Error {
  constructor() {
    super("Invoice not found.");
    this.name = "InvoiceNotFoundError";
  }
}

/**
 * Docs/implementation_decisions.md §10/§11 — updateDraft throws immediately
 * if invoked on a non-DRAFT invoice; DRAFT is the only editable status.
 */
export class InvoiceNotDraftError extends Error {
  constructor() {
    super("This invoice is no longer a draft and can't be edited.");
    this.name = "InvoiceNotDraftError";
  }
}

/** Friendly message for a manual-edit collision on the per-project unique invoice number. */
export class DuplicateInvoiceNumberError extends Error {
  constructor() {
    super(
      "This invoice number is already used by another invoice in this project. Choose a different number.",
    );
    this.name = "DuplicateInvoiceNumberError";
  }
}

/**
 * Docs/implementation_decisions.md §10 — the hardcoded transition matrix;
 * anything not listed here is rejected regardless of what the UI sent.
 */
export class InvalidTransitionError extends Error {
  constructor(from: InvoiceStatus, to: InvoiceStatus) {
    super(`An invoice can't move from ${from} to ${to}.`);
    this.name = "InvalidTransitionError";
  }
}

/** Docs/mvp_user_stories.md Story 4.4 — one or more send-blocking reasons. */
export class InvoiceSendValidationError extends Error {
  reasons: string[];
  constructor(reasons: string[]) {
    super(reasons.join(" "));
    this.name = "InvoiceSendValidationError";
    this.reasons = reasons;
  }
}

function translateWriteError(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return new DuplicateInvoiceNumberError();
  }
  return error;
}

type PartySnapshot = {
  name: string;
  email: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

function toPartySnapshot(party: {
  name: string;
  email: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}): PartySnapshot {
  return {
    name: party.name,
    email: party.email,
    street1: party.street1,
    street2: party.street2,
    city: party.city,
    state: party.state,
    postalCode: party.postalCode,
    country: party.country,
  };
}

/**
 * Docs/implementation_decisions.md §11/Story 6.1 — recomputed from current
 * live Party/PaymentMethod data on every DRAFT save, never a stored/cached
 * value re-read from a prior snapshot.
 */
function buildSnapshots(project: ProjectWithRelations) {
  return {
    fromPartySnapshot: toPartySnapshot(project.contractor),
    toPartySnapshot: toPartySnapshot(project.client),
    paymentDetailsSnapshot: project.preferredPaymentMethod?.fields ?? [],
  };
}

/**
 * Docs/product_spec.md §1.5 — amount is always backend-calculated from
 * quantity × unitPrice, never trusted from the client — for Hourly items.
 * M14 adds one narrow, deliberate exception: a Flat item (`isFlatAmount`)
 * has no quantity/unitPrice at all, and its `amount` IS trusted directly
 * from the client, since there is nothing to compute it from.
 */
function computeItems(items: InvoiceInput["items"]): InvoiceItemWriteInput[] {
  return items.map((item, index) => {
    if (item.isReferralCredit) {
      // M35 — the client only ever submits a positive magnitude (validated
      // "zero or greater" like a Flat item); negated here so the stored
      // amount is the one negative figure that makes sumAmounts subtract it.
      return {
        description: item.description,
        isFlatAmount: true,
        isReferralCredit: true,
        quantity: null,
        unitPrice: null,
        amount: new Prisma.Decimal(item.amount).negated(),
        durationText: null,
        sortOrder: index,
      };
    }
    if (item.isFlatAmount) {
      return {
        description: item.description,
        isFlatAmount: true,
        isReferralCredit: false,
        quantity: null,
        unitPrice: null,
        amount: new Prisma.Decimal(item.amount),
        durationText: item.durationText.trim(),
        sortOrder: index,
      };
    }
    const quantity = new Prisma.Decimal(item.quantity);
    const unitPrice = new Prisma.Decimal(item.unitPrice);
    return {
      description: item.description,
      isFlatAmount: false,
      isReferralCredit: false,
      quantity,
      unitPrice,
      amount: quantity.times(unitPrice),
      durationText: null,
      sortOrder: index,
    };
  });
}

function sumAmounts(items: InvoiceItemWriteInput[]): Prisma.Decimal {
  return items.reduce(
    (sum, item) => sum.plus(item.amount),
    new Prisma.Decimal(0),
  );
}

/** M14 — plain admin-authored content, never left as `undefined`; blank means "no note". */
function nullIfBlank(value: string | undefined): string | null {
  return value && value.trim().length > 0 ? value.trim() : null;
}

/**
 * M26 — the currency an invoice's `subtotal`/
 * `total`/item rates are actually denominated in: always USD for a `DUAL`-
 * mode project (its core amounts never leave USD, only the optional
 * converted total does), the project's own `displayCurrency` for a `SINGLE`-
 * mode one (which may itself be USD, for a project that hasn't opted into
 * either currency feature at all). Exported so pages building
 * `InvoiceFormProjectInfo`/`InvoiceAiContext` can resolve the same value for
 * display, without duplicating the ternary.
 */
function resolveInvoiceCurrency(
  project: ProjectWithRelations,
): DisplayCurrency {
  return project.currencyMode === "DUAL" ? "USD" : project.displayCurrency;
}

function toWriteInput(
  project: ProjectWithRelations,
  input: InvoiceInput,
): InvoiceWriteInput {
  const items = computeItems(input.items);
  const subtotal = sumAmounts(items);
  const isDual = project.currencyMode === "DUAL";

  return {
    projectId: project.id,
    invoiceNumber: input.invoiceNumber,
    issueDate: new Date(input.issueDate),
    dueDate: new Date(input.dueDate),
    periodStart: input.periodStart ? new Date(input.periodStart) : null,
    periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
    subtotal,
    total: subtotal, // Docs/implementation_decisions.md §13 — no tax, Total always equals Subtotal.
    currency: resolveInvoiceCurrency(project),
    convertedTotal:
      isDual && input.convertedTotal
        ? new Prisma.Decimal(input.convertedTotal)
        : null,
    convertedCurrency: isDual ? project.displayCurrency : null,
    ...buildSnapshots(project),
    itemsNote: nullIfBlank(input.itemsNote),
    bottomNote: nullIfBlank(input.bottomNote),
    items,
  };
}

async function loadProjectOrThrow(
  projectId: string,
): Promise<ProjectWithRelations> {
  const project = await projectRepository.findById(projectId);
  if (!project) throw new ProjectNotFoundError();
  return project;
}

function list(): Promise<InvoiceListItem[]> {
  return invoiceRepository.findMany();
}

function listByStatus(status: InvoiceStatus): Promise<InvoiceListItem[]> {
  return invoiceRepository.findMany({ status });
}

/**
 * M19.3a — invoices-for-this-project section on the Project detail page.
 * M44 — ordered by `InvoiceNumber` (not `createdAt`, unlike every other
 * invoice list) since a project's own numbering sequence is the
 * meaningful order here; `sort` defaults to `desc` (newest number first,
 * matching every other list's newest-first convention) and is caller-
 * controlled so the page can offer an ascending toggle.
 */
function listByProject(
  projectId: string,
  sort: "asc" | "desc" = "desc",
): Promise<InvoiceListItem[]> {
  return invoiceRepository.findMany({
    projectId,
    orderBy: "invoiceNumber",
    orderDirection: sort,
  });
}

/** M36 — invoices-for-this-party section on the Party detail page; every invoice where this party is either the project's client or its contractor. */
function listByParty(partyId: string): Promise<InvoiceListItem[]> {
  return invoiceRepository.findMany({ partyId });
}

/** M36 — Party detail page's Invoices tab badge count, without fetching the full list. */
function countByParty(partyId: string): Promise<number> {
  return invoiceRepository.countByParty(partyId);
}

/** Dashboard (M10) — stats row counts (Docs/ui_design_guide.md §16). */
function countByStatus(status: InvoiceStatus): Promise<number> {
  return invoiceRepository.countByStatus(status);
}

/** Dashboard (M10) — USD-only outstanding subtext for the Sent/Unpaid stat. */
function sumSubtotalByStatus(status: InvoiceStatus): Promise<Prisma.Decimal> {
  return invoiceRepository.sumSubtotalByStatus(status);
}

/** Dashboard — M26's per-currency breakdown lines. */
function sumSubtotalByStatusGroupedByNonUsdCurrency(
  status: InvoiceStatus,
): Promise<{ currency: string; total: Prisma.Decimal }[]> {
  return invoiceRepository.sumSubtotalByStatusGroupedByNonUsdCurrency(status);
}

/** Dashboard (M10) — Needs Attention's overdue set. */
function listOverdue(): Promise<InvoiceListItem[]> {
  return invoiceRepository.findOverdueCandidates();
}

/** Recent Activity's invoice-side lifecycle events — optionally scoped to one project (Project detail Overview tab). */
function listRecentActivity(
  limit: number,
  projectId?: string,
): Promise<InvoiceListItem[]> {
  return invoiceRepository.findRecentByStatuses(
    ["SENT", "PAID", "VOID"],
    limit,
    projectId,
  );
}

/** M27 dashboard Priority Feed (Docs/ui_design_guide.md §16) — drafts idle longer than the stale threshold, most-stale first. */
function listStaleDrafts(): Promise<InvoiceListItem[]> {
  return invoiceRepository.findStaleDrafts(daysAgo(STALE_DRAFT_DAYS));
}

/** Dashboard Action Required panel — SENT invoices due within DUE_SOON_WITHIN_DAYS but not yet overdue. */
function listDueSoon(): Promise<InvoiceListItem[]> {
  return invoiceRepository.findDueSoon(daysFromNow(DUE_SOON_WITHIN_DAYS));
}

/** Invoices list "Paid this month" stat. */
function listPaidThisMonth(): Promise<InvoiceListItem[]> {
  return invoiceRepository.findByStatusSince("PAID", startOfMonthUTC());
}

/**
 * M27 dashboard trend — Draft Invoices' approximated trailing-30-day delta +
 * sparkline. See `src/lib/dashboardTrend.ts` for why this is an
 * approximation, not an exact history.
 */
async function getDraftInvoicesTrend(): Promise<StatTrend> {
  const since = daysAgo(TREND_WINDOW_DAYS);
  const [entered, exitedToSent] = await Promise.all([
    invoiceRepository.findCreatedByStatusSince("DRAFT", since),
    invoiceRepository.findUpdatedByStatusSince("SENT", since),
  ]);
  const enteredTimestamps = entered.map((row) => row.createdAt);
  const exitedTimestamps = exitedToSent.map((row) => row.updatedAt);
  return {
    delta: enteredTimestamps.length - exitedTimestamps.length,
    sparklineCounts: bucketCounts([...enteredTimestamps, ...exitedTimestamps]),
  };
}

/** M27 dashboard trend — Sent/Unpaid's approximated trailing-30-day delta + sparkline. */
async function getSentUnpaidTrend(): Promise<StatTrend> {
  const since = daysAgo(TREND_WINDOW_DAYS);
  const [entered, exitedToPaid] = await Promise.all([
    invoiceRepository.findUpdatedByStatusSince("SENT", since),
    invoiceRepository.findUpdatedByStatusSince("PAID", since),
  ]);
  const enteredTimestamps = entered.map((row) => row.updatedAt);
  const exitedTimestamps = exitedToPaid.map((row) => row.updatedAt);
  return {
    delta: enteredTimestamps.length - exitedTimestamps.length,
    sparklineCounts: bucketCounts([...enteredTimestamps, ...exitedTimestamps]),
  };
}

/**
 * M27 dashboard trend — Overdue's approximated trailing-30-day delta +
 * sparkline. Reuses the already-fetched `overdueInvoices` list (from
 * `listOverdue`) rather than re-querying — "newly overdue in the window" is
 * just that list filtered by `dueDate`. "Resolved from overdue" filters
 * PAID/VOID invoices to only those whose `dueDate` was actually before their
 * `updatedAt` (i.e. genuinely overdue at the moment they were resolved).
 */
async function getOverdueTrend(
  overdueInvoices: InvoiceListItem[],
): Promise<StatTrend> {
  const since = daysAgo(TREND_WINDOW_DAYS);
  const resolved = await invoiceRepository.findResolvedSince(since);
  const enteredTimestamps = overdueInvoices
    .filter((invoice) => invoice.dueDate.getTime() >= since.getTime())
    .map((invoice) => invoice.dueDate);
  const exitedTimestamps = resolved
    .filter((row) => row.dueDate.getTime() < row.updatedAt.getTime())
    .map((row) => row.updatedAt);
  return {
    delta: enteredTimestamps.length - exitedTimestamps.length,
    sparklineCounts: bucketCounts([...enteredTimestamps, ...exitedTimestamps]),
  };
}

function getById(id: string): Promise<InvoiceWithItems | null> {
  return invoiceRepository.findById(id);
}

export type InvoiceNumberPreview = {
  suggested: string;
  /**
   * The project's last SENT/PAID invoice number, but only when it doesn't
   * structurally fit the project's *current* `invoiceNumberFormat` — e.g.
   * the format was changed, or that invoice was numbered by hand outside
   * this app. When set, `suggested` couldn't continue its sequence and
   * restarted instead, which the create form surfaces as a warning. `null`
   * when there's no such conflict (or no prior SENT/PAID invoice at all).
   */
  conflictingLastInvoiceNumber: string | null;
};

/**
 * Computes the suggested invoice number shown pre-filled on the create form
 * (Story 4.1). Generation happens once, here — not inside createDraft — since
 * the number must already be visible before the admin's first save, and is a
 * plain editable field from then on.
 */
async function previewNextInvoiceNumber(
  projectId: string,
): Promise<InvoiceNumberPreview> {
  const project = await loadProjectOrThrow(projectId);
  const [existingInvoiceNumbers, lastSentOrPaidInvoice] = await Promise.all([
    invoiceRepository.findInvoiceNumbersForProject(projectId),
    invoiceRepository.findMostRecentSentOrPaidByProject(projectId),
  ]);
  const suggested = generateInvoiceNumber({
    project: {
      abbreviation: project.abbreviation,
      name: project.name,
      invoiceNumberFormat: project.invoiceNumberFormat,
    },
    existingInvoiceNumbers,
  });
  const conflictingLastInvoiceNumber =
    lastSentOrPaidInvoice &&
    extractSequence(
      lastSentOrPaidInvoice.invoiceNumber,
      project.invoiceNumberFormat,
    ) === null
      ? lastSentOrPaidInvoice.invoiceNumber
      : null;
  return { suggested, conflictingLastInvoiceNumber };
}

/**
 * M39 — create form's `periodStart` default: the day after the project's
 * last SENT/PAID invoice's `periodEnd`, so consecutive invoices' periods
 * chain with no gap/overlap by default (still freely editable). `null` for
 * a project's first invoice, or if that prior invoice never had a period
 * set — nothing to chain off either way.
 */
async function previewNextPeriodStart(
  projectId: string,
): Promise<string | null> {
  const lastInvoice =
    await invoiceRepository.findMostRecentSentOrPaidByProject(projectId);
  if (!lastInvoice?.periodEnd) return null;
  return toDateInputValue(addDays(lastInvoice.periodEnd, 1));
}

export type InvoiceAutofillData = {
  items: {
    description: string;
    isFlatAmount: boolean;
    isReferralCredit: boolean;
    quantity: string;
    unitPrice: string;
    amount: string;
    durationText: string;
  }[];
  itemsNote: string;
  bottomNote: string;
};

/**
 * M18 (Autofill from last invoice) — copies only
 * line items and notes from the project's most recently issued invoice
 * (any status); never invoiceNumber/dates/convertedTotal (
 * a deliberate scope decision — those would either collide or paste stale values).
 * Same string-mapping convention as the edit form's own defaultValues
 * (`/invoices/[id]/page.tsx`).
 */
async function getAutofillDataForProject(
  projectId: string,
): Promise<InvoiceAutofillData | null> {
  const invoice = await invoiceRepository.findMostRecentByProject(projectId);
  if (!invoice) return null;

  return {
    items: invoice.items.map((item) => ({
      description: item.description,
      isFlatAmount: item.isFlatAmount,
      // M35 — the row itself is a reminder to add a credit, not the stale
      // figure; carried over regardless of the project's current
      // referralCreditEnabled toggle, matching this function's otherwise
      // unconditional "copy everything" behavior.
      isReferralCredit: item.isReferralCredit,
      quantity: item.quantity?.toString() ?? "",
      unitPrice: item.unitPrice?.toString() ?? "",
      amount: item.isReferralCredit
        ? ""
        : item.isFlatAmount
          ? item.amount.toString()
          : "",
      durationText: item.durationText ?? "",
    })),
    itemsNote: invoice.itemsNote ?? "",
    bottomNote: invoice.bottomNote ?? "",
  };
}

async function createDraft(
  projectId: string,
  input: InvoiceInput,
  createdByUserId: string | null = null,
): Promise<Invoice> {
  const project = await loadProjectOrThrow(projectId);
  try {
    return await invoiceRepository.createWithItems(
      toWriteInput(project, input),
      createdByUserId,
    );
  } catch (error) {
    throw translateWriteError(error);
  }
}

/** Docs/mvp_user_stories.md Story 6.1 — recomputes snapshot + totals on every save while DRAFT. */
async function updateDraft(id: string, input: InvoiceInput): Promise<Invoice> {
  const existing = await invoiceRepository.findById(id);
  if (!existing) throw new InvoiceNotFoundError();
  if (existing.status !== "DRAFT") throw new InvoiceNotDraftError();

  const project = await loadProjectOrThrow(existing.projectId);
  try {
    return await invoiceRepository.replaceItemsAndUpdate(
      id,
      toWriteInput(project, input),
    );
  } catch (error) {
    throw translateWriteError(error);
  }
}

/**
 * / Docs/implementation_decisions.md §10 — the
 * only authoritative transition rules; enforced here regardless of what the
 * UI sent, per Story 5.5.
 */
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["SENT", "VOID"],
  SENT: ["PAID", "VOID"],
  PAID: [],
  VOID: [],
};

/** Docs/mvp_user_stories.md Story 4.4 — the DRAFT→SENT send-validation checklist. */
function collectSendValidationReasons(
  existing: InvoiceWithItems,
  project: ProjectWithRelations,
): string[] {
  const reasons: string[] = [];

  if (existing.items.length === 0) {
    reasons.push("Add at least one line item before sending.");
  }
  if (!existing.invoiceNumber.trim()) {
    reasons.push("Invoice number is required before sending.");
  }
  if (!existing.issueDate) {
    reasons.push("Issue date is required before sending.");
  }
  if (!existing.dueDate) {
    reasons.push("Due date is required before sending.");
  }
  if (
    existing.issueDate &&
    existing.dueDate &&
    existing.dueDate.getTime() < existing.issueDate.getTime()
  ) {
    reasons.push("Due date must be on or after the issue date.");
  }
  if (project.currencyMode === "DUAL" && existing.convertedTotal == null) {
    reasons.push(
      `Enter a converted total in ${project.displayCurrency} before sending.`,
    );
  }
  const referralCredit = existing.items.find((item) => item.isReferralCredit);
  if (referralCredit && referralCredit.amount.isZero()) {
    reasons.push(
      "Enter a nonzero amount for the referral credit line item before sending, or remove it.",
    );
  }

  return reasons;
}

/** Docs/mvp_user_stories.md Story 4.4 — throws with every applicable reason when incomplete. */
async function validateForSend(id: string): Promise<void> {
  const existing = await invoiceRepository.findById(id);
  if (!existing) throw new InvoiceNotFoundError();
  const project = await loadProjectOrThrow(existing.projectId);

  const reasons = collectSendValidationReasons(existing, project);
  if (reasons.length > 0) throw new InvoiceSendValidationError(reasons);
}

/**
 * Docs/implementation_decisions.md §10/§11 — enforces the transition matrix
 * and, only for DRAFT→SENT, performs the one final snapshot recompute
 * (covering any live edits since the last draft save) before permanently
 * locking. No other transition touches snapshot fields.
 */
async function transitionStatus(
  id: string,
  target: InvoiceStatus,
): Promise<Invoice> {
  const existing = await invoiceRepository.findById(id);
  if (!existing) throw new InvoiceNotFoundError();

  const allowed = ALLOWED_TRANSITIONS[existing.status];
  if (!allowed.includes(target)) {
    throw new InvalidTransitionError(existing.status, target);
  }

  if (target !== "SENT") {
    try {
      return await invoiceRepository.updateStatus(id, target);
    } catch (error) {
      throw translateWriteError(error);
    }
  }

  const project = await loadProjectOrThrow(existing.projectId);
  const reasons = collectSendValidationReasons(existing, project);
  if (reasons.length > 0) throw new InvoiceSendValidationError(reasons);

  const isDual = project.currencyMode === "DUAL";
  try {
    return await invoiceRepository.updateStatus(id, "SENT", {
      ...buildSnapshots(project),
      currency: resolveInvoiceCurrency(project),
      convertedTotal: isDual ? existing.convertedTotal : null,
      convertedCurrency: isDual ? project.displayCurrency : null,
    });
  } catch (error) {
    throw translateWriteError(error);
  }
}

/** Story 5.6 — deletable in any status; this is what unblocks Project deletion. */
async function remove(id: string): Promise<void> {
  const existing = await invoiceRepository.findById(id);
  if (!existing) throw new InvoiceNotFoundError();
  await invoiceRepository.deleteById(id);
}

export const invoiceService = {
  list,
  listByStatus,
  listByProject,
  listByParty,
  countByParty,
  getById,
  resolveInvoiceCurrency,
  previewNextInvoiceNumber,
  previewNextPeriodStart,
  getAutofillDataForProject,
  createDraft,
  updateDraft,
  validateForSend,
  transitionStatus,
  delete: remove,
  countByStatus,
  sumSubtotalByStatus,
  sumSubtotalByStatusGroupedByNonUsdCurrency,
  listOverdue,
  listRecentActivity,
  listStaleDrafts,
  listDueSoon,
  listPaidThisMonth,
  getDraftInvoicesTrend,
  getSentUnpaidTrend,
  getOverdueTrend,
};
