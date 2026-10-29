import { formatDateToken, type InvoiceDateFormat } from "@/lib/dates";

/**
 * Shared token grammar for Project.invoiceNumberFormat — the single source
 * of truth for both real generation (invoiceNumberService.ts's
 * generateInvoiceNumber) and the format field's discoverability popover
 * (InvoiceNumberFormatHelp.tsx), so the two can never drift out of sync.
 *
 * Tokens: `{abbreviation}`; `{number}` with an optional reset scope
 * (`{number:month}` / `{number:year}`, see `getNumberScope`); `{year}`,
 * `{year_short}`; `{month}` (two digits) or a month name
 * (`{month:MMM}` → OCT, `{month:Mmm}` → Oct, `{month:MMMM}` → OCTOBER);
 * `{day}`; `{date}` with an optional shape qualifier.
 *
 * Every date-derived token is resolved from the invoice's **issue date**
 * (UTC calendar fields, since `@db.Date` values and `<input type="date">`
 * strings both round-trip as UTC midnight), never from the wall clock —
 * a backdated invoice must carry its own month, not the day it was typed.
 */
export const INVOICE_NUMBER_TOKEN_PATTERN =
  /\{abbreviation\}|\{number(?::(?:month|year))?\}|\{year_short\}|\{year\}|\{month(?::(?:MMM|Mmm|MMMM))?\}|\{day\}|\{date(?::(?:MM-DD-YYYY|DD-MM-YYYY|MM\/DD\/YYYY|DD\/MM\/YYYY))?\}/g;

/** How `{number}` resets: never (`project`), each calendar month, or each calendar year. */
export type InvoiceNumberScope = "project" | "month" | "year";

export type InvoiceNumberTokenValues = {
  abbreviation: string;
  number: string;
  /** The invoice's issue date (or today, for a preview with no date yet). */
  date: Date;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function monthName(date: Date, shape: "MMM" | "Mmm" | "MMMM"): string {
  const name = MONTH_NAMES[date.getUTCMonth()];
  if (shape === "MMMM") return name.toUpperCase();
  const short = name.slice(0, 3);
  return shape === "MMM" ? short.toUpperCase() : short;
}

/** The reset scope of the format's `{number}` token — `project` when the token is bare or absent. */
export function getNumberScope(format: string): InvoiceNumberScope {
  const match = format.match(/\{number(?::(month|year))?\}/);
  if (!match) return "project";
  return (match[1] as "month" | "year" | undefined) ?? "project";
}

/** Pure substitution — no padding/sequence logic here, callers supply the already-resolved `number` string. */
export function applyInvoiceNumberTokens(
  format: string,
  values: InvoiceNumberTokenValues,
): string {
  const { date } = values;
  return format.replace(INVOICE_NUMBER_TOKEN_PATTERN, (token: string) => {
    if (token === "{abbreviation}") return values.abbreviation;
    if (token.startsWith("{number")) return values.number;
    if (token === "{year_short}") return String(date.getUTCFullYear()).slice(-2);
    if (token === "{year}") return String(date.getUTCFullYear());
    if (token === "{month}")
      return String(date.getUTCMonth() + 1).padStart(2, "0");
    if (token.startsWith("{month:"))
      return monthName(date, token.slice(7, -1) as "MMM" | "Mmm" | "MMMM");
    if (token === "{day}") return String(date.getUTCDate()).padStart(2, "0");
    const dateShape =
      token === "{date}"
        ? "MM-DD-YYYY"
        : (token.slice(6, -1) as InvoiceDateFormat);
    return formatDateToken(date, dateShape);
  });
}

export type InvoiceNumberTokenInfo = {
  token: string;
  description: string;
  /** Resolved against `date` (or today) so the reference popover always shows a currently-accurate sample. */
  sample: string;
};

/** Drives the format field's help popover — every row here is a real, generator-recognized token. */
export function getInvoiceNumberTokenReference(
  date: Date = new Date(),
): InvoiceNumberTokenInfo[] {
  const resolve = (token: string) =>
    applyInvoiceNumberTokens(token, { abbreviation: "ACM", number: "03", date });
  return [
    {
      token: "{abbreviation}",
      description: "Project's short code, auto-derived from the name if unset",
      sample: "ACM",
    },
    {
      token: "{number}",
      description:
        "Sequential invoice number, zero-padded to at least 2 digits",
      sample: "03",
    },
    {
      token: "{number:month}",
      description: "Sequence that restarts at 01 each calendar month",
      sample: "03",
    },
    {
      token: "{number:year}",
      description: "Sequence that restarts at 01 each calendar year",
      sample: "03",
    },
    {
      token: "{year}",
      description: "Issue date's 4-digit year",
      sample: resolve("{year}"),
    },
    {
      token: "{year_short}",
      description: "Issue date's year, last 2 digits",
      sample: resolve("{year_short}"),
    },
    {
      token: "{month}",
      description: "Issue date's month, zero-padded",
      sample: resolve("{month}"),
    },
    {
      token: "{month:MMM}",
      description: "Month name, 3 letters, upper case",
      sample: resolve("{month:MMM}"),
    },
    {
      token: "{month:Mmm}",
      description: "Month name, 3 letters, capitalised",
      sample: resolve("{month:Mmm}"),
    },
    {
      token: "{month:MMMM}",
      description: "Full month name, upper case",
      sample: resolve("{month:MMMM}"),
    },
    {
      token: "{day}",
      description: "Issue date's day of month, zero-padded",
      sample: resolve("{day}"),
    },
    {
      token: "{date}",
      description: "Issue date, defaults to MM-DD-YYYY",
      sample: resolve("{date}"),
    },
    {
      token: "{date:MM-DD-YYYY}",
      description: "Pick the shape: month-day-year",
      sample: resolve("{date:MM-DD-YYYY}"),
    },
    {
      token: "{date:DD-MM-YYYY}",
      description: "Pick the shape: day-month-year",
      sample: resolve("{date:DD-MM-YYYY}"),
    },
    {
      token: "{date:MM/DD/YYYY}",
      description: "Pick the shape: month-day-year, slashes",
      sample: resolve("{date:MM/DD/YYYY}"),
    },
    {
      token: "{date:DD/MM/YYYY}",
      description: "Pick the shape: day-month-year, slashes",
      sample: resolve("{date:DD/MM/YYYY}"),
    },
  ];
}
