import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  PartyAvatar,
  RELATIONSHIP_LABELS,
  RelationshipTag,
  formatOutstanding,
} from "@/components/party/PartyTable";
import { withReturnTo } from "@/lib/backNavigation";
import type { Party } from "@/generated/prisma/client";
import type {
  PartyBillingRow,
  PartyHealthTone,
} from "@/lib/partyBillingStatus";

const TONE_ACCENT: Record<PartyHealthTone, string> = {
  overdue: "bg-[var(--status-overdue-text)]",
  dueSoon: "bg-[var(--status-sent-text)]",
  current: "bg-[var(--status-paid-text)]",
  none: "bg-border",
  internal: "bg-border",
};

const TONE_PILL: Record<PartyHealthTone, string> = {
  overdue: "bg-[var(--status-overdue-bg)] text-[var(--status-overdue-text)]",
  dueSoon: "bg-[var(--status-sent-bg)] text-[var(--status-sent-text)]",
  current: "bg-[var(--status-paid-bg)] text-[var(--status-paid-text)]",
  none: "bg-muted text-muted-foreground",
  internal: "bg-muted text-muted-foreground",
};

/**
 * Parties list — alternative card view, same shape as
 * ProjectCardGrid.tsx (accent bar / identity row / status-and-amount row /
 * facts grid / footer link) so the two directories read as one system.
 */
export function PartyCardGrid({
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {parties.map((party) => {
        const row = billingRowByPartyId[party.id];
        const location = locationByPartyId[party.id] ?? "";

        return (
          <Link
            key={party.id}
            href={withReturnTo(`/parties/${party.id}`, returnTo)}
            className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <span
              className={cn(
                "absolute top-0 bottom-0 left-0 w-[3px]",
                TONE_ACCENT[row.healthTone],
              )}
            />
            <div className="flex items-center gap-2.5 py-3.5 pr-4 pl-5">
              <PartyAvatar name={party.name} />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-foreground">
                  {party.name}
                </span>
                <p className="truncate text-[11px] text-muted-foreground">
                  {location || RELATIONSHIP_LABELS[row.relationship]}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between border-y border-muted bg-muted/30 px-5 py-2.5">
              <span
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] font-bold whitespace-nowrap uppercase",
                  TONE_PILL[row.healthTone],
                )}
              >
                {row.healthLabel}
              </span>
              {row.outstandingByCurrency.length > 0 ? (
                <span className="font-mono text-[13px] font-semibold text-foreground">
                  {formatOutstanding(row)}
                </span>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3 px-5 py-3.5 text-[11px]">
              <div>
                <dt className="font-bold tracking-wide text-muted-foreground uppercase">
                  Relationship
                </dt>
                <dd className="mt-1">
                  <RelationshipTag row={row} />
                </dd>
              </div>
              <div>
                <dt className="font-bold tracking-wide text-muted-foreground uppercase">
                  Active projects
                </dt>
                <dd className="mt-1 text-foreground">
                  {row.activeProjectCount}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="font-bold tracking-wide text-muted-foreground uppercase">
                  Contact
                </dt>
                <dd className="mt-1 truncate text-foreground">
                  {party.email ?? "—"}
                </dd>
              </div>
            </dl>
            <div className="mt-auto flex items-center justify-between border-t border-muted px-5 py-2.5 text-[11px] font-bold text-brand">
              Open party
              <span>→</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
