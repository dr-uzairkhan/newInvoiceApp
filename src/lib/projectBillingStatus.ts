import type { InvoiceListItem } from "@/repositories/invoiceRepository";
import type { ProjectWithRelations } from "@/repositories/projectRepository";
import type { AlertScheduleWithProject } from "@/repositories/projectAlertScheduleRepository";
import { computeDueDate } from "@/lib/invoicePeriod";
import {
  isSendInvoiceSchedule,
  resolveNextOccurrence,
  resolveScheduledDayThisMonth,
} from "@/lib/alertScheduleFiring";
import { toDateInputValue } from "@/lib/dates";

/**
 * Per-project billing rows (Projects page views, project Overview tab, the
 * dashboard planner's "Next billing" dates) — pure aggregation over data
 * already fetched for those pages (all invoices, active projects, fired and
 * live alert schedules), rather than bespoke
 * Prisma groupBys per widget. Matches the existing lightweight-aggregation
 * style (e.g. buildPriorityFeed).
 */

export type LastInvoiceInfo = {
  total: string;
  currency: string;
  issueDate: Date;
};

/** Most-recently-issued invoice (any status) per project id. */
export function buildLastInvoiceByProjectId(
  allInvoices: InvoiceListItem[],
): Map<string, LastInvoiceInfo> {
  const byProject = new Map<string, LastInvoiceInfo>();
  for (const invoice of allInvoices) {
    const existing = byProject.get(invoice.projectId);
    if (
      !existing ||
      invoice.issueDate.getTime() > existing.issueDate.getTime()
    ) {
      byProject.set(invoice.projectId, {
        total: invoice.total.toString(),
        currency: invoice.currency,
        issueDate: invoice.issueDate,
      });
    }
  }
  return byProject;
}

export type CoveredPeriod = { start: Date; end: Date };

/**
 * M39 — the period covered by a project's most recently issued SENT/PAID
 * invoice (DRAFT doesn't count — nothing's final yet; VOID doesn't count —
 * it was never really billed). `null` per project if that invoice has no
 * `periodStart`/`periodEnd` set (pre-M39 invoices, or a non-period-based
 * flat fee) — deliberately not falling back to only-one-of-the-two-set,
 * since a half-period is more confusing to show than nothing.
 */
export function buildLastCoveredPeriodByProjectId(
  allInvoices: InvoiceListItem[],
): Map<string, CoveredPeriod> {
  const byProject = new Map<
    string,
    { issueDate: Date; period: CoveredPeriod }
  >();
  for (const invoice of allInvoices) {
    if (invoice.status !== "SENT" && invoice.status !== "PAID") continue;
    if (!invoice.periodStart || !invoice.periodEnd) continue;
    const existing = byProject.get(invoice.projectId);
    if (
      !existing ||
      invoice.issueDate.getTime() > existing.issueDate.getTime()
    ) {
      byProject.set(invoice.projectId, {
        issueDate: invoice.issueDate,
        period: { start: invoice.periodStart, end: invoice.periodEnd },
      });
    }
  }
  return new Map(
    Array.from(byProject.entries()).map(([projectId, { period }]) => [
      projectId,
      period,
    ]),
  );
}

const BILLING_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  SEMI_MONTHLY: "Semi-monthly",
  MONTHLY: "Monthly",
};

/** Projects with no fixed invoicePeriodType are billed ad hoc — "Milestone" matches the mock's label for this case. */
function billingLabelFor(project: ProjectWithRelations): string {
  if (!project.invoicePeriodType) return "Milestone";
  return BILLING_LABELS[project.invoicePeriodType] ?? "Milestone";
}

export type BillingStatusTone =
  "overdue" | "prepare" | "draft" | "setupIncomplete" | "upcoming" | "positive";

/** Shared left-border accent classes for billing-status project cards (ProjectCardGrid, InvoiceProjectPicker). */
export const BILLING_TONE_ACCENT: Record<BillingStatusTone, string> = {
  overdue: "bg-[var(--status-overdue-text)]",
  prepare: "bg-[var(--status-sent-text)]",
  draft: "bg-brand",
  setupIncomplete: "bg-[var(--status-sent-text)]",
  upcoming: "bg-[var(--status-upcoming-text)]",
  positive: "bg-[var(--status-paid-text)]",
};

/** Shared status-pill classes for billing-status project cards (ProjectCardGrid, InvoiceProjectPicker). */
export const BILLING_TONE_PILL: Record<BillingStatusTone, string> = {
  overdue: "bg-[var(--status-overdue-bg)] text-[var(--status-overdue-text)]",
  prepare: "bg-[var(--status-sent-bg)] text-[var(--status-sent-text)]",
  draft: "bg-brand-light text-brand",
  setupIncomplete: "bg-[var(--status-sent-bg)] text-[var(--status-sent-text)]",
  upcoming: "bg-[var(--status-upcoming-bg)] text-[var(--status-upcoming-text)]",
  positive: "bg-[var(--status-paid-bg)] text-[var(--status-paid-text)]",
};

export type ProjectBillingRow = {
  projectId: string;
  projectName: string;
  clientName: string;
  billingLabel: string;
  lastInvoiceDate: Date | null;
  lastInvoiceTotal: string | null;
  lastInvoiceCurrency: string | null;
  /** M39 — the last SENT/PAID invoice's covered period, `null` if that invoice never had one set. */
  lastCoveredPeriod: CoveredPeriod | null;
  nextInvoiceDate: Date | null;
  exposureTotal: string;
  exposureCurrency: string;
  exposureCount: number;
  /** Count of SENT invoices past their due date — 0 when the project isn't overdue. */
  overdueCount: number;
  /** Count of DRAFT invoices for the project. */
  draftCount: number;
  statusLabel: string;
  statusTone: BillingStatusTone;
};

/**
 * Next expected billing trigger for a project, in priority order: (1) a
 * *currently fired* alert schedule — shown as this month's resolved day,
 * i.e. "due now," not pushed out to its next recurrence; (2) failing that,
 * the earliest `resolveNextOccurrence` across the project's other
 * configured schedules (recurring or one-time-uncleared) — an explicit,
 * user-set date always outranks the generic estimate below; (3) failing
 * that, an `invoicePeriodType` calc off the last invoice, an estimate with
 * no real schedule backing it. `null` if none of the three apply.
 */
function resolveNextInvoiceDate(
  project: ProjectWithRelations,
  firedSchedule: AlertScheduleWithProject | undefined,
  liveSchedules: AlertScheduleWithProject[] | undefined,
  lastInvoice: LastInvoiceInfo | undefined,
  now: Date,
): Date | null {
  if (firedSchedule) {
    const day = resolveScheduledDayThisMonth(firedSchedule.dayOfMonth, now);
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
  }
  if (liveSchedules && liveSchedules.length > 0) {
    const occurrences = liveSchedules
      .map((schedule) => resolveNextOccurrence(schedule, now))
      .filter((date): date is Date => date !== null);
    if (occurrences.length > 0) {
      return occurrences.reduce((earliest, date) =>
        date.getTime() < earliest.getTime() ? date : earliest,
      );
    }
  }
  if (project.invoicePeriodType && lastInvoice) {
    const next = computeDueDate(
      toDateInputValue(lastInvoice.issueDate),
      project.invoicePeriodType,
    );
    const [year, month, day] = next.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  return null;
}

export function buildProjectBillingRows(input: {
  activeProjects: ProjectWithRelations[];
  allInvoices: InvoiceListItem[];
  overdueInvoices: InvoiceListItem[];
  staleDrafts: InvoiceListItem[];
  /** Filtered internally to isSendInvoiceSchedule — a fired reminder unrelated to invoicing never drives billing status. */
  firedAlertSchedules: AlertScheduleWithProject[];
  /**
   * Every schedule that could still occur, fired or not — feeds
   * resolveNextInvoiceDate's schedule-wins tier. Optional: existing callers
   * that don't pass it just fall through to the invoicePeriodType estimate,
   * same as before this was added. Also filtered internally to
   * isSendInvoiceSchedule, same reasoning as firedAlertSchedules above.
   */
  liveAlertSchedules?: AlertScheduleWithProject[];
  /** M36-adjacent — Project billing health view's "Setup incomplete" tone. */
  missingPaymentMethodProjects?: ProjectWithRelations[];
  /** M36-adjacent — Project billing health view's "Upcoming" tone. */
  dueSoonInvoices?: InvoiceListItem[];
  now?: Date;
}): ProjectBillingRow[] {
  const now = input.now ?? new Date();
  const lastInvoiceByProjectId = buildLastInvoiceByProjectId(input.allInvoices);
  const lastCoveredPeriodByProjectId = buildLastCoveredPeriodByProjectId(
    input.allInvoices,
  );
  const overdueByProjectId = new Map<string, InvoiceListItem>();
  const overdueCountByProjectId = new Map<string, number>();
  for (const invoice of input.overdueInvoices) {
    if (!overdueByProjectId.has(invoice.projectId)) {
      overdueByProjectId.set(invoice.projectId, invoice);
    }
    overdueCountByProjectId.set(
      invoice.projectId,
      (overdueCountByProjectId.get(invoice.projectId) ?? 0) + 1,
    );
  }
  const staleDraftProjectIds = new Set(
    input.staleDrafts.map((invoice) => invoice.projectId),
  );
  const firedScheduleByProjectId = new Map<string, AlertScheduleWithProject>();
  for (const schedule of input.firedAlertSchedules) {
    if (!isSendInvoiceSchedule(schedule)) continue;
    if (!firedScheduleByProjectId.has(schedule.project.id)) {
      firedScheduleByProjectId.set(schedule.project.id, schedule);
    }
  }
  const liveSchedulesByProjectId = new Map<
    string,
    AlertScheduleWithProject[]
  >();
  for (const schedule of input.liveAlertSchedules ?? []) {
    if (!isSendInvoiceSchedule(schedule)) continue;
    const existing = liveSchedulesByProjectId.get(schedule.project.id);
    if (existing) {
      existing.push(schedule);
    } else {
      liveSchedulesByProjectId.set(schedule.project.id, [schedule]);
    }
  }
  const missingPaymentMethodProjectIds = new Set(
    (input.missingPaymentMethodProjects ?? []).map((project) => project.id),
  );
  const dueSoonProjectIds = new Set(
    (input.dueSoonInvoices ?? []).map((invoice) => invoice.projectId),
  );

  return input.activeProjects.map((project) => {
    const lastInvoice = lastInvoiceByProjectId.get(project.id);
    const overdueInvoice = overdueByProjectId.get(project.id);
    const firedSchedule = firedScheduleByProjectId.get(project.id);
    const outstandingInvoices = input.allInvoices.filter(
      (invoice) =>
        invoice.projectId === project.id && invoice.status === "SENT",
    );
    const exposureTotal = outstandingInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.total),
      0,
    );
    const draftCount = input.allInvoices.filter(
      (invoice) =>
        invoice.projectId === project.id && invoice.status === "DRAFT",
    ).length;

    let statusLabel = "On track";
    let statusTone: BillingStatusTone = "positive";
    if (overdueInvoice) {
      const days = Math.floor(
        (now.getTime() - overdueInvoice.dueDate.getTime()) /
          (24 * 60 * 60 * 1000),
      );
      statusLabel = `${days} ${days === 1 ? "day" : "days"} overdue`;
      statusTone = "overdue";
    } else if (firedSchedule) {
      statusLabel = "Invoice due";
      statusTone = "prepare";
    } else if (staleDraftProjectIds.has(project.id)) {
      statusLabel = "Review draft";
      statusTone = "draft";
    } else if (missingPaymentMethodProjectIds.has(project.id)) {
      statusLabel = "Setup incomplete";
      statusTone = "setupIncomplete";
    } else if (dueSoonProjectIds.has(project.id)) {
      statusLabel = "Payment due soon";
      statusTone = "upcoming";
    }

    return {
      projectId: project.id,
      projectName: project.name,
      clientName: project.client.name,
      billingLabel: billingLabelFor(project),
      lastInvoiceDate: lastInvoice?.issueDate ?? null,
      lastInvoiceTotal: lastInvoice?.total ?? null,
      lastInvoiceCurrency: lastInvoice?.currency ?? null,
      lastCoveredPeriod: lastCoveredPeriodByProjectId.get(project.id) ?? null,
      nextInvoiceDate: resolveNextInvoiceDate(
        project,
        firedSchedule,
        liveSchedulesByProjectId.get(project.id),
        lastInvoice,
        now,
      ),
      exposureTotal: exposureTotal.toString(),
      exposureCurrency: lastInvoice?.currency ?? project.displayCurrency,
      exposureCount: outstandingInvoices.length,
      overdueCount: overdueCountByProjectId.get(project.id) ?? 0,
      draftCount,
      statusLabel,
      statusTone,
    };
  });
}

