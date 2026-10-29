/**
 * M29 — pure firing logic for ProjectAlertSchedule, no DB dependency.
 * UTC-anchored, matching invoicePeriod.ts's clamping convention (avoids
 * local-timezone drift). `clearedAt` is the entire "already fired" state
 * machine: for a recurring schedule, cleared-this-month hides it and
 * cleared-in-an-earlier-month re-arms it automatically; for a one-time
 * schedule, any non-null value hides it permanently regardless of date.
 */

/** Last day of the given UTC month (0-indexed, may be passed as 12 to mean "next January"). */
function daysInUtcMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** The day this month a schedule's `dayOfMonth` resolves to, clamped to the month's last day (e.g. 31 -> Feb 28/29). */
export function resolveScheduledDayThisMonth(
  dayOfMonth: number,
  now: Date,
): number {
  return Math.min(
    dayOfMonth,
    daysInUtcMonth(now.getUTCFullYear(), now.getUTCMonth()),
  );
}

function isSameUtcMonth(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}

export type AlertFiringInput = {
  dayOfMonth: number;
  recurring: boolean;
  clearedAt: Date | null;
  createdAt: Date;
};

/**
 * M39-adjacent — a project can have `ProjectAlertSchedule` rows for
 * reminders unrelated to invoicing (e.g. "Pick up dry cleaning"),
 * alongside ones that really do mean "go send an invoice." Only a schedule
 * labeled exactly "Send Invoice" (case-insensitive, trimmed) counts as the
 * latter — every "does this project need an invoice" computation (fired
 * status, next-invoice-date estimates, the dashboard's "prepare" action
 * items) must filter to this before using a schedule. General-purpose
 * surfaces (the project page's own "Next alert" card, the Alert Schedules
 * management list, the Projects-list indicator) intentionally do NOT filter — those are
 * about reminders in general, not specifically invoicing.
 */
export function isSendInvoiceSchedule(input: {
  label: string | null;
}): boolean {
  return input.label?.trim().toLowerCase() === "send invoice";
}

/**
 * Project detail Overview tab's "Next alert" health card — the next date
 * this schedule will occur, or `null` for a one-time schedule whose day has
 * already passed this month (it's done; a recurring schedule always has a
 * next occurrence, this month or next).
 */
export function resolveNextOccurrence(
  input: Pick<AlertFiringInput, "dayOfMonth" | "recurring">,
  now: Date = new Date(),
): Date | null {
  const dayThisMonth = resolveScheduledDayThisMonth(input.dayOfMonth, now);
  if (now.getUTCDate() <= dayThisMonth) {
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dayThisMonth),
    );
  }
  if (!input.recurring) return null;
  const nextMonthIndex0 = now.getUTCMonth() + 1;
  const nextYear = now.getUTCFullYear() + Math.floor(nextMonthIndex0 / 12);
  const normalizedMonthIndex0 = ((nextMonthIndex0 % 12) + 12) % 12;
  const nextMonthAnchor = new Date(
    Date.UTC(nextYear, normalizedMonthIndex0, 1),
  );
  const dayNextMonth = resolveScheduledDayThisMonth(
    input.dayOfMonth,
    nextMonthAnchor,
  );
  return new Date(Date.UTC(nextYear, normalizedMonthIndex0, dayNextMonth));
}

/**
 * Whether this alert schedule is currently "fired and uncleared."
 * Recurring alerts auto re-arm every month; one-time alerts, once cleared,
 * never fire again regardless of any future date.
 */
export function isAlertCurrentlyFired(
  input: AlertFiringInput,
  now: Date = new Date(),
): boolean {
  const scheduledDay = resolveScheduledDayThisMonth(input.dayOfMonth, now);
  const dayHasArrived = now.getUTCDate() >= scheduledDay;
  if (!dayHasArrived) return false;

  // A schedule created after this month's occurrence date has already
  // passed shouldn't retroactively fire for it (e.g. creating a "7th of the
  // month" alert on the 30th) — wait for the next real occurrence instead.
  // Only suppresses the creation month's own occurrence; once `now` rolls
  // into a later month this no longer applies.
  if (
    isSameUtcMonth(input.createdAt, now) &&
    input.createdAt.getUTCDate() > scheduledDay
  ) {
    return false;
  }

  if (!input.recurring) {
    return input.clearedAt === null;
  }

  if (input.clearedAt === null) return true;
  return !isSameUtcMonth(input.clearedAt, now);
}
