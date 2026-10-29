import { prisma } from "@/lib/prisma";
import type {
  Party,
  PaymentMethod,
  Project,
  DisplayCurrency,
  ProjectCurrencyMode,
  ProjectStatus,
  InvoicePeriodType,
} from "@/generated/prisma/client";

/**
 * Thin Prisma wrappers only — no validation, no business rules
 *. `preferredPaymentMethodId: null` explicitly
 * clears the field on update, matching the null-normalization pattern used by
 * partyRepository/paymentMethodRepository.
 */
export type ProjectWriteInput = {
  name: string;
  abbreviation: string | null;
  serviceDescription: string | null;
  clientId: string;
  contractorId: string;
  preferredPaymentMethodId: string | null;
  invoiceNumberFormat: string;
  previousInvoiceNumberFormats: string[];
  invoicePeriodType: InvoicePeriodType | null;
  currencyMode: ProjectCurrencyMode;
  displayCurrency: DisplayCurrency;
  referralCreditEnabled: boolean;
  referralCreditLabel: string | null;
  status: ProjectStatus;
};

export type ProjectWithRelations = Project & {
  client: Party;
  contractor: Party;
  preferredPaymentMethod: PaymentMethod | null;
};

function findMany(filters?: {
  status?: ProjectStatus;
}): Promise<ProjectWithRelations[]> {
  return prisma.project.findMany({
    where: filters?.status ? { status: filters.status } : undefined,
    include: { client: true, contractor: true, preferredPaymentMethod: true },
    orderBy: { sortOrder: "asc" },
  });
}

function findById(id: string): Promise<ProjectWithRelations | null> {
  return prisma.project.findUnique({
    where: { id },
    include: { client: true, contractor: true, preferredPaymentMethod: true },
  });
}

/**
 * `createdByUserId`/`sortOrder` are separate parameters, not part of
 * `ProjectWriteInput` (M28/reorder-M) — that type is shared with `update`
 * below, and both fields are set once at creation only, never touched by an
 * update (`sortOrder` only ever changes via `swapSortOrder`).
 */
function create(
  data: ProjectWriteInput,
  createdByUserId: string | null,
  sortOrder: number,
): Promise<Project> {
  return prisma.project.create({
    data: { ...data, createdByUserId, sortOrder },
  });
}

function update(id: string, data: ProjectWriteInput): Promise<Project> {
  return prisma.project.update({ where: { id }, data });
}

/** Reorder — highest existing `sortOrder`, `null` when there are no projects yet (fresh append starts at 1). */
async function findMaxSortOrder(): Promise<number | null> {
  const result = await prisma.project.aggregate({ _max: { sortOrder: true } });
  return result._max.sortOrder;
}

/**
 * Reorder — the nearest ACTIVE project on one side of `sortOrder`, skipping
 * any ARCHIVED project sitting numerically between them (an archived
 * project isn't part of the visible up/down sequence on the dashboard).
 * `null` when `sortOrder` is already at that end of the ACTIVE list.
 */
function findAdjacentActive(
  sortOrder: number,
  direction: "up" | "down",
): Promise<Project | null> {
  return prisma.project.findFirst({
    where: {
      status: "ACTIVE",
      sortOrder: direction === "up" ? { lt: sortOrder } : { gt: sortOrder },
    },
    orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
  });
}

/** Reorder — swaps two projects' `sortOrder` values so their relative order flips without renumbering anything else. */
async function swapSortOrder(
  firstId: string,
  firstSortOrder: number,
  secondId: string,
  secondSortOrder: number,
): Promise<void> {
  await prisma.$transaction([
    prisma.project.update({
      where: { id: firstId },
      data: { sortOrder: secondSortOrder },
    }),
    prisma.project.update({
      where: { id: secondId },
      data: { sortOrder: firstSortOrder },
    }),
  ]);
}

function deleteById(id: string): Promise<Project> {
  return prisma.project.delete({ where: { id } });
}

/**
 * Story 3.4 / Docs/implementation_decisions.md §18: a Project is deletable
 * only while it has zero Invoice rows. invoiceRepository doesn't exist until
 * M5, so this counts the Invoice table directly — same pattern M2/M3 used for
 * their own deferred live-reference checks against Project.
 */
function countInvoices(projectId: string): Promise<number> {
  return prisma.invoice.count({ where: { projectId } });
}

/**
 * Dashboard (M10) — projects missing a preferred payment method, Story 8.3.
 * Scoped to ACTIVE only: an ARCHIVED project isn't issuing new invoices, so
 * flagging it as needing attention would just be noise on the dashboard.
 */
function findMissingPreferredPaymentMethod(): Promise<ProjectWithRelations[]> {
  return prisma.project.findMany({
    where: { preferredPaymentMethodId: null, status: "ACTIVE" },
    include: { client: true, contractor: true, preferredPaymentMethod: true },
    orderBy: { name: "asc" },
  });
}

/** Dashboard (M10) — Active Projects stat. */
function countActive(): Promise<number> {
  return prisma.project.count({ where: { status: "ACTIVE" } });
}

/** Dashboard (M10) — Recent Activity's "project created" events. */
function findRecentlyCreated(limit: number): Promise<ProjectWithRelations[]> {
  return prisma.project.findMany({
    include: { client: true, contractor: true, preferredPaymentMethod: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * M25 — Party detail page's "used by" tags per
 * payment method. Minimal projection (no relations needed) since the caller
 * already knows the owning party; scoped to ACTIVE projects only, same
 * reasoning as findMissingPreferredPaymentMethod (an ARCHIVED project isn't
 * really "using" the payment method for anything ongoing).
 */
function findByPreferredPaymentMethodIds(
  paymentMethodIds: string[],
): Promise<
  { id: string; name: string; preferredPaymentMethodId: string | null }[]
> {
  if (paymentMethodIds.length === 0) return Promise.resolve([]);
  return prisma.project.findMany({
    where: {
      preferredPaymentMethodId: { in: paymentMethodIds },
      status: "ACTIVE",
    },
    select: { id: true, name: true, preferredPaymentMethodId: true },
    orderBy: { name: "asc" },
  });
}

/**
 * M27 dashboard trend (Docs/ui_design_guide.md §16) — Active Projects
 * "entered" events: projects created within the trailing window that are
 * currently ACTIVE.
 */
function findActiveCreatedSince(since: Date): Promise<{ createdAt: Date }[]> {
  return prisma.project.findMany({
    where: { status: "ACTIVE", createdAt: { gte: since } },
    select: { createdAt: true },
  });
}

/**
 * M27 dashboard trend — Active Projects "exited" events: projects currently
 * ARCHIVED, approximating the archive timestamp via `updatedAt` (there's no
 * separate archivedAt column/history to read the real transition time from).
 */
function findArchivedSince(since: Date): Promise<{ updatedAt: Date }[]> {
  return prisma.project.findMany({
    where: { status: "ARCHIVED", updatedAt: { gte: since } },
    select: { updatedAt: true },
  });
}

export const projectRepository = {
  findMany,
  findById,
  create,
  update,
  findMaxSortOrder,
  findAdjacentActive,
  swapSortOrder,
  delete: deleteById,
  countInvoices,
  findMissingPreferredPaymentMethod,
  countActive,
  findRecentlyCreated,
  findByPreferredPaymentMethodIds,
  findActiveCreatedSince,
  findArchivedSince,
};
