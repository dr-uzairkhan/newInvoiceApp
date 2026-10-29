import { cn } from "@/lib/utils";

/**
 * Invoices list summary row (ui_redesign_handoff_v3
 * screenshots/06-invoices-desktop.jpg) — plain static stat cards, no
 * click-to-filter behavior (there's no list here for a stat to drive — the
 * existing status filter tabs already
 * cover that).
 */
export function InvoiceSummaryStats({
  outstanding,
  dueSoon,
  overdue,
  paidThisMonth,
}: {
  outstanding: { amount: string; note: string };
  dueSoon: { amount: string; note: string };
  overdue: { amount: string; note: string };
  paidThisMonth: { amount: string; note: string };
}) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Outstanding"
        value={outstanding.amount}
        note={outstanding.note}
      />
      <Stat label="Due soon" value={dueSoon.amount} note={dueSoon.note} />
      <Stat label="Overdue" value={overdue.amount} note={overdue.note} danger />
      <Stat
        label="Paid this month"
        value={paidThisMonth.amount}
        note={paidThisMonth.note}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  danger = false,
}: {
  label: string;
  value: string;
  note: string;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card p-4",
        danger &&
          "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--status-overdue-text)]",
      )}
    >
      <span className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <div
        className={cn(
          "mt-2 font-mono text-xl font-bold text-foreground",
          danger && "text-[var(--status-overdue-text)]",
        )}
      >
        {value}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}
