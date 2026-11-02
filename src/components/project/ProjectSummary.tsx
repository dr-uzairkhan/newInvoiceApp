import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { DetailField } from "@/components/shared/DetailField";
import { withReturnTo } from "@/lib/backNavigation";
import { describeProjectAddress } from "@/lib/partyAddress";
import type { ProjectWithRelations } from "@/repositories/projectRepository";

const CURRENCY_MODE_LABELS: Record<
  ProjectWithRelations["currencyMode"],
  string
> = {
  SINGLE: "Single Currency",
  DUAL: "Dual Currency",
};

/**
 * Project detail Overview tab's at-a-glance relationship/billing summary
 * (ui_redesign_handoff_v3 screenshots/10) — deliberately a trimmed subset of
 * ProjectDetailCard's full field list (invoice numbering/period live in the
 * Billing setup tab's actual editable form instead, not duplicated here).
 */
export function ProjectSummary({
  project,
  returnTo,
}: {
  project: ProjectWithRelations;
  returnTo?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[14px] font-bold text-foreground">
          Project summary
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Key relationship and billing information.
        </p>
        <CardAction>
          <Link
            href={withReturnTo(`/projects/${project.id}?tab=setup`, returnTo)}
            className="text-[11px] font-bold text-brand hover:underline"
          >
            Edit details
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DetailField label="Client" value={project.client.name} />
        <DetailField label="Contractor" value={project.contractor.name} />
        <DetailField
          label="Service"
          value={
            project.serviceDescription || `${project.name} (from project name)`
          }
        />
        <DetailField
          label="Payment method"
          value={project.preferredPaymentMethod?.label ?? "None set"}
        />
        <DetailField
          label="Addresses"
          value={`From ${describeProjectAddress(project, "contractor")} · To ${describeProjectAddress(project, "client")}`}
        />
        <DetailField
          label="Currency"
          value={`${project.displayCurrency} · ${CURRENCY_MODE_LABELS[project.currencyMode]}`}
        />
        <DetailField
          label="Invoice abbreviation"
          value={project.abbreviation ?? "—"}
        />
      </CardContent>
    </Card>
  );
}
