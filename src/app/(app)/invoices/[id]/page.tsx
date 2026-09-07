import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { InvoiceForm } from "@/components/invoice/InvoiceForm";
import { StatusBadge } from "@/components/invoice/StatusBadge";
import { StatusActionBar } from "@/components/invoice/StatusActionBar";
import {
  InvoiceDetailTabs,
  type InvoiceDetailTab,
} from "@/components/invoice/InvoiceDetailTabs";
import { InvoiceOverdueBanner } from "@/components/invoice/InvoiceOverdueBanner";
import { InvoiceSummaryTab } from "@/components/invoice/InvoiceSummaryTab";
import { InvoicePreviewTab } from "@/components/invoice/InvoicePreviewTab";
import { InvoiceActivityTab } from "@/components/invoice/InvoiceActivityTab";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invoiceService } from "@/services/invoiceService";
import { documentService } from "@/services/documentService";
import { toDateInputValue, isOverdue } from "@/lib/dates";
import { buildInvoiceActivity } from "@/lib/invoiceActivity";
import { getAiAssistConfigSummary } from "@/lib/ai-providers/config";
import { resolveBackTarget, withReturnTo } from "@/lib/backNavigation";

function resolveTab(value: string | undefined): InvoiceDetailTab {
  if (value === "preview" || value === "activity") return value;
  return "summary";
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; returnTo?: string; edit?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam, returnTo, edit } = await searchParams;
  const back = resolveBackTarget(returnTo, {
    href: "/invoices",
    label: "Back to Invoices",
  });
  const invoice = await invoiceService.getById(id);
  if (!invoice) {
    notFound();
  }

  // A DRAFT is the only status that can ever be edited (locked permanently
  // at DRAFT -> SENT, Docs/implementation_decisions.md) — `?edit=1` is only
  // meaningful for it. Any other status always renders the read-only tabs
  // below, same as this used to work for every non-DRAFT invoice.
  const isEditingDraft = invoice.status === "DRAFT" && edit === "1";

  if (!isEditingDraft) {
    const tab = resolveTab(tabParam);
    const data = documentService.assembleInvoiceDocumentData(invoice);
    const events = buildInvoiceActivity(invoice);
    const overdue = invoice.status === "SENT" && isOverdue(invoice.dueDate);
    const isDraft = invoice.status === "DRAFT";

    return (
      <>
        <PageHeader
          title={invoice.invoiceNumber}
          subtitle={
            <>
              <Link
                href={`/parties/${invoice.project.client.id}`}
                className="hover:text-brand hover:underline"
              >
                {invoice.project.client.name}
              </Link>
              {" · "}
              <Link
                href={`/projects/${invoice.projectId}`}
                className="hover:text-brand hover:underline"
              >
                {invoice.project.name}
              </Link>
            </>
          }
          action={
            <div className="flex items-center gap-3">
              <StatusBadge status={invoice.status} dueDate={invoice.dueDate} />
              {isDraft ? (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link
                      href={withReturnTo(
                        `/invoices/${invoice.id}?edit=1`,
                        returnTo,
                      )}
                    />
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              ) : null}
              <StatusActionBar
                invoiceId={invoice.id}
                status={invoice.status}
                hasNoPaymentMethod={!invoice.project.preferredPaymentMethod}
              />
            </div>
          }
          backHref={back.href}
          backLabel={back.label}
        />
        {overdue ? <InvoiceOverdueBanner dueDate={invoice.dueDate} /> : null}
        <InvoiceDetailTabs
          invoiceId={invoice.id}
          active={tab}
          activityCount={events.length}
          returnTo={returnTo}
        />
        {tab === "summary" ? (
          <InvoiceSummaryTab
            invoice={invoice}
            data={data}
            returnTo={returnTo}
          />
        ) : tab === "preview" ? (
          <InvoicePreviewTab invoiceId={invoice.id} data={data} />
        ) : (
          <InvoiceActivityTab
            invoiceNumber={invoice.invoiceNumber}
            events={events}
          />
        )}
      </>
    );
  }

  const aiConfig = await getAiAssistConfigSummary();
  const previewHref = withReturnTo(`/invoices/${invoice.id}`, returnTo);
  const headerAction = (
    <div className="flex flex-wrap items-center gap-3">
      <StatusBadge status={invoice.status} dueDate={invoice.dueDate} />
      <StatusActionBar
        invoiceId={invoice.id}
        status={invoice.status}
        hasNoPaymentMethod={!invoice.project.preferredPaymentMethod}
      />
    </div>
  );

  return (
    <>
      <PageHeader
        title={invoice.invoiceNumber}
        subtitle={
          <>
            Editing draft invoice for{" "}
            <Link
              href={`/projects/${invoice.projectId}`}
              className="hover:text-brand hover:underline"
            >
              {invoice.project.name}
            </Link>
            .
          </>
        }
        action={headerAction}
        backHref={previewHref}
        backLabel="Back to preview"
      />
      <InvoiceForm
        mode="edit"
        invoiceId={invoice.id}
        projectId={invoice.projectId}
        aiConfig={aiConfig}
        returnTo={returnTo}
        project={{
          name: invoice.project.name,
          contractorName: invoice.project.contractor.name,
          clientName: invoice.project.client.name,
          preferredPaymentMethodLabel:
            invoice.project.preferredPaymentMethod?.label ?? null,
          displayCurrency: invoice.project.displayCurrency,
          currencyMode: invoice.project.currencyMode,
          currency: invoiceService.resolveInvoiceCurrency(invoice.project),
          invoiceNumberFormat: invoice.project.invoiceNumberFormat,
          invoicePeriodType: invoice.project.invoicePeriodType,
          referralCreditEnabled: invoice.project.referralCreditEnabled,
          referralCreditDefaultLabel:
            invoice.project.referralCreditLabel ??
            "Referral Credit (Thank you!)",
        }}
        defaultValues={{
          invoiceNumber: invoice.invoiceNumber,
          issueDate: toDateInputValue(invoice.issueDate),
          dueDate: toDateInputValue(invoice.dueDate),
          periodStart: invoice.periodStart
            ? toDateInputValue(invoice.periodStart)
            : "",
          periodEnd: invoice.periodEnd
            ? toDateInputValue(invoice.periodEnd)
            : "",
          convertedTotal: invoice.convertedTotal?.toString() ?? "",
          itemsNote: invoice.itemsNote ?? "",
          bottomNote: invoice.bottomNote ?? "",
          items: invoice.items.map((item) => ({
            description: item.description,
            isFlatAmount: item.isFlatAmount,
            isReferralCredit: item.isReferralCredit,
            quantity: item.quantity?.toString() ?? "",
            unitPrice: item.unitPrice?.toString() ?? "",
            // M35 — the field holds a positive magnitude; the stored amount
            // is negative for a referral-credit row, so it's un-negated here.
            amount: item.isReferralCredit
              ? item.amount.abs().toString()
              : item.isFlatAmount
                ? item.amount.toString()
                : "",
            durationText: item.durationText ?? "",
          })),
        }}
      />
    </>
  );
}
