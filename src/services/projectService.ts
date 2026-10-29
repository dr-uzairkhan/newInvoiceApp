import { projectRepository } from "@/repositories/projectRepository";
import type {
  ProjectWriteInput,
  ProjectWithRelations,
} from "@/repositories/projectRepository";
import { paymentMethodRepository } from "@/repositories/paymentMethodRepository";
import type { ProjectInput } from "@/lib/validation/project";
import type { Project, InvoicePeriodType } from "@/generated/prisma/client";
import {
  bucketCounts,
  daysAgo,
  TREND_WINDOW_DAYS,
  type StatTrend,
} from "@/lib/dashboardTrend";

/**
 * Thrown when a delete is blocked by a live foreign-key reference
 * (Docs/implementation_decisions.md §18). Callers (server actions) catch this
 * specifically to surface a friendly message instead of a raw DB error.
 */
export class ProjectDeletionBlockedError extends Error {
  constructor() {
    super(
      "This project still has invoices attached to it. Delete its invoices before deleting the project.",
    );
    this.name = "ProjectDeletionBlockedError";
  }
}

/**
 * Thrown when the submitted `preferredPaymentMethodId` doesn't belong to the
 * submitted `contractorId` (Docs/product_spec.md §1.3/Workflow 3). This is a
 * server-side re-check even though the UI's picker only ever offers the
 * contractor's own payment methods — never trust the client-submitted id.
 */
export class PreferredPaymentMethodMismatchError extends Error {
  constructor() {
    super(
      "The selected preferred payment method doesn't belong to the selected contractor.",
    );
    this.name = "PreferredPaymentMethodMismatchError";
  }
}

/**
 * Story 3.1/Docs/implementation_decisions.md §9/§22 — falls back to
 * auto-derived initials of the project name when Abbreviation is left blank.
 * A single-word name takes its first two characters (initials of one word
 * would otherwise collapse to a single, not-very-useful letter).
 */
export function deriveAbbreviation(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return words.map((word) => word[0].toUpperCase()).join("");
}

/** Empty-string optional fields become `null`, never left `undefined` — see partyService's equivalent. */
function nullIfEmpty(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

/**
 * The form's free-text "previous formats" (one per line or comma-separated)
 * → a deduped list that never repeats the current format.
 */
export function parsePreviousInvoiceNumberFormats(
  text: string | undefined,
  currentFormat: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of (text ?? "").split(/\r?\n|,/)) {
    const format = raw.trim();
    if (!format || format === currentFormat || seen.has(format)) continue;
    seen.add(format);
    result.push(format);
  }
  return result;
}

function toWriteInput(input: ProjectInput): ProjectWriteInput {
  const abbreviation =
    nullIfEmpty(input.abbreviation) ?? deriveAbbreviation(input.name);

  return {
    name: input.name,
    abbreviation,
    serviceDescription: nullIfEmpty(input.serviceDescription),
    clientId: input.clientId,
    contractorId: input.contractorId,
    preferredPaymentMethodId: nullIfEmpty(input.preferredPaymentMethodId),
    invoiceNumberFormat: input.invoiceNumberFormat,
    previousInvoiceNumberFormats: parsePreviousInvoiceNumberFormats(
      input.previousInvoiceNumberFormats,
      input.invoiceNumberFormat,
    ),
    invoicePeriodType: nullIfEmpty(
      input.invoicePeriodType,
    ) as InvoicePeriodType | null,
    currencyMode: input.currencyMode,
    displayCurrency: input.displayCurrency,
    referralCreditEnabled: input.referralCreditEnabled,
    referralCreditLabel: nullIfEmpty(input.referralCreditLabel),
    status: input.status,
  };
}

/** Workflow 3's verification step — never trust the client-submitted pairing. */
async function assertPreferredPaymentMethodBelongsToContractor(
  preferredPaymentMethodId: string | null,
  contractorId: string,
): Promise<void> {
  if (!preferredPaymentMethodId) return;

  const paymentMethod = await paymentMethodRepository.findById(
    preferredPaymentMethodId,
  );
  if (!paymentMethod || paymentMethod.partyId !== contractorId) {
    throw new PreferredPaymentMethodMismatchError();
  }
}

function list(filters?: {
  status?: "ACTIVE" | "ARCHIVED";
}): Promise<ProjectWithRelations[]> {
  return projectRepository.findMany(filters);
}

/** Dashboard (M10) — Active Projects stat. */
function countActive(): Promise<number> {
  return projectRepository.countActive();
}

/**
 * M27 dashboard trend (Docs/ui_design_guide.md §16) — Active Projects'
 * approximated trailing-30-day delta + sparkline. See
 * `src/lib/dashboardTrend.ts` for why this is an approximation, not an exact
 * history.
 */
async function getActiveProjectsTrend(): Promise<StatTrend> {
  const since = daysAgo(TREND_WINDOW_DAYS);
  const [entered, exited] = await Promise.all([
    projectRepository.findActiveCreatedSince(since),
    projectRepository.findArchivedSince(since),
  ]);
  const enteredTimestamps = entered.map((row) => row.createdAt);
  const exitedTimestamps = exited.map((row) => row.updatedAt);
  return {
    delta: enteredTimestamps.length - exitedTimestamps.length,
    sparklineCounts: bucketCounts([...enteredTimestamps, ...exitedTimestamps]),
  };
}

/** Dashboard (M10) — Needs Attention's missing-payment-method set (Story 8.3). */
function listMissingPreferredPaymentMethod(): Promise<ProjectWithRelations[]> {
  return projectRepository.findMissingPreferredPaymentMethod();
}

/** Dashboard (M10) — Recent Activity's "project created" events. */
function listRecentlyCreated(limit: number): Promise<ProjectWithRelations[]> {
  return projectRepository.findRecentlyCreated(limit);
}

export type ProjectRef = { id: string; name: string };

/**
 * M25 — Party detail page's "used by" tags per
 * payment method (clickable through to each project's detail page, so `id`
 * is carried alongside `name`). Returns { [paymentMethodId]: ProjectRef[] },
 * grouping server-side so the page/component don't each need their own reduce.
 */
async function listProjectRefsByPreferredPaymentMethod(
  paymentMethodIds: string[],
): Promise<Record<string, ProjectRef[]>> {
  const projects =
    await projectRepository.findByPreferredPaymentMethodIds(paymentMethodIds);
  const byPaymentMethodId: Record<string, ProjectRef[]> = {};
  for (const project of projects) {
    if (!project.preferredPaymentMethodId) continue;
    (byPaymentMethodId[project.preferredPaymentMethodId] ??= []).push({
      id: project.id,
      name: project.name,
    });
  }
  return byPaymentMethodId;
}

function getById(id: string): Promise<ProjectWithRelations | null> {
  return projectRepository.findById(id);
}

async function create(
  input: ProjectInput,
  createdByUserId: string | null = null,
): Promise<Project> {
  const data = toWriteInput(input);
  await assertPreferredPaymentMethodBelongsToContractor(
    data.preferredPaymentMethodId,
    data.contractorId,
  );
  const maxSortOrder = await projectRepository.findMaxSortOrder();
  return projectRepository.create(
    data,
    createdByUserId,
    (maxSortOrder ?? 0) + 1,
  );
}

/**
 * Dashboard up/down arrows — moves a project one slot within the ACTIVE
 * list by swapping `sortOrder` with its nearest ACTIVE neighbor. Silently a
 * no-op if the project is missing/ARCHIVED, or already at that end of the
 * list — the UI only ever offers this on a visible ACTIVE row, so those
 * cases shouldn't occur in practice, and there's nothing more useful to do
 * than nothing. This same `sortOrder` also drives the Projects page
 * card/table order, so the move is visible there too.
 */
async function move(id: string, direction: "up" | "down"): Promise<void> {
  const project = await projectRepository.findById(id);
  if (!project || project.status !== "ACTIVE") return;

  const neighbor = await projectRepository.findAdjacentActive(
    project.sortOrder,
    direction,
  );
  if (!neighbor) return;

  await projectRepository.swapSortOrder(
    project.id,
    project.sortOrder,
    neighbor.id,
    neighbor.sortOrder,
  );
}

async function update(id: string, input: ProjectInput): Promise<Project> {
  const data = toWriteInput(input);
  await assertPreferredPaymentMethodBelongsToContractor(
    data.preferredPaymentMethodId,
    data.contractorId,
  );
  // A format change never orphans the numbers issued under the old one: the
  // outgoing format joins the recognised history automatically (most recent
  // first), unless the admin already listed it.
  const existing = await projectRepository.findById(id);
  if (
    existing &&
    existing.invoiceNumberFormat !== data.invoiceNumberFormat &&
    !data.previousInvoiceNumberFormats.includes(existing.invoiceNumberFormat)
  ) {
    data.previousInvoiceNumberFormats = [
      existing.invoiceNumberFormat,
      ...data.previousInvoiceNumberFormats,
    ];
  }
  return projectRepository.update(id, data);
}

/** Story 3.4 — blocked while the project has any Invoice rows. */
async function isDeletable(id: string): Promise<boolean> {
  const invoiceCount = await projectRepository.countInvoices(id);
  return invoiceCount === 0;
}

async function deleteProject(id: string): Promise<void> {
  if (!(await isDeletable(id))) {
    throw new ProjectDeletionBlockedError();
  }
  await projectRepository.delete(id);
}

export const projectService = {
  list,
  getById,
  create,
  update,
  move,
  isDeletable,
  delete: deleteProject,
  countActive,
  getActiveProjectsTrend,
  listMissingPreferredPaymentMethod,
  listRecentlyCreated,
  listProjectRefsByPreferredPaymentMethod,
};
