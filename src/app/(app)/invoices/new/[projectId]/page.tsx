import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { InvoiceForm } from "@/components/invoice/InvoiceForm";
import { projectService } from "@/services/projectService";
import { invoiceService } from "@/services/invoiceService";
import { getAiAssistConfigSummary } from "@/lib/ai-providers/config";
import { toDateInputValue } from "@/lib/dates";
import { computeDueDate } from "@/lib/invoicePeriod";
import { resolveBackTarget } from "@/lib/backNavigation";

export default async function NewInvoiceForProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { projectId } = await params;
  const { returnTo } = await searchParams;
  const project = await projectService.getById(projectId);
  if (!project) {
    notFound();
  }

  const today = toDateInputValue(new Date());
  const { suggested: suggestedInvoiceNumber, conflictingLastInvoiceNumber } =
    await invoiceService.previewNextInvoiceNumber(projectId, today);
  const initialDueDate = project.invoicePeriodType
    ? computeDueDate(today, project.invoicePeriodType)
    : today;
  const autofillData =
    await invoiceService.getAutofillDataForProject(projectId);
  const initialPeriodStart =
    await invoiceService.previewNextPeriodStart(projectId);
  const { configured: aiConfigured } = await getAiAssistConfigSummary();

  // Every real entry point into this page forwards its own `returnTo`
  // (project page, dashboard, etc.) — that takes priority over the
  // generic "Change project" affordance, which only makes sense when
  // this page was reached with no such context (directly via the
  // project-picker at /invoices/new).
  const back = resolveBackTarget(returnTo, {
    href: "/invoices/new",
    label: "Change project",
  });

  return (
    <>
      <PageHeader
        backHref={back.href}
        backLabel={back.label}
        eyebrow="New draft invoice"
        title="Create invoice"
        subtitle={`For ${project.name} · ${project.client.name}`}
      />
      <InvoiceForm
        mode="create"
        projectId={project.id}
        aiConfigured={aiConfigured}
        autofillData={autofillData}
        invoiceNumberConflict={conflictingLastInvoiceNumber}
        returnTo={returnTo}
        project={{
          name: project.name,
          contractorName: project.contractor.name,
          clientName: project.client.name,
          preferredPaymentMethodLabel:
            project.preferredPaymentMethod?.label ?? null,
          displayCurrency: project.displayCurrency,
          currencyMode: project.currencyMode,
          currency: invoiceService.resolveInvoiceCurrency(project),
          invoiceNumberFormat: project.invoiceNumberFormat,
          invoicePeriodType: project.invoicePeriodType,
          referralCreditEnabled: project.referralCreditEnabled,
          referralCreditDefaultLabel:
            project.referralCreditLabel ?? "Referral Credit (Thank you!)",
        }}
        defaultValues={{
          invoiceNumber: suggestedInvoiceNumber,
          issueDate: today,
          dueDate: initialDueDate,
          periodStart: initialPeriodStart ?? "",
          periodEnd: today,
        }}
      />
    </>
  );
}
