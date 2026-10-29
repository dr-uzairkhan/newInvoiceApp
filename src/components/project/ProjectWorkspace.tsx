"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { withReturnTo } from "@/lib/backNavigation";
import { formatCurrency } from "@/lib/currency";
import { formatShortDate } from "@/lib/dates";
import { paymentMethodSummary } from "@/components/project/ProjectTable";
import {
  BILLING_TONE_ACCENT,
  BILLING_TONE_PILL,
  type ProjectBillingRow,
} from "@/lib/projectBillingStatus";
import type { ProjectWithRelations } from "@/repositories/projectRepository";

export type ProjectWorkspaceInvoice = {
  id: string;
  projectId: string;
  invoiceNumber: string;
  issueDate: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  total: string;
  currency: string;
  commentCount: number;
};

const PAGE_SIZE = 4;

function WorkspacePager({
  currentPage,
  pageCount,
  projectCount,
  placement,
  onPageChange,
}: {
  currentPage: number;
  pageCount: number;
  projectCount: number;
  placement: "top" | "bottom";
  onPageChange: (page: number) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between",
        placement === "top" ? "mb-4" : "mt-4",
      )}
    >
      <span className="text-[11px] text-muted-foreground">
        {currentPage * PAGE_SIZE + 1}–
        {Math.min((currentPage + 1) * PAGE_SIZE, projectCount)} of{" "}
        {projectCount}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-label={`Previous projects (${placement})`}
          disabled={currentPage === 0}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Next projects (${placement})`}
          disabled={currentPage + 1 >= pageCount}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ProjectWorkspace({
  projects,
  invoices,
  billingRowByProjectId,
  returnTo,
}: {
  projects: ProjectWithRelations[];
  invoices: ProjectWorkspaceInvoice[];
  billingRowByProjectId: Record<string, ProjectBillingRow>;
  returnTo?: string;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = projects.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const invoicesByProject = useMemo(() => {
    const map = new Map<string, ProjectWorkspaceInvoice[]>();
    for (const invoice of invoices) {
      const list = map.get(invoice.projectId) ?? [];
      list.push(invoice);
      map.set(invoice.projectId, list);
    }
    for (const list of map.values())
      list.sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime());
    return map;
  }, [invoices]);
  return (
    <div>
      {pageCount > 1 ? (
        <WorkspacePager
          currentPage={currentPage}
          pageCount={pageCount}
          projectCount={projects.length}
          placement="top"
          onPageChange={setPage}
        />
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:min-h-[700px] lg:grid-cols-2 lg:content-start">
        {visible.map((project) => {
          const row = billingRowByProjectId[project.id];
          const payment = paymentMethodSummary(project);
          const recent = (invoicesByProject.get(project.id) ?? []).slice(0, 2);
          return (
            <article
              key={project.id}
              className="relative overflow-hidden rounded-xl border border-border bg-card"
            >
              <span
                className={cn(
                  "absolute inset-y-0 left-0 w-[3px]",
                  row ? BILLING_TONE_ACCENT[row.statusTone] : "bg-border",
                )}
              />
              <div className="flex items-start justify-between gap-3 px-5 py-4 pl-6">
                <div className="min-w-0">
                  <Link
                    href={withReturnTo(`/projects/${project.id}`, returnTo)}
                    className="text-[14px] font-bold hover:text-brand hover:underline"
                  >
                    {project.name}
                  </Link>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {project.client.name} · {project.contractor.name}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-md px-2 py-1 text-[10px] font-bold uppercase",
                    row
                      ? BILLING_TONE_PILL[row.statusTone]
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {row?.statusLabel ?? "Archived"}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-3 border-y border-muted bg-muted/20 px-5 py-3 pl-6 text-[11px]">
                <div>
                  <dt className="font-bold uppercase text-muted-foreground">
                    Billing
                  </dt>
                  <dd className="mt-1">
                    {row?.billingLabel ?? "—"} · {project.displayCurrency}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase text-muted-foreground">
                    Next invoice
                  </dt>
                  <dd className="mt-1">
                    {row?.nextInvoiceDate
                      ? formatShortDate(row.nextInvoiceDate)
                      : "Not scheduled"}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="font-bold uppercase text-muted-foreground">
                    Payment method
                  </dt>
                  <dd
                    className={cn(
                      "mt-1",
                      payment.missing &&
                        "font-semibold text-[var(--alert-warning-text)]",
                    )}
                  >
                    {payment.text}
                  </dd>
                </div>
              </dl>
              <div className="px-5 py-3 pl-6">
                <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                  Recent invoices
                </p>
                {recent.length === 0 ? (
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>No invoices yet</span>
                    <Link
                      className="font-bold text-brand"
                      href={withReturnTo(
                        `/invoices/new/${project.id}`,
                        returnTo,
                      )}
                    >
                      Create invoice →
                    </Link>
                  </div>
                ) : (
                  recent.map((invoice) => (
                    <Link
                      key={invoice.id}
                      href={withReturnTo(`/invoices/${invoice.id}`, returnTo)}
                      className="grid grid-cols-[1fr_auto_auto] gap-3 border-t border-muted py-2 text-[11px] first:border-t-0"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 font-mono font-semibold">
                        <span className="truncate">{invoice.invoiceNumber}</span>
                        {invoice.commentCount > 0 ? (
                          <span
                            className="inline-flex shrink-0 items-center gap-0.5 font-sans text-[10px] font-normal text-muted-foreground"
                            aria-label={`${invoice.commentCount} comments`}
                          >
                            <MessageSquare className="h-3 w-3" />
                            {invoice.commentCount}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground">
                        {invoice.periodStart && invoice.periodEnd
                          ? `${formatShortDate(invoice.periodStart)}–${formatShortDate(invoice.periodEnd)}`
                          : "—"}
                      </span>
                      <span className="font-mono font-semibold">
                        {formatCurrency(
                          invoice.total.toString(),
                          invoice.currency,
                        )}
                      </span>
                    </Link>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between border-t border-muted px-5 py-3 pl-6">
                <Link
                  className="text-[11px] font-bold text-brand"
                  href={withReturnTo(`/projects/${project.id}`, returnTo)}
                >
                  Open workspace →
                </Link>
                <Link
                  className="text-[11px] font-bold text-brand"
                  href={withReturnTo(`/invoices/new/${project.id}`, returnTo)}
                >
                  New invoice
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      {pageCount > 1 ? (
        <WorkspacePager
          currentPage={currentPage}
          pageCount={pageCount}
          projectCount={projects.length}
          placement="bottom"
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
