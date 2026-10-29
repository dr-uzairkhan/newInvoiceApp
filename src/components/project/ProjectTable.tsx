import Link from "next/link";
import { ChevronRight, BellDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_TYPE_LABELS } from "@/lib/paymentMethodLabels";
import { ProjectStatusPill } from "@/components/project/ProjectStatusPill";
import { ProjectReorderButtons } from "@/components/project/ProjectReorderButtons";
import { withReturnTo } from "@/lib/backNavigation";
import type { ProjectWithRelations } from "@/repositories/projectRepository";

/**
 * Projects list — M27 v2 redesign (design_handoff_dashboard_v2/README.md §4,
 * Docs/ui_design_guide.md §4). Same dual-layout pattern as InvoiceTable.tsx:
 * a dark-header grid table at `≥1024px`, replaced entirely by stacked cards
 * below that. Bespoke markup, not the shared `DataTable` — PartyTable.tsx
 * (milestone 6) now follows the same convention.
 */
const DESKTOP_GRID = "grid-cols-[1.6fr_1.2fr_1fr_1.4fr_0.7fr_28px]";

export function paymentMethodSummary(project: ProjectWithRelations): {
  text: string;
  missing: boolean;
} {
  const method = project.preferredPaymentMethod;
  if (!method) return { text: "No payment method", missing: true };
  const typeLabel = PAYMENT_METHOD_TYPE_LABELS[method.type] ?? method.type;
  return { text: `${typeLabel} — ${method.label}`, missing: false };
}

function ProjectAvatar({ abbreviation }: { abbreviation: string | null }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#ede9fe] font-mono text-[11px] font-bold text-brand">
      {(abbreviation || "??").slice(0, 2).toUpperCase()}
    </span>
  );
}

/** A fired, uncleared alert schedule exists for this project — the same fired set the project page lists with its Clear buttons. */
function AlertDot() {
  return (
    <BellDot
      className="h-3.5 w-3.5 shrink-0 text-[var(--status-overdue-text)]"
      aria-label="Has a pending alert"
    />
  );
}

export function ProjectTable({
  projects,
  firedProjectIds = [],
  reorderable = false,
  returnTo,
}: {
  projects: ProjectWithRelations[];
  firedProjectIds?: string[];
  reorderable?: boolean;
  /** The list page's own current path — carried through so back-navigation from a project's detail page returns here. */
  returnTo?: string;
}) {
  const firedProjectIdSet = new Set(firedProjectIds);
  // On the "All" tab, ARCHIVED rows are interleaved with ACTIVE ones in the
  // same list — but the swap logic (findAdjacentActive) only ever moves a
  // project relative to its nearest ACTIVE neighbor, skipping archived rows
  // entirely. So disableUp/disableDown — and which rows even get arrows —
  // must be computed from a project's position among ACTIVE rows only, not
  // its raw position in the full (possibly-interleaved) list.
  const activeIds = projects
    .filter((project) => project.status === "ACTIVE")
    .map((project) => project.id);

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-border lg:block">
        <div
          className={cn(
            "grid items-center gap-3 bg-nav px-5 py-3.5 text-[11px] font-bold tracking-[0.05em] text-nav-muted uppercase",
            DESKTOP_GRID,
          )}
        >
          <span>Project</span>
          <span>Client</span>
          <span>Status</span>
          <span>Payment Method</span>
          <span>Currency</span>
          <span />
        </div>
        {projects.map((project, index) => {
          const paymentMethod = paymentMethodSummary(project);
          const activeIndex = activeIds.indexOf(project.id);
          return (
            <div
              key={project.id}
              className={cn(
                "flex items-stretch",
                index > 0 && "border-t border-muted",
              )}
            >
              {reorderable ? (
                <div className="flex items-center justify-center border-r border-muted px-3">
                  {activeIndex !== -1 ? (
                    <ProjectReorderButtons
                      projectId={project.id}
                      disableUp={activeIndex === 0}
                      disableDown={activeIndex === activeIds.length - 1}
                    />
                  ) : (
                    <div className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </div>
              ) : null}
              <Link
                href={withReturnTo(`/projects/${project.id}`, returnTo)}
                className={cn(
                  "grid flex-1 items-center gap-3 px-5 py-3.5 hover:bg-muted/40",
                  DESKTOP_GRID,
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <ProjectAvatar abbreviation={project.abbreviation} />
                  <span className="truncate text-[13px] font-semibold text-foreground">
                    {project.name}
                  </span>
                  {firedProjectIdSet.has(project.id) ? <AlertDot /> : null}
                </span>
                <span className="truncate text-[13px] text-foreground">
                  {project.client.name}
                </span>
                <ProjectStatusPill status={project.status} />
                <span
                  className={cn(
                    "truncate text-[12px]",
                    paymentMethod.missing
                      ? "font-semibold text-[var(--alert-warning-text)]"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  {paymentMethod.text}
                </span>
                <span className="truncate font-mono text-[13px] text-foreground">
                  {project.displayCurrency}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--border-heavy)]" />
              </Link>
            </div>
          );
        })}
      </div>

      {/* Mobile stacked cards */}
      <div className="flex flex-col gap-3 lg:hidden">
        {projects.map((project) => {
          const paymentMethod = paymentMethodSummary(project);
          const activeIndex = activeIds.indexOf(project.id);
          return (
            <div
              key={project.id}
              className="flex items-stretch gap-2 rounded-xl border border-border bg-card"
            >
              {reorderable ? (
                <div className="flex items-center justify-center border-r border-muted px-2">
                  {activeIndex !== -1 ? (
                    <ProjectReorderButtons
                      projectId={project.id}
                      disableUp={activeIndex === 0}
                      disableDown={activeIndex === activeIds.length - 1}
                    />
                  ) : (
                    <div className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </div>
              ) : null}
              <Link
                href={withReturnTo(`/projects/${project.id}`, returnTo)}
                className="flex flex-1 flex-col gap-1.5 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ProjectAvatar abbreviation={project.abbreviation} />
                    <span className="truncate text-[13px] font-semibold text-foreground">
                      {project.name}
                    </span>
                    {firedProjectIdSet.has(project.id) ? <AlertDot /> : null}
                  </span>
                  <ProjectStatusPill status={project.status} />
                </div>
                <span className="text-[13px] text-muted-foreground">
                  {project.client.name}
                </span>
                <div className="mt-1 flex items-center justify-between gap-2 border-t border-muted pt-2">
                  <span
                    className={cn(
                      "truncate text-[12px]",
                      paymentMethod.missing
                        ? "font-semibold text-[var(--alert-warning-text)]"
                        : "text-[var(--text-secondary)]",
                    )}
                  >
                    {paymentMethod.text}
                  </span>
                  <span className="font-mono text-[12px] text-foreground">
                    {project.displayCurrency}
                  </span>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
