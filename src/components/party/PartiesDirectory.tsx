"use client";

import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FiltersButton } from "@/components/shared/FiltersButton";
import { ViewToggle } from "@/components/shared/ViewToggle";
import { useViewPreference } from "@/lib/useViewPreference";
import { PartyTable } from "@/components/party/PartyTable";
import { PartyCardGrid } from "@/components/party/PartyCardGrid";
import type { Party } from "@/generated/prisma/client";
import type { PartyBillingRow } from "@/lib/partyBillingStatus";

const VIEW_STORAGE_KEY = "parties-view";

/**
 * Parties list toolbar + search + table/card view switch — redesign v3
 * milestone 6, card view added later matching ProjectsDirectory.tsx's
 * pattern exactly (same ViewToggle/useViewPreference, same
 * "table" | "cards" state shape) for consistency between the two
 * directories. `filterSlot` (the Client/Contractor chips) renders in the
 * same row as search, matching the reference's single-row toolbar rather
 * than stacking search and filters on separate lines.
 */
export function PartiesDirectory({
  parties,
  billingRowByPartyId,
  locationByPartyId,
  filterSlot,
  returnTo,
}: {
  parties: Party[];
  billingRowByPartyId: Record<string, PartyBillingRow>;
  /** "City, State, Country" of each party's default address (empty when it has none). */
  locationByPartyId: Record<string, string>;
  filterSlot?: ReactNode;
  /** This list page's own current path — carried through so back-navigation from a party's detail page returns here. */
  returnTo?: string;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useViewPreference(VIEW_STORAGE_KEY);

  const filtered = parties.filter((party) => {
    if (!query.trim()) return true;
    const haystack = `${party.name} ${party.email ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[280px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search parties…"
            aria-label="Search parties"
            className="pl-8"
          />
        </div>
        {filterSlot}
        <div className="ml-auto flex items-center gap-3">
          <ViewToggle view={view} onChange={setView} />
          <FiltersButton />
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center text-[12px] text-muted-foreground">
          No parties match “{query}”.
        </div>
      ) : view === "table" ? (
        <PartyTable
          parties={filtered}
          billingRowByPartyId={billingRowByPartyId}
          locationByPartyId={locationByPartyId}
          returnTo={returnTo}
        />
      ) : (
        <PartyCardGrid
          parties={filtered}
          billingRowByPartyId={billingRowByPartyId}
          locationByPartyId={locationByPartyId}
          returnTo={returnTo}
        />
      )}
    </div>
  );
}
