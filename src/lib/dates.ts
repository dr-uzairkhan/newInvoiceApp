/**
 * The four supported {date} token formats for invoice numbers — two field
 * orderings, each with a hyphen or slash separator. There is no separate
 * Project.dateFormat schema column — instead, the format is chosen inline
 * in the invoiceNumberFormat string itself via `{date:MM-DD-YYYY}` /
 * `{date:DD-MM-YYYY}` / `{date:MM/DD/YYYY}` / `{date:DD/MM/YYYY}`,
 * defaulting to MM-DD-YYYY for a bare `{date}`. Resolved from UTC calendar
 * fields: the date is an invoice issue date (UTC midnight), never a wall clock.
 */
export type InvoiceDateFormat =
  "MM-DD-YYYY" | "DD-MM-YYYY" | "MM/DD/YYYY" | "DD/MM/YYYY";

export function formatDateToken(
  date: Date,
  format: InvoiceDateFormat = "MM-DD-YYYY",
): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  const separator = format.includes("/") ? "/" : "-";
  const parts = format.startsWith("DD") ? [dd, mm, yyyy] : [mm, dd, yyyy];
  return parts.join(separator);
}

/** `<input type="date">` value (yyyy-mm-dd) for a stored `@db.Date` value. */
export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Human-friendly display date for list/detail views. */
export function formatDisplayDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Compact month/day date (no year) for space-constrained widgets — card facts, activity timelines. */
export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * "today" as a UTC-midnight Date, matching how
 * `@db.Date` columns are stored/read. Shared by isOverdue and, from M10, the
 * invoiceRepository.findOverdueCandidates query so both use one definition
 * of "past due" instead of two copies of the same date math.
 */
export function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * OVERDUE is `status === SENT && dueDate < today`,
 * compared as UTC dates rather than against the server's local wall-clock time.
 */
export function isOverdue(dueDate: Date): boolean {
  return dueDate.getTime() < startOfTodayUTC().getTime();
}

/** Adds `days` (may be negative) to a UTC-midnight `@db.Date` value, safe from DST drift since there's no local timezone involved. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Midnight UTC on the 1st of the current calendar month — Invoices list "Paid this month" stat. */
export function startOfMonthUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
