import Link from "next/link";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { InvoicesDirectory } from "@/components/invoice/InvoicesDirectory";
import { InvoiceSummaryStats } from "@/components/invoice/InvoiceSummaryStats";
import {
  InvoiceStatusFilter,
  type InvoiceStatusFilterValue,
} from "@/components/invoice/InvoiceStatusFilter";
import { Button } from "@/components/ui/button";
import { invoiceService } from "@/services/invoiceService";
import { buildInvoiceTableRows } from "@/lib/invoiceTableRows";
import { formatCurrency } from "@/lib/currency";
import { DUE_SOON_WITHIN_DAYS } from "@/lib/dashboardTrend";
import { withReturnTo } from "@/lib/backNavigation";

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function sumUsd(invoices: { currency: string; total: unknown }[]): number {
  return invoices
    .filter((invoice) => invoice.currency === "USD")
    .reduce((sum, invoice) => sum + Number(invoice.total), 0);
}

/**
 * Top-level invoices list — every invoice across every project, newest
 * first, filterable by a `?status=` search param driving the chip row
 * (Docs/ui_design_guide.md §4). "Overdue" and "Sent" deliberately overlap:
 * an overdue invoice is still SENT under the hood.
 */

/** Unrecognized/missing `?status=` falls back to "all". */
function resolveFilter(status: string | undefined): InvoiceStatusFilterValue {
  if (
    status === "overdue" ||
    status === "sent" ||
    status === "paid" ||
    status === "draft" ||
    status === "void"
  ) {
    return status;
  }
  return "all";
}

const EMPTY_STATE_COPY: Record<
  InvoiceStatusFilterValue,
  { title: string; description: string }
> = {
  all: {
    title: "No invoices yet",
    description: "Create your first invoice from an existing project.",
  },
  overdue: {
    title: "No overdue invoices",
    description: "Every sent invoice is still within its due date.",
  },
  sent: {
    title: "No sent invoices",
    description: "Invoices appear here once they've been sent.",
  },
  paid: {
    title: "No paid invoices",
    description: "Invoices appear here once they've been marked paid.",
  },
  draft: {
    title: "No draft invoices",
    description: "Invoices appear here while they're still being prepared.",
  },
  void: {
    title: "No void invoices",
    description: "Invoices appear here once they've been voided.",
  },
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string }>;
}) {
  const { status, from } = await searchParams;
  const filter = resolveFilter(status);
  const cameFromDashboard = from === "dashboard";

  const [
    invoices,
    sentOutstanding,
    sentCount,
    dueSoonInvoices,
    overdueInvoices,
    paidThisMonth,
  ] = await Promise.all([
    filter === "overdue"
      ? invoiceService.listOverdue()
      : filter === "sent"
        ? invoiceService.listByStatus("SENT")
        : filter === "paid"
          ? invoiceService.listByStatus("PAID")
          : filter === "draft"
            ? invoiceService.listByStatus("DRAFT")
            : filter === "void"
              ? invoiceService.listByStatus("VOID")
              : invoiceService.list(),
    invoiceService.sumSubtotalByStatus("SENT"),
    invoiceService.countByStatus("SENT"),
    invoiceService.listDueSoon(),
    invoiceService.listOverdue(),
    invoiceService.listPaidThisMonth(),
  ]);

  const emptyCopy = EMPTY_STATE_COPY[filter];

  // Mirrors ProjectStatusFilter's own hrefFor — so embedded links (invoice
  // rows) can carry this page's real current state back through `returnTo`.
  const ownPathParams = new URLSearchParams();
  if (filter !== "all") ownPathParams.set("status", filter);
  if (cameFromDashboard) ownPathParams.set("from", "dashboard");
  const ownPathQuery = ownPathParams.toString();
  const ownPath = ownPathQuery ? `/invoices?${ownPathQuery}` : "/invoices";

  return (
    <>
      <PageHeader
        eyebrow="Invoice operations"
        title="Invoices"
        subtitle="Every invoice across every project, newest first."
        backHref={cameFromDashboard ? "/" : undefined}
        backLabel="Back to Dashboard"
        action={
          <Button
            nativeButton={false}
            render={<Link href={withReturnTo("/invoices/new", ownPath)} />}
          >
            + New Invoice
          </Button>
        }
      />
      <InvoiceSummaryStats
        outstanding={{
          amount: formatCurrency(sentOutstanding.toString(), "USD"),
          note: `${sentCount} open ${pluralize(sentCount, "invoice")}`,
        }}
        dueSoon={{
          amount: formatCurrency(sumUsd(dueSoonInvoices), "USD"),
          note: `Within the next ${DUE_SOON_WITHIN_DAYS} days`,
        }}
        overdue={{
          amount: formatCurrency(sumUsd(overdueInvoices), "USD"),
          note: `${overdueInvoices.length} ${pluralize(overdueInvoices.length, "invoice")}`,
        }}
        paidThisMonth={{
          amount: formatCurrency(sumUsd(paidThisMonth), "USD"),
          note: `${paidThisMonth.length} ${pluralize(paidThisMonth.length, "invoice")}`,
        }}
      />
      {invoices.length === 0 ? (
        <>
          <InvoiceStatusFilter
            active={filter}
            fromDashboard={cameFromDashboard}
          />
          <EmptyState
            icon={FileText}
            title={emptyCopy.title}
            description={emptyCopy.description}
            action={
              filter === "all" ? (
                <Button
                  nativeButton={false}
                  render={
                    <Link href={withReturnTo("/invoices/new", ownPath)} />
                  }
                >
                  Create your first invoice
                </Button>
              ) : undefined
            }
          />
        </>
      ) : (
        <InvoicesDirectory
          invoices={await buildInvoiceTableRows(invoices)}
          filterSlot={
            <InvoiceStatusFilter
              active={filter}
              fromDashboard={cameFromDashboard}
            />
          }
          returnTo={ownPath}
        />
      )}
    </>
  );
}
