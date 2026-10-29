import Link from "next/link";
import { ArrowRight, MessageSquare } from "lucide-react";
import { StatusBadge } from "@/components/invoice/StatusBadge";
import { InvoiceRowActionsMenu } from "@/components/invoice/InvoiceRowActionsMenu";
import { formatCurrency } from "@/lib/currency";
import { formatDisplayDate, formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { InvoiceTableRow } from "@/lib/invoiceTableRow";

/**
 * Invoices list — M27 v2 redesign (design_handoff_dashboard_v2/README.md §3,
 * Docs/ui_design_guide.md §4). Two independent layouts, not one table that
 * squeezes: a dark-header grid table at `≥1024px`, replaced entirely by
 * stacked cards below that — same breakpoint the nav shell uses. Deliberately
 * bespoke markup (not the shared `DataTable`/`ui/table.tsx` primitives) —
 * PartyTable.tsx (milestone 6) now follows the same convention.
 */
const DESKTOP_GRID_WITH_PROJECT =
  "grid-cols-[1.1fr_1.3fr_1.3fr_0.9fr_0.9fr_0.9fr_120px_36px]";
const DESKTOP_GRID_WITHOUT_PROJECT =
  "grid-cols-[1.1fr_1.3fr_0.9fr_0.9fr_0.9fr_120px_36px]";

/** The stretched click target that opens the invoice — shared by the desktop row and mobile card. */
function RowOpenLink({ href, ariaLabel }: { href: string; ariaLabel: string }) {
  return (
    <Link
      href={href}
      className="absolute inset-0 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      aria-label={ariaLabel}
    />
  );
}

/** §31 — comment count beside the number; the newest comment shows on hover. Sits above the row overlay so the title tooltip is reachable. */
function CommentBadge({ row }: { row: InvoiceTableRow }) {
  if (row.commentCount === 0) return null;
  return (
    <span
      className="relative z-10 inline-flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground"
      title={row.latestComment ?? undefined}
      aria-label={`${row.commentCount} comments`}
    >
      <MessageSquare className="h-3 w-3" />
      {row.commentCount}
    </span>
  );
}

const NAME_LINK_FOCUS =
  "focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none";

/** M39 — compact "Jul 15 – Aug 15" period label, `null` when either bound is unset (older invoices, or a non-period-based flat fee). */
function periodLabel(row: InvoiceTableRow): string | null {
  if (!row.periodStart || !row.periodEnd) return null;
  return `${formatShortDate(row.periodStart)} – ${formatShortDate(row.periodEnd)}`;
}

export function InvoiceTable({
  invoices,
  hideProjectColumn,
  returnTo,
}: {
  invoices: InvoiceTableRow[];
  /** M19.3a — the Project column/line is redundant when this table is already scoped to one project. */
  hideProjectColumn?: boolean;
  /** The embedding page's own path (e.g. `/projects/{id}?tab=invoices`, or the top-level Invoices list's own `?status=`/`?from=dashboard` state) — carried through each row's link so the invoice detail page's back button returns exactly here, not just a generic default. */
  returnTo?: string;
}) {
  const gridCols = hideProjectColumn
    ? DESKTOP_GRID_WITHOUT_PROJECT
    : DESKTOP_GRID_WITH_PROJECT;
  const invoiceHref = (invoiceId: string) =>
    returnTo
      ? `/invoices/${invoiceId}?returnTo=${encodeURIComponent(returnTo)}`
      : `/invoices/${invoiceId}`;

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-border lg:block">
        <div
          className={cn(
            "grid items-center gap-3 bg-nav px-5 py-3.5 text-[11px] font-bold tracking-[0.05em] text-nav-muted uppercase",
            gridCols,
          )}
        >
          <span>Invoice</span>
          <span>Client</span>
          {hideProjectColumn ? null : <span>Project</span>}
          <span>Amount</span>
          <span>Due</span>
          <span>Status</span>
          <span />
          <span />
        </div>
        {invoices.map((invoice, index) => (
          <div
            key={invoice.id}
            className={cn(
              "relative grid items-center gap-3 px-5 py-3.5 hover:bg-muted/40",
              gridCols,
              index > 0 && "border-t border-muted",
            )}
          >
            <RowOpenLink
              href={invoiceHref(invoice.id)}
              ariaLabel={`Open invoice ${invoice.invoiceNumber}`}
            />
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-mono text-[13px] font-semibold text-foreground">
                {invoice.invoiceNumber}
              </span>
              <CommentBadge row={invoice} />
            </span>
            <Link
              href={`/parties/${invoice.project.client.id}`}
              className={cn(
                "relative z-10 block min-w-0 truncate text-[13px] text-foreground hover:text-brand hover:underline",
                NAME_LINK_FOCUS,
              )}
            >
              {invoice.project.client.name}
            </Link>
            {hideProjectColumn ? null : (
              <Link
                href={`/projects/${invoice.project.id}`}
                className={cn(
                  "relative z-10 block min-w-0 truncate text-[13px] text-muted-foreground hover:text-brand hover:underline",
                  NAME_LINK_FOCUS,
                )}
              >
                {invoice.project.name}
              </Link>
            )}
            <span className="truncate font-mono text-[13px] text-foreground">
              {formatCurrency(invoice.total, invoice.currency)}
            </span>
            <span className="truncate text-[13px] text-muted-foreground">
              {formatDisplayDate(invoice.dueDate)}
              {periodLabel(invoice) ? (
                <span className="block truncate text-[10px] text-muted-foreground/70">
                  {periodLabel(invoice)}
                </span>
              ) : null}
            </span>
            <StatusBadge status={invoice.status} dueDate={invoice.dueDate} />
            <span className="flex shrink-0 items-center justify-center gap-1 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-[11px] font-semibold text-brand">
              Open invoice
              <ArrowRight className="h-3 w-3" />
            </span>
            <InvoiceRowActionsMenu
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
              status={invoice.status}
              latestComment={invoice.latestComment}
            />
          </div>
        ))}
      </div>

      {/* Mobile stacked cards */}
      <div className="flex flex-col gap-3 lg:hidden">
        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="relative flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4"
          >
            <RowOpenLink
              href={invoiceHref(invoice.id)}
              ariaLabel={`Open invoice ${invoice.invoiceNumber}`}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-mono text-[13px] font-bold text-foreground">
                  {invoice.invoiceNumber}
                </span>
                <CommentBadge row={invoice} />
              </span>
              <div className="flex items-center gap-2">
                <StatusBadge
                  status={invoice.status}
                  dueDate={invoice.dueDate}
                />
                <InvoiceRowActionsMenu
                  invoiceId={invoice.id}
                  invoiceNumber={invoice.invoiceNumber}
                  status={invoice.status}
                  latestComment={invoice.latestComment}
                />
              </div>
            </div>
            <Link
              href={`/parties/${invoice.project.client.id}`}
              className={cn(
                "relative z-10 block w-fit max-w-full text-[13px] font-semibold text-foreground hover:text-brand hover:underline",
                NAME_LINK_FOCUS,
              )}
            >
              {invoice.project.client.name}
            </Link>
            {hideProjectColumn ? null : (
              <Link
                href={`/projects/${invoice.project.id}`}
                className={cn(
                  "relative z-10 block w-fit max-w-full text-[12px] text-muted-foreground hover:text-brand hover:underline",
                  NAME_LINK_FOCUS,
                )}
              >
                {invoice.project.name}
              </Link>
            )}
            <div className="mt-1 flex items-center justify-between border-t border-muted pt-2">
              <span className="text-[12px] text-muted-foreground">
                {formatDisplayDate(invoice.dueDate)}
                {periodLabel(invoice) ? (
                  <span className="block text-[10px] text-muted-foreground/70">
                    {periodLabel(invoice)}
                  </span>
                ) : null}
              </span>
              <span className="font-mono text-[13px] font-bold text-foreground">
                {formatCurrency(invoice.total, invoice.currency)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
