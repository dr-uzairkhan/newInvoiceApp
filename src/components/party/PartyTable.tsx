import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { withReturnTo } from "@/lib/backNavigation";
import type { Party } from "@/generated/prisma/client";
import type {
  PartyBillingRow,
  PartyHealthTone,
  PartyRelationship,
} from "@/lib/partyBillingStatus";

/**
 * Parties directory — redesign v3 milestone 6
 * (ui_redesign_handoff_v3/rendered-html/03-parties.html). Same dual-layout
 * convention as InvoiceTable.tsx/ProjectTable.tsx: a dark-header grid table
 * at `≥1024px`, replaced entirely by stacked cards below that. "Relationship"
 * is display-only, derived live by partyBillingStatus.ts — not a stored
 * field (Docs/implementation_decisions.md §15 has no Party.Role).
 */
const DESKTOP_GRID = "grid-cols-[1.6fr_1fr_1.4fr_1fr_1fr_1.1fr_28px]";

export const RELATIONSHIP_LABELS: Record<PartyRelationship, string> = {
  client: "Client",
  contractor: "Contractor",
  both: "Client & Contractor",
  unassigned: "Unassigned",
};

const HEALTH_STYLES: Record<PartyHealthTone, string> = {
  overdue: "bg-[var(--status-overdue-bg)] text-[var(--status-overdue-text)]",
  dueSoon: "bg-[var(--status-sent-bg)] text-[var(--status-sent-text)]",
  current: "bg-[var(--status-paid-bg)] text-[var(--status-paid-text)]",
  none: "bg-muted text-[var(--text-secondary)]",
  internal: "bg-muted text-[var(--text-secondary)]",
};

const RELATIONSHIP_STYLES: Record<PartyRelationship, string> = {
  client:
    "bg-[var(--relationship-client-bg)] text-[var(--relationship-client-text)]",
  contractor:
    "bg-[var(--relationship-contractor-bg)] text-[var(--relationship-contractor-text)]",
  both: "bg-[var(--relationship-both-bg)] text-[var(--relationship-both-text)]",
  unassigned: "bg-muted text-muted-foreground",
};

/** First letters of the first two words, or the first two characters of a single-word name. */
function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function PartyAvatar({ name }: { name: string }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#ede9fe] font-mono text-[11px] font-bold text-brand">
      {initialsFor(name)}
    </span>
  );
}

export function formatOutstanding(row: PartyBillingRow): string {
  if (row.outstandingByCurrency.length === 0) return "—";
  const [first, ...rest] = row.outstandingByCurrency;
  const primary = formatCurrency(first.total, first.currency);
  return rest.length > 0 ? `${primary} +${rest.length} more` : primary;
}

export function HealthPill({ row }: { row: PartyBillingRow }) {
  return (
    <span
      className={cn(
        "inline-block rounded-md px-2 py-1 text-[10px] font-bold whitespace-nowrap uppercase",
        HEALTH_STYLES[row.healthTone],
      )}
    >
      {row.healthLabel}
    </span>
  );
}

/** Client/Contractor/Both/Unassigned — display-only, derived live by partyBillingStatus.ts, not a stored field. */
export function RelationshipTag({ row }: { row: PartyBillingRow }) {
  return (
    <span
      className={cn(
        "inline-block w-fit rounded-md px-2 py-1 text-[10px] font-bold whitespace-nowrap uppercase",
        RELATIONSHIP_STYLES[row.relationship],
      )}
    >
      {RELATIONSHIP_LABELS[row.relationship]}
    </span>
  );
}

export function PartyTable({
  parties,
  billingRowByPartyId,
  locationByPartyId,
  returnTo,
}: {
  parties: Party[];
  billingRowByPartyId: Record<string, PartyBillingRow>;
  /** "City, State, Country" of each party's default address (empty when it has none). */
  locationByPartyId: Record<string, string>;
  /** The list page's own current path — carried through so back-navigation from a party's detail page returns here. */
  returnTo?: string;
}) {
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
          <span>Party</span>
          <span>Relationship</span>
          <span>Contact</span>
          <span>Active projects</span>
          <span>Outstanding</span>
          <span>Billing health</span>
          <span />
        </div>
        {parties.map((party, index) => {
          const row = billingRowByPartyId[party.id];
          const location = locationByPartyId[party.id] ?? "";
          return (
            <Link
              key={party.id}
              href={withReturnTo(`/parties/${party.id}`, returnTo)}
              className={cn(
                "grid items-center gap-3 px-5 py-3.5 hover:bg-muted/40",
                DESKTOP_GRID,
                index > 0 && "border-t border-muted",
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <PartyAvatar name={party.name} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-foreground">
                    {party.name}
                  </span>
                  {location ? (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {location}
                    </span>
                  ) : null}
                </span>
              </span>
              <RelationshipTag row={row} />
              <span className="truncate text-[13px] text-muted-foreground">
                {party.email ?? "—"}
              </span>
              <span className="truncate text-[13px] text-foreground">
                {row.activeProjectCount}
              </span>
              <span className="truncate font-mono text-[12px] font-semibold text-foreground">
                {formatOutstanding(row)}
              </span>
              <HealthPill row={row} />
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--border-heavy)]" />
            </Link>
          );
        })}
      </div>

      {/* Mobile stacked cards */}
      <div className="flex flex-col gap-3 lg:hidden">
        {parties.map((party) => {
          const row = billingRowByPartyId[party.id];
          return (
            <Link
              key={party.id}
              href={withReturnTo(`/parties/${party.id}`, returnTo)}
              className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2.5">
                  <PartyAvatar name={party.name} />
                  <span className="truncate text-[13px] font-semibold text-foreground">
                    {party.name}
                  </span>
                </span>
                <HealthPill row={row} />
              </div>
              <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <RelationshipTag row={row} />
                {party.email ? <span>· {party.email}</span> : null}
              </span>
              <div className="mt-1 flex items-center justify-between border-t border-muted pt-2">
                <span className="text-[12px] text-muted-foreground">
                  {row.activeProjectCount}{" "}
                  {row.activeProjectCount === 1
                    ? "active project"
                    : "active projects"}
                </span>
                <span className="font-mono text-[12px] font-semibold text-foreground">
                  {formatOutstanding(row)}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
