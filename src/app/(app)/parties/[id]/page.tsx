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
import { InvoiceTable } from "@/components/invoice/InvoiceTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { partyService } from "@/services/partyService";
import { paymentMethodService } from "@/services/paymentMethodService";
import { projectService } from "@/services/projectService";
import { invoiceService } from "@/services/invoiceService";
import { toInvoiceTableRow } from "@/lib/invoiceTableRow";
import { resolveBackTarget, withReturnTo } from "@/lib/backNavigation";
import type { Party } from "@/generated/prisma/client";

function resolveTab(value: string | undefined): PartyDetailTab {
  if (value === "payment-methods" || value === "invoices") return value;
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
          subtitle="Edit party details and address."
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
            street1: party.street1 ?? "",
            street2: party.street2 ?? "",
            city: party.city ?? "",
            state: party.state ?? "",
            postalCode: party.postalCode ?? "",
            country: party.country ?? "",
          }}
        />
      </>
    );
  }

  const [isDeletable, paymentMethodsCount, invoicesCount] = await Promise.all([
    partyService.isDeletable(id),
    paymentMethodService.countForParty(id),
    invoiceService.countByParty(id),
  ]);

  return (
    <>
      <PageHeader
        title={party.name}
        subtitle="View party details and address."
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
        paymentMethodsCount={paymentMethodsCount}
        invoicesCount={invoicesCount}
        returnTo={returnTo}
      />

      {tab === "overview" ? (
        <PartyDetailCard
          party={party}
          editHref={withReturnTo(
            `/parties/${party.id}?tab=overview&edit=1`,
            returnTo,
          )}
        />
      ) : tab === "payment-methods" ? (
        <PaymentMethodsTab party={party} returnTo={returnTo} />
      ) : (
        <InvoicesTab party={party} returnTo={returnTo} />
      )}
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
          invoices={invoices.map(toInvoiceTableRow)}
          returnTo={withReturnTo(`/parties/${party.id}?tab=invoices`, returnTo)}
        />
      )}
    </>
  );
}
