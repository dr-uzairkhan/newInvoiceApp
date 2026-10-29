import Link from "next/link";
import { FileText, Layers, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { InvoicesDirectory } from "@/components/invoice/InvoicesDirectory";
import { ProjectStatusPill } from "@/components/project/ProjectStatusPill";
import { projectService } from "@/services/projectService";
import { invoiceService } from "@/services/invoiceService";
import { buildInvoiceTableRows } from "@/lib/invoiceTableRows";
import { formatCurrency } from "@/lib/currency";
import { formatDisplayDate, startOfMonthUTC } from "@/lib/dates";
import { withReturnTo } from "@/lib/backNavigation";
import type { InvoiceListItem } from "@/repositories/invoiceRepository";

const OWN_PATH = "/internal";

/** Per-currency sums, never blended (M26) — rendered as one line per currency. */
function sumByCurrency(
  invoices: InvoiceListItem[],
): { currency: string; total: string }[] {
  const totals = new Map<string, number>();
  for (const invoice of invoices) {
    totals.set(
      invoice.currency,
      (totals.get(invoice.currency) ?? 0) + Number(invoice.total),
    );
  }
  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, total]) => ({ currency, total: total.toString() }));
}

function StatTile({
  label,
  lines,
  value,
  note,
}: {
  label: string;
  lines: { currency: string; total: string }[];
  /** Plain figure for a count tile (used when `lines` is empty). */
  value?: string;
  note: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-[11px] font-bold tracking-[0.05em] text-muted-foreground uppercase">
          {label}
        </p>
        {lines.length === 0 ? (
          <p className="mt-1 font-mono text-[20px] font-bold text-foreground">
            {value ?? "—"}
          </p>
        ) : (
          lines.map((line) => (
            <p
              key={line.currency}
              className="mt-1 font-mono text-[20px] font-bold text-foreground first:mt-1 [&:not(:first-child)]:text-[14px]"
            >
              {formatCurrency(line.total, line.currency)}
            </p>
          ))
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}

/**
 * §33 — the internal ledger's only surface: on-demand projects whose
 * invoices never appear on the dashboard, the Projects or Invoices pages,
 * or any count. Deliberately not a second dashboard: there are no reminder
 * schedules or billing periods here, so it is a stat row, the projects, and
 * the shared invoice table.
 */
export default async function InternalPage() {
  const [projects, invoices] = await Promise.all([
    projectService.list({ ledger: "INTERNAL" }),
    invoiceService.list({ ledger: "INTERNAL" }),
  ]);
  const monthStart = startOfMonthUTC();
  const outstanding = invoices.filter((invoice) => invoice.status === "SENT");
  const drafts = invoices.filter((invoice) => invoice.status === "DRAFT");
  const paidThisMonth = invoices.filter(
    (invoice) => invoice.status === "PAID" && invoice.updatedAt >= monthStart,
  );
  const lastInvoiceByProjectId = new Map<string, InvoiceListItem>();
  for (const invoice of invoices) {
    if (!lastInvoiceByProjectId.has(invoice.projectId)) {
      lastInvoiceByProjectId.set(invoice.projectId, invoice);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Internal ledger"
        title="Internal"
        subtitle="On-demand projects and invoices kept separate from the main dashboard, lists and counts."
        action={
          <Button
            nativeButton={false}
            render={<Link href="/projects/new?ledger=INTERNAL" />}
          >
            <Plus className="h-3.5 w-3.5" />
            New internal project
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Outstanding"
          lines={sumByCurrency(outstanding)}
          note={`${outstanding.length} sent, awaiting payment`}
        />
        <StatTile
          label="Drafts"
          lines={[]}
          value={String(drafts.length)}
          note={`${drafts.length} draft${drafts.length === 1 ? "" : "s"} not yet sent`}
        />
        <StatTile
          label="Paid this month"
          lines={sumByCurrency(paidThisMonth)}
          note={`${paidThisMonth.length} invoice${paidThisMonth.length === 1 ? "" : "s"}`}
        />
      </div>

      <h2 className="mb-3 text-[14px] font-bold text-foreground">Projects</h2>
      {projects.length === 0 ? (
        <div className="mb-8">
          <EmptyState
            icon={Layers}
            title="No internal projects yet"
            description="An internal project issues on-demand invoices from any party you choose and never shows up on the main dashboard."
            action={
              <Button
                nativeButton={false}
                render={<Link href="/projects/new?ledger=INTERNAL" />}
              >
                Create the first internal project
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const last = lastInvoiceByProjectId.get(project.id);
            const open = outstanding.filter(
              (invoice) => invoice.projectId === project.id,
            );
            return (
              <Card key={project.id} className="relative">
                <CardContent className="flex flex-col gap-2 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={withReturnTo(`/projects/${project.id}`, OWN_PATH)}
                      className="text-[14px] font-bold text-foreground hover:text-brand hover:underline"
                    >
                      {project.name}
                    </Link>
                    <ProjectStatusPill status={project.status} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <dt className="text-muted-foreground">Client</dt>
                    <dd className="truncate text-foreground">
                      {project.client.name}
                    </dd>
                    <dt className="text-muted-foreground">Issued by</dt>
                    <dd className="truncate text-foreground">
                      {project.contractor.name}
                    </dd>
                    <dt className="text-muted-foreground">Last invoice</dt>
                    <dd className="text-foreground">
                      {last
                        ? `${last.invoiceNumber} · ${formatDisplayDate(last.issueDate)}`
                        : "—"}
                    </dd>
                    <dt className="text-muted-foreground">Outstanding</dt>
                    <dd className="font-mono text-foreground">
                      {open.length === 0
                        ? "—"
                        : sumByCurrency(open)
                            .map((line) =>
                              formatCurrency(line.total, line.currency),
                            )
                            .join(" · ")}
                    </dd>
                  </dl>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1 w-fit"
                    nativeButton={false}
                    render={
                      <Link
                        href={withReturnTo(
                          `/invoices/new/${project.id}`,
                          OWN_PATH,
                        )}
                      />
                    }
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Create invoice
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 text-[14px] font-bold text-foreground">Invoices</h2>
      {invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No internal invoices yet"
          description="Create an internal project, then create invoices from its card above."
        />
      ) : (
        <InvoicesDirectory
          invoices={await buildInvoiceTableRows(invoices)}
          returnTo={OWN_PATH}
        />
      )}
    </>
  );
}
