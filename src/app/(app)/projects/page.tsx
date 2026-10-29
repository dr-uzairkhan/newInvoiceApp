import Link from "next/link";
import { Briefcase } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProjectsDirectory } from "@/components/project/ProjectsDirectory";
import {
  ProjectStatusFilter,
  type ProjectStatusFilterValue,
} from "@/components/project/ProjectStatusFilter";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { projectService } from "@/services/projectService";
import { invoiceService } from "@/services/invoiceService";
import { invoiceCommentService } from "@/services/invoiceCommentService";
import { projectAlertScheduleService } from "@/services/projectAlertScheduleService";
import { buildProjectBillingRows } from "@/lib/projectBillingStatus";

/** M27 v2 redesign — unrecognized/missing `?status=` falls back to "all". */
function resolveFilter(status: string | undefined): ProjectStatusFilterValue {
  if (
    status === "active" ||
    status === "archived" ||
    status === "needs-attention"
  ) {
    return status;
  }
  return "all";
}

const EMPTY_STATE_COPY: Record<
  ProjectStatusFilterValue,
  { title: string; description: string }
> = {
  all: {
    title: "No projects yet",
    description:
      "Create your first project to link a contractor and a client so invoices can be generated under it.",
  },
  active: {
    title: "No active projects",
    description: "Projects appear here while they're active.",
  },
  "needs-attention": {
    title: "Nothing needs attention",
    description:
      "Active projects with an overdue, due-soon, or draft invoice appear here.",
  },
  archived: {
    title: "No archived projects",
    description: "Projects appear here once they've been archived.",
  },
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string }>;
}) {
  const { status, from } = await searchParams;
  const filter = resolveFilter(status);
  const cameFromDashboard = from === "dashboard";

  const [
    allProjects,
    activeProjects,
    allInvoices,
    overdueInvoices,
    staleDrafts,
    firedAlertSchedules,
    liveAlertSchedules,
  ] = await Promise.all([
    projectService.list(),
    projectService.list({ status: "ACTIVE" }),
    invoiceService.list(),
    invoiceService.listOverdue(),
    invoiceService.listStaleDrafts(),
    projectAlertScheduleService.listFiredAcrossActiveProjects(),
    projectAlertScheduleService.listLiveAcrossActiveProjects(),
  ]);

  // M40 — same schedule-wins-over-invoicePeriodType priority the dashboard
  // uses (M38), so this list's "Next invoice" date agrees with it.
  const billingRows = buildProjectBillingRows({
    activeProjects,
    allInvoices,
    overdueInvoices,
    staleDrafts,
    firedAlertSchedules,
    liveAlertSchedules,
  });
  const commentSummaries = await invoiceCommentService.summarizeByInvoiceIds(
    allInvoices.map((invoice) => invoice.id),
  );
  const billingRowByProjectId = new Map(
    billingRows.map((row) => [row.projectId, row]),
  );

  const projectsForFilter = (() => {
    if (filter === "active") return activeProjects;
    if (filter === "archived") {
      return allProjects.filter((project) => project.status === "ARCHIVED");
    }
    if (filter === "needs-attention") {
      return activeProjects.filter(
        (project) =>
          billingRowByProjectId.get(project.id)?.statusTone !== "positive",
      );
    }
    return allProjects;
  })();

  const firedProjectIds = firedAlertSchedules.map(
    (schedule) => schedule.project.id,
  );

  const emptyCopy = EMPTY_STATE_COPY[filter];

  // Mirrors ProjectStatusFilter's own hrefFor — so embedded links (e.g. the
  // Workspace view's invoice rows) can carry this page's real current state
  // back through `returnTo`, not a fixed fallback.
  const ownPathParams = new URLSearchParams();
  if (filter !== "all") ownPathParams.set("status", filter);
  if (cameFromDashboard) ownPathParams.set("from", "dashboard");
  const ownPathQuery = ownPathParams.toString();
  const ownPath = ownPathQuery ? `/projects?${ownPathQuery}` : "/projects";

  return (
    <>
      <PageHeader
        eyebrow="Invoice operations"
        title="Projects"
        subtitle="The bridge between a contractor and a client, and the home for per-engagement invoice settings."
        backHref={cameFromDashboard ? "/" : undefined}
        backLabel="Back to Dashboard"
        action={
          <Button nativeButton={false} render={<Link href="/projects/new" />}>
            Create Project
          </Button>
        }
      />
      {projectsForFilter.length === 0 ? (
        <>
          <ProjectStatusFilter
            active={filter}
            fromDashboard={cameFromDashboard}
          />
          <EmptyState
            icon={Briefcase}
            title={emptyCopy.title}
            description={emptyCopy.description}
            action={
              filter === "all" ? (
                <Button
                  nativeButton={false}
                  render={<Link href="/projects/new" />}
                >
                  Create your first project
                </Button>
              ) : undefined
            }
          />
        </>
      ) : (
        <ProjectsDirectory
          projects={projectsForFilter}
          firedProjectIds={firedProjectIds}
          billingRowByProjectId={Object.fromEntries(billingRowByProjectId)}
          returnTo={ownPath}
          statusFilter={filter}
          invoices={allInvoices.map((invoice) => ({
            id: invoice.id,
            projectId: invoice.projectId,
            invoiceNumber: invoice.invoiceNumber,
            issueDate: invoice.issueDate,
            periodStart: invoice.periodStart,
            periodEnd: invoice.periodEnd,
            total: invoice.total.toString(),
            currency: invoice.currency,
            commentCount: commentSummaries.get(invoice.id)?.count ?? 0,
          }))}
          filterSlot={
            <ProjectStatusFilter
              active={filter}
              fromDashboard={cameFromDashboard}
            />
          }
        />
      )}
    </>
  );
}
