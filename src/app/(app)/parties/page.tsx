import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PartiesDirectory } from "@/components/party/PartiesDirectory";
import { PartySummaryStats } from "@/components/party/PartySummaryStats";
import {
  PartyRelationshipFilter,
  type PartyRelationshipFilterValue,
} from "@/components/party/PartyRelationshipFilter";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { partyService } from "@/services/partyService";
import { partyAddressService } from "@/services/partyAddressService";
import { defaultAddressOf } from "@/lib/partyAddress";
import { projectService } from "@/services/projectService";
import { invoiceService } from "@/services/invoiceService";
import { buildPartyBillingRows } from "@/lib/partyBillingStatus";
import { formatCurrency } from "@/lib/currency";

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

/** Unrecognized/missing `?type=` falls back to "all". */
function resolveFilter(type: string | undefined): PartyRelationshipFilterValue {
  if (type === "client" || type === "contractor") return type;
  return "all";
}

const EMPTY_STATE_COPY: Record<
  PartyRelationshipFilterValue,
  { title: string; description: string }
> = {
  all: {
    title: "No parties yet",
    description:
      "Create your first party to use it as a contractor or client on a project.",
  },
  client: {
    title: "No clients yet",
    description: "Parties appear here once a project lists them as its client.",
  },
  contractor: {
    title: "No contractors yet",
    description:
      "Parties appear here once a project lists them as its contractor.",
  },
};

export default async function PartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string }>;
}) {
  const { type, from } = await searchParams;
  const filter = resolveFilter(type);
  const cameFromDashboard = from === "dashboard";

  const [parties, addressesByPartyId, allProjects, allInvoices] =
    await Promise.all([
      partyService.list(),
      partyAddressService.listAllGroupedByParty(),
      projectService.list(),
      invoiceService.list(),
    ]);

  // "City, State, Country" of each party's default address — the one-line
  // location the cards and rows show.
  const locationByPartyId: Record<string, string> = Object.fromEntries(
    parties.map((party) => {
      const address = defaultAddressOf(addressesByPartyId[party.id] ?? []);
      return [
        party.id,
        [address?.city, address?.state, address?.country]
          .filter(Boolean)
          .join(", "),
      ];
    }),
  );

  const billingRows = buildPartyBillingRows({
    parties,
    allProjects,
    allInvoices,
  });
  const billingRowByPartyId = Object.fromEntries(
    billingRows.map((row) => [row.partyId, row]),
  );

  const partiesForFilter = parties.filter((party) => {
    if (filter === "all") return true;
    const relationship = billingRowByPartyId[party.id].relationship;
    return filter === "client"
      ? relationship === "client" || relationship === "both"
      : relationship === "contractor" || relationship === "both";
  });

  const clientCount = billingRows.filter(
    (row) => row.relationship === "client" || row.relationship === "both",
  ).length;
  const contractorCount = billingRows.filter(
    (row) => row.relationship === "contractor" || row.relationship === "both",
  ).length;
  const activeRelationshipCount = billingRows.filter(
    (row) => row.activeProjectCount > 0,
  ).length;
  const receivableRows = billingRows.filter(
    (row) => row.outstandingByCurrency.length > 0,
  );
  const openReceivablesUsd = receivableRows.reduce(
    (sum, row) =>
      sum +
      Number(
        row.outstandingByCurrency.find((bucket) => bucket.currency === "USD")
          ?.total ?? 0,
      ),
    0,
  );
  const overdueRows = billingRows.filter((row) => row.healthTone === "overdue");
  const overdueParty =
    overdueRows.length === 1
      ? parties.find((party) => party.id === overdueRows[0].partyId)
      : undefined;

  const emptyCopy = EMPTY_STATE_COPY[filter];

  // Mirrors ProjectStatusFilter's own hrefFor — so embedded links can carry
  // this page's real current state back through `returnTo`.
  const ownPathParams = new URLSearchParams();
  if (filter !== "all") ownPathParams.set("type", filter);
  if (cameFromDashboard) ownPathParams.set("from", "dashboard");
  const ownPathQuery = ownPathParams.toString();
  const ownPath = ownPathQuery ? `/parties?${ownPathQuery}` : "/parties";

  return (
    <>
      <PageHeader
        eyebrow="Invoice operations"
        title="Parties"
        subtitle="Clients and contractors, with their billing relationship at a glance."
        backHref={cameFromDashboard ? "/" : undefined}
        backLabel="Back to Dashboard"
        action={
          <Button nativeButton={false} render={<Link href="/parties/new" />}>
            Create Party
          </Button>
        }
      />
      <PartySummaryStats
        totalParties={{
          value: parties.length.toString(),
          note: `${clientCount} ${pluralize(clientCount, "client")} · ${contractorCount} ${pluralize(contractorCount, "contractor")}`,
        }}
        activeRelationships={{
          value: activeRelationshipCount.toString(),
          note: "With active projects",
        }}
        openReceivables={{
          value: formatCurrency(openReceivablesUsd, "USD"),
          note: `Across ${receivableRows.length} ${pluralize(receivableRows.length, "client")}`,
        }}
        needsAttention={{
          value: overdueRows.length.toString(),
          note:
            overdueRows.length === 0
              ? "Nothing overdue"
              : overdueParty
                ? `${overdueParty.name} · overdue`
                : `${pluralize(overdueRows.length, "party", "parties")} overdue`,
        }}
      />
      {partiesForFilter.length === 0 ? (
        <>
          <PartyRelationshipFilter
            active={filter}
            fromDashboard={cameFromDashboard}
          />
          <EmptyState
            icon={Users}
            title={emptyCopy.title}
            description={emptyCopy.description}
            action={
              filter === "all" ? (
                <Button
                  nativeButton={false}
                  render={<Link href="/parties/new" />}
                >
                  Create your first party
                </Button>
              ) : undefined
            }
          />
        </>
      ) : (
        <PartiesDirectory
          parties={partiesForFilter}
          billingRowByPartyId={billingRowByPartyId}
          locationByPartyId={locationByPartyId}
          filterSlot={
            <PartyRelationshipFilter
              active={filter}
              fromDashboard={cameFromDashboard}
            />
          }
          returnTo={ownPath}
        />
      )}
    </>
  );
}
