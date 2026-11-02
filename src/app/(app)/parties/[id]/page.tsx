import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { PartyForm } from "@/components/party/PartyForm";
import { PartyDetailCard } from "@/components/party/PartyDetailCard";
import { PartyDeleteButton } from "@/components/party/PartyDeleteButton";
import {
  PartyDetailTabs,
  type PartyDetailTab,
} from "@/components/party/PartyDetailTabs";
import { PaymentMethodList } from "@/components/payment-method/PaymentMethodList";
import { PartyAddressList } from "@/components/party-address/PartyAddressList";
import { InvoiceTable } from "@/components/invoice/InvoiceTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { partyService } from "@/services/partyService";
import { paymentMethodService } from "@/services/paymentMethodService";
import { partyAddressService } from "@/services/partyAddressService";
import { projectService } from "@/services/projectService";
import { invoiceService } from "@/services/invoiceService";
import { buildInvoiceTableRows } from "@/lib/invoiceTableRows";
import { resolveBackTarget, withReturnTo } from "@/lib/backNavigation";
import type { Party, PartyAddress } from "@/generated/prisma/client";

function resolveTab(value: string | undefined): PartyDetailTab {
  if (
    value === "addresses" ||
    value === "payment-methods" ||
    value === "invoices"
  ) {
    return value;
  }
  return "overview";
}

export default async function PartyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; edit?: string; returnTo?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam, edit, returnTo } = await searchParams;
  const tab = resolveTab(tabParam);
  const isEditingOverview = tab === "overview" && edit === "1";
  const back = resolveBackTarget(returnTo, {
    href: "/parties",
    label: "Back to Parties",
  });

  const party = await partyService.getById(id);
  if (!party) {
    notFound();
  }

  if (isEditingOverview) {
    return (
      <>
        <PageHeader
          title={party.name}
          subtitle="Edit party details."
          backHref={back.href}
          backLabel={back.label}
          action={
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link href={withReturnTo(`/parties/${party.id}`, returnTo)} />
              }
            >
              Cancel
            </Button>
          }
        />
        <PartyForm
          mode="edit"
          partyId={party.id}
          defaultValues={{
            name: party.name,
            email: party.email ?? "",
            type: party.type,
          }}
        />
      </>
    );
  }

  const [isDeletable, addresses, paymentMethodsCount, invoicesCount] =
    await Promise.all([
      partyService.isDeletable(id),
      partyAddressService.listForParty(id),
      paymentMethodService.countForParty(id),
      invoiceService.countByParty(id),
    ]);

  return (
    <>
      <PageHeader
        title={party.name}
        subtitle="View party details, addresses and payment methods."
        backHref={back.href}
        backLabel={back.label}
        action={
          <PartyDeleteButton
            partyId={party.id}
            partyName={party.name}
            isDeletable={isDeletable}
          />
        }
      />
      <PartyDetailTabs
        partyId={party.id}
        active={tab}
        addressesCount={addresses.length}
        paymentMethodsCount={paymentMethodsCount}
        invoicesCount={invoicesCount}
        returnTo={returnTo}
      />

      {tab === "overview" ? (
        <PartyDetailCard
          party={party}
          addresses={addresses}
          editHref={withReturnTo(
            `/parties/${party.id}?tab=overview&edit=1`,
            returnTo,
          )}
          returnTo={returnTo}
        />
      ) : tab === "addresses" ? (
        <AddressesTab party={party} addresses={addresses} returnTo={returnTo} />
      ) : tab === "payment-methods" ? (
        <PaymentMethodsTab party={party} returnTo={returnTo} />
      ) : (
        <InvoicesTab party={party} returnTo={returnTo} />
      )}
    </>
  );
}

/** The party's addresses (already fetched for the tab badge) with each one's live project references. */
async function AddressesTab({
  party,
  addresses,
  returnTo,
}: {
  party: Party;
  addresses: PartyAddress[];
  returnTo?: string;
}) {
  const [deletableFlags, projectRefsByAddressId] = await Promise.all([
    Promise.all(
      addresses.map((address) => partyAddressService.isDeletable(address.id)),
    ),
    projectService.listProjectRefsByAddress(
      addresses.map((address) => address.id),
    ),
  ]);
  const deletableIds = new Set(
    addresses
      .filter((_, index) => deletableFlags[index])
      .map((address) => address.id),
  );

  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-foreground">Addresses</h2>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        A party can have several addresses. Each project picks which one its
        invoices show, falling back to the default when it doesn&rsquo;t.
      </p>
      <PartyAddressList
        partyId={party.id}
        addresses={addresses}
        deletableIds={deletableIds}
        projectRefsByAddressId={projectRefsByAddressId}
        returnTo={returnTo}
      />
    </>
  );
}

/** Fetches the full payment-method list itself — only rendered when this tab is active, see the party detail page's own tab-count fetch above. */
async function PaymentMethodsTab({
  party,
  returnTo,
}: {
  party: Party;
  returnTo?: string;
}) {
  const paymentMethods = await paymentMethodService.listForParty(party.id);
  const [deletableFlags, projectRefsByPaymentMethodId] = await Promise.all([
    Promise.all(
      paymentMethods.map((method) =>
        paymentMethodService.isDeletable(method.id),
      ),
    ),
    projectService.listProjectRefsByPreferredPaymentMethod(
      paymentMethods.map((method) => method.id),
    ),
  ]);
  const deletableIds = new Set(
    paymentMethods
      .filter((_, index) => deletableFlags[index])
      .map((method) => method.id),
  );

  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-foreground">
          Payment Methods
        </h2>
        {paymentMethods.length > 0 ? (
          <Button
            variant="outline"
            className="h-8 px-3 text-[12px]"
            nativeButton={false}
            render={
              <Link
                href={withReturnTo(
                  `/parties/${party.id}/payment-methods/new`,
                  withReturnTo(
                    `/parties/${party.id}?tab=payment-methods`,
                    returnTo,
                  ),
                )}
              />
            }
          >
            Add Payment Method
          </Button>
        ) : null}
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Only needed if this party is ever used as a project&rsquo;s contractor —
        a party used only as a client doesn&rsquo;t need one.
      </p>
      <PaymentMethodList
        partyId={party.id}
        paymentMethods={paymentMethods}
        deletableIds={deletableIds}
        projectRefsByPaymentMethodId={projectRefsByPaymentMethodId}
        returnTo={returnTo}
      />
    </>
  );
}

/** Fetches the full invoice list itself — only rendered when this tab is active, see the party detail page's own tab-count fetch above. */
async function InvoicesTab({
  party,
  returnTo,
}: {
  party: Party;
  returnTo?: string;
}) {
  const invoices = await invoiceService.listByParty(party.id);
  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-foreground">Invoices</h2>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Every invoice where {party.name} is the client or the contractor.
      </p>
      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Invoices will appear here once this party is used as a project's client or contractor."
        />
      ) : (
        <InvoiceTable
          invoices={await buildInvoiceTableRows(invoices)}
          returnTo={withReturnTo(`/parties/${party.id}?tab=invoices`, returnTo)}
        />
      )}
    </>
  );
}
