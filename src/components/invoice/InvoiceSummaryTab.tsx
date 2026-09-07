import Link from "next/link";
import { Download, ArrowRight } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { formatDisplayDate } from "@/lib/dates";
import { deriveDisplayStatus } from "@/lib/invoiceStatus";
import { withReturnTo } from "@/lib/backNavigation";
import type { InvoiceWithItems } from "@/repositories/invoiceRepository";
import type { InvoiceDocumentData } from "@/services/documentService";

/**
 * Invoice detail Summary tab (ui_redesign_handoff_v3
 * screenshots/07-invoice-detail-summary.jpg). The mockup's 4th metric,
 * "Last follow-up" (a reminder-sent timestamp), is omitted rather than
 * faked — there's no reminder-tracking feature in this app, matching the
 * same "Send reminder" backend gap everywhere else in this redesign.
 */
export function InvoiceSummaryTab({
  invoice,
  data,
  returnTo,
}: {
  invoice: InvoiceWithItems;
  data: InvoiceDocumentData;
  returnTo?: string;
}) {
  const displayStatus = deriveDisplayStatus(invoice.status, invoice.dueDate);
  const dateMetric =
    invoice.status === "PAID"
      ? { label: "Paid", value: formatDisplayDate(invoice.updatedAt) }
      : invoice.status === "VOID"
        ? { label: "Voided", value: formatDisplayDate(invoice.updatedAt) }
        : {
            label: "Due date",
            value: formatDisplayDate(invoice.dueDate),
          };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric
          label="Amount due"
          value={formatCurrency(data.total, data.currency)}
          note={`${data.currency} · Full balance outstanding`}
        />
        <Metric
          label={dateMetric.label}
          value={dateMetric.value}
          note={displayStatus === "OVERDUE" ? "Past due" : undefined}
          danger={displayStatus === "OVERDUE"}
        />
        <Metric
          label="Issued"
          value={formatDisplayDate(invoice.issueDate)}
          note={
            invoice.status === "DRAFT"
              ? `Created ${formatDisplayDate(invoice.createdAt)}`
              : "Sent to client on issue date"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[14px] font-bold text-foreground">
              Invoice details
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Billing and delivery information.
            </p>
            {invoice.status !== "DRAFT" ? (
              <CardAction>
                <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">
                  🔒 Locked
                </span>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Fact label="Client" value={data.client.name} />
            <Fact label="Project" value={invoice.project.name} />
            <Fact label="Service" value={data.serviceDescription} />
            <Fact
              label="Billing period"
              value={
                invoice.periodStart && invoice.periodEnd
                  ? `${formatDisplayDate(invoice.periodStart)} – ${formatDisplayDate(invoice.periodEnd)}`
                  : "—"
              }
            />
            <Fact
              label="Currency"
              value={
                data.convertedTotal && data.convertedCurrency
                  ? `${data.currency} (converted: ${formatCurrency(data.convertedTotal, data.convertedCurrency)})`
                  : data.currency
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-[14px] font-bold text-foreground">
              Amount breakdown
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              {data.items.length} billed line{" "}
              {data.items.length === 1 ? "item" : "items"}.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-0 p-0">
            {data.items.map((item, index) => (
              <div
                key={item.id}
                className={`flex items-center justify-between px-5 py-3 ${index > 0 ? "border-t border-muted" : ""}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-foreground">
                    {item.description}
                  </p>
                  {!item.isFlatAmount ? (
                    <p className="text-[10px] text-muted-foreground">
                      {item.quantity} ×{" "}
                      {formatCurrency(item.unitPrice ?? "0", data.currency)}
                    </p>
                  ) : item.durationText ? (
                    <p className="text-[10px] text-muted-foreground">
                      {item.durationText}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 font-mono text-[12px] font-semibold text-foreground">
                  {formatCurrency(item.amount, data.currency)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-muted bg-muted/30 px-5 py-3">
              <span className="text-[12px] font-bold text-foreground">
                Total due
              </span>
              <span className="font-mono text-[14px] font-bold text-foreground">
                {formatCurrency(data.total, data.currency)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-3.5">
        <div>
          <p className="text-[12px] font-bold text-foreground">
            Generated files
          </p>
          <p className="text-[11px] text-muted-foreground">
            Download the final invoice in the required format.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={`/api/invoices/${invoice.id}/excel`}
                target="_blank"
              />
            }
          >
            <Download className="h-3.5 w-3.5" />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link href={`/api/invoices/${invoice.id}/pdf`} target="_blank" />
            }
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </Button>
          <Link
            href={withReturnTo(`/invoices/${invoice.id}?tab=preview`, returnTo)}
            className="flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
          >
            Preview invoice
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  danger = false,
}: {
  label: string;
  value: string;
  note?: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <span className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <div
        className={`mt-2 text-lg font-bold ${danger ? "text-[var(--status-overdue-text)]" : "text-foreground"}`}
      >
        {value}
      </div>
      {note ? (
        <p
          className={`mt-1 text-[11px] ${danger ? "font-semibold text-[var(--status-overdue-text)]" : "text-muted-foreground"}`}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[12px] text-foreground">{value}</dd>
    </div>
  );
}
