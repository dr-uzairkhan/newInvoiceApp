import { deriveAbbreviation } from "@/services/projectService";
import {
  INVOICE_NUMBER_TOKEN_PATTERN as TOKEN_PATTERN,
  applyInvoiceNumberTokens,
  getNumberScope,
} from "@/lib/invoiceNumberFormat";

/**
 * Invoice number generation. The token grammar (`{abbreviation}`,
 * `{number}` / `{number:month}` / `{number:year}`, `{year}`, `{year_short}`,
 * `{month}` / `{month:MMM|Mmm|MMMM}`, `{day}`, `{date[:shape]}`) and the
 * substitution logic live in `src/lib/invoiceNumberFormat.ts`, shared with
 * the format field's discoverability popover so the two can't drift apart.
 *
 * The sequence is recovered from the project's existing numbers rather than
 * a counter column (`Docs/implementation_decisions.md` §9): every existing
 * number is parsed against the *current* format, and the next `{number}` is
 * max(parsed) + 1. A number that fits a previous format of the project
 * (`Project.previousInvoiceNumberFormats`) is recognised as history but is
 * never counted — a format change restarts the sequence by design. With
 * `{number:month}` / `{number:year}` only invoices whose issue date falls in
 * the same calendar month / year as the one being numbered are counted.
 */

/** What the sequence computation needs per existing invoice. */
export type ExistingInvoiceNumber = {
  invoiceNumber: string;
  issueDate: Date;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a regex that matches a number generated from `format`, capturing
 * the `{number}` token's value (any scope) and treating every other token as
 * a non-greedy wildcard.
 */
function buildFormatRegex(format: string): RegExp {
  let pattern = "";
  let lastIndex = 0;
  for (const match of format.matchAll(TOKEN_PATTERN)) {
    pattern += escapeRegExp(format.slice(lastIndex, match.index));
    pattern += match[0].startsWith("{number") ? "(\\d+)" : ".*?";
    lastIndex = match.index! + match[0].length;
  }
  pattern += escapeRegExp(format.slice(lastIndex));
  return new RegExp(`^${pattern}$`);
}

/** Structural fit only — true when `invoiceNumber` could have been generated from `format`. */
export function fitsFormat(invoiceNumber: string, format: string): boolean {
  return buildFormatRegex(format).test(invoiceNumber);
}

/** True when the number fits any of the given formats (a project's current one plus its previous ones). */
export function fitsAnyFormat(
  invoiceNumber: string,
  formats: readonly string[],
): boolean {
  return formats.some((format) => fitsFormat(invoiceNumber, format));
}

/**
 * The `{number}` value parsed out of `invoiceNumber` against `format`, or
 * `null` when the number doesn't structurally fit it at all (e.g. the
 * format changed since it was issued, or it was typed by hand).
 */
export function extractSequence(
  invoiceNumber: string,
  format: string,
): number | null {
  const match = invoiceNumber.match(buildFormatRegex(format));
  if (!match || match[1] === undefined) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function sameUtcMonth(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}

function sameUtcYear(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear();
}

/**
 * Next sequence is max(existing sequence) + 1, never a row count — so a
 * deleted invoice's number is never reissued. Existing invoices are scoped
 * by *their own issue dates* (not by re-parsing month text out of their
 * numbers) when the format resets monthly/yearly, so two Octobers a year
 * apart never share a sequence even if the format has no year in it.
 */
export function nextSequence(
  existing: readonly ExistingInvoiceNumber[],
  format: string,
  issueDate: Date,
): number {
  const scope = getNumberScope(format);
  const inScope = existing.filter((row) => {
    if (scope === "month") return sameUtcMonth(row.issueDate, issueDate);
    if (scope === "year") return sameUtcYear(row.issueDate, issueDate);
    return true;
  });
  const sequences = inScope
    .map((row) => extractSequence(row.invoiceNumber, format))
    .filter((value): value is number => value !== null);
  return sequences.length === 0 ? 1 : Math.max(...sequences) + 1;
}

export type GenerateInvoiceNumberInput = {
  project: {
    abbreviation: string | null;
    name: string;
    invoiceNumberFormat: string;
  };
  existingInvoices: readonly ExistingInvoiceNumber[];
  /** The invoice's issue date — drives every date token and the month/year sequence scope. Defaults to today. */
  issueDate?: Date;
};

/** Zero-padded to 2 digits by default, mirroring the reference script's `.zfill(2)`. */
function padSequence(sequence: number): string {
  return String(sequence).padStart(2, "0");
}

export function generateInvoiceNumber({
  project,
  existingInvoices,
  issueDate = new Date(),
}: GenerateInvoiceNumberInput): string {
  const abbreviation =
    project.abbreviation && project.abbreviation.length > 0
      ? project.abbreviation
      : deriveAbbreviation(project.name);
  const paddedNumber = padSequence(
    nextSequence(existingInvoices, project.invoiceNumberFormat, issueDate),
  );

  return applyInvoiceNumberTokens(project.invoiceNumberFormat, {
    abbreviation,
    number: paddedNumber,
    date: issueDate,
  });
}
