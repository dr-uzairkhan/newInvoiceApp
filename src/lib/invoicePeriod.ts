import type { InvoicePeriodType } from "@/generated/prisma/client";
import { formatDisplayDate } from "@/lib/dates";

/**
 * The one sentence the invoice document prints for a billing period, when
 * the invoice opts in (`showPeriodLine`). Lives here, not in
 * `documentService`, so the create/edit form can preview the exact text
 * beside its checkbox without pulling repositories into a client bundle.
 */
export function buildPeriodLine(
  periodStart: Date | null,
  periodEnd: Date | null,
): string | null {
  if (!periodStart || !periodEnd) return null;
  return `Covers services rendered ${formatDisplayDate(periodStart)} – ${formatDisplayDate(periodEnd)}.`;
}

/**
 * M19.2a — labels for the ProjectForm (Billing setup tab) dropdown. Each
 * value's math (see computeDueDate) is fixed and not user-configurable.
 */
export const INVOICE_PERIOD_LABELS: Record<InvoicePeriodType, string> = {
  WEEKLY: "Weekly (7 days)",
  SEMI_MONTHLY: "Semi-monthly (15 days)",
  MONTHLY: "Monthly (1 month)",
};

/** Last day of the given UTC month (0-indexed, may be passed as 12 to mean "next January"). */
function daysInUtcMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/**
 * M19.2b — computes a period-based due date from an
 * issue date. WEEKLY/SEMI_MONTHLY are flat day-adds (+7/+15); MONTHLY is
 * calendar-month arithmetic that clamps to the target month's last day
 * (e.g. Jan 31 -> Feb 28/29) rather than overflowing into the month after
 * (native `Date.setMonth` would turn Jan 31 + 1 month into Mar 3rd) — never a
 * flat 30-day add. Both `issueDate` and the return value are `yyyy-mm-dd`
 * `<input type="date">` strings; math is done via UTC-anchored Date objects
 * to avoid local-timezone drift, matching `dates.ts`'s convention.
 */
export function computeDueDate(
  issueDate: string,
  periodType: InvoicePeriodType,
): string {
  const [year, month, day] = issueDate.split("-").map(Number);

  if (periodType === "WEEKLY" || periodType === "SEMI_MONTHLY") {
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + (periodType === "WEEKLY" ? 7 : 15));
    return date.toISOString().slice(0, 10);
  }

  const targetMonthIndex0 = month - 1 + 1;
  const targetYear = year + Math.floor(targetMonthIndex0 / 12);
  const normalizedMonthIndex0 = ((targetMonthIndex0 % 12) + 12) % 12;
  const clampedDay = Math.min(
    day,
    daysInUtcMonth(targetYear, normalizedMonthIndex0),
  );
  return new Date(Date.UTC(targetYear, normalizedMonthIndex0, clampedDay))
    .toISOString()
    .slice(0, 10);
}
