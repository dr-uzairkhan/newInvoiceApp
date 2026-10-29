import Link from "next/link";
import { Pencil } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DetailField } from "@/components/shared/DetailField";
import { INVOICE_PERIOD_LABELS } from "@/lib/invoicePeriod";
import type { ProjectWithRelations } from "@/repositories/projectRepository";

const CURRENCY_LABELS: Record<ProjectWithRelations["displayCurrency"], string> =
  {
    USD: "USD",
    AUD: "AUD",
    GBP: "GBP",
    NZD: "NZD",
    AED: "AED",
    PKR: "PKR",
    SAR: "SAR",
  };

const CURRENCY_MODE_LABELS: Record<
  ProjectWithRelations["currencyMode"],
  string
> = {
  SINGLE: "Single Currency",
  DUAL: "Dual Currency",
};

const STATUS_LABELS: Record<ProjectWithRelations["status"], string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

/**
 * Read-only view of a Project's billing setup — the default landing state
 * for the Billing setup tab, pre-dating (and restored after) the v3
 * redesign's brief switch to landing directly on the editable form. Mirrors
 * every field ProjectForm edits. No "Create Invoice" action here (unlike
 * the pre-v3 original) since the page header already has one.
 */
export function ProjectDetailCard({
  project,
  editHref,
  nextInvoiceNumber,
}: {
  project: ProjectWithRelations;
  editHref: string;
  nextInvoiceNumber: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[15px] font-bold text-foreground">
          Billing setup
        </CardTitle>
        <CardAction>
          <Button
            variant="outline"
            className="h-8 px-3 text-[12px]"
            nativeButton={false}
            render={<Link href={editHref} />}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DetailField label="Name" value={project.name} />
        <DetailField label="Abbreviation" value={project.abbreviation ?? "—"} />
        <DetailField
          label="Service Description"
          value={
            project.serviceDescription ?? `${project.name} (from project name)`
          }
        />
        <DetailField label="Contractor" value={project.contractor.name} />
        <DetailField label="Client" value={project.client.name} />
        <DetailField
          label="Preferred Payment Method"
          value={project.preferredPaymentMethod?.label ?? "None"}
        />
        <DetailField
          label="Invoice Number Format"
          value={project.invoiceNumberFormat}
        />
        {project.previousInvoiceNumberFormats.length > 0 ? (
          <DetailField
            label="Previous Formats"
            value={project.previousInvoiceNumberFormats.join(", ")}
          />
        ) : null}
        <DetailField label="Next Invoice Number" value={nextInvoiceNumber} />
        <DetailField
          label="Invoice Period"
          value={
            project.invoicePeriodType
              ? INVOICE_PERIOD_LABELS[project.invoicePeriodType]
              : "None"
          }
        />
        <DetailField
          label="Currency Mode"
          value={CURRENCY_MODE_LABELS[project.currencyMode]}
        />
        <DetailField
          label={
            project.currencyMode === "DUAL" ? "Display Currency" : "Currency"
          }
          value={CURRENCY_LABELS[project.displayCurrency]}
        />
        <DetailField label="Status" value={STATUS_LABELS[project.status]} />
      </CardContent>
    </Card>
  );
}
