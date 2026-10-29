import { PageHeader } from "@/components/layout/PageHeader";
import { ProjectForm } from "@/components/project/ProjectForm";
import { partyService } from "@/services/partyService";
import { paymentMethodService } from "@/services/paymentMethodService";
import type { PaymentMethod } from "@/generated/prisma/client";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ ledger?: string }>;
}) {
  const { ledger } = await searchParams;
  // §33 — the /internal section links here with ?ledger=INTERNAL so the
  // form opens preset; the field itself stays visible and editable.
  const presetLedger = ledger === "INTERNAL" ? "INTERNAL" : "CLIENT";
  const parties = await partyService.list();
  const paymentMethodEntries = await Promise.all(
    parties.map(
      async (party) =>
        [party.id, await paymentMethodService.listForParty(party.id)] as const,
    ),
  );
  const paymentMethodsByPartyId: Record<string, PaymentMethod[]> =
    Object.fromEntries(paymentMethodEntries);

  return (
    <>
      <PageHeader
        title={presetLedger === "INTERNAL" ? "Create Internal Project" : "Create Project"}
        subtitle={
          presetLedger === "INTERNAL"
            ? "An internal project issues on-demand invoices and stays off the main dashboard, lists and counts."
            : "Link a contractor and a client so invoices can be generated under this project."
        }
        backHref={presetLedger === "INTERNAL" ? "/internal" : undefined}
        backLabel="Back to Internal"
      />
      <ProjectForm
        mode="create"
        defaultValues={{ ledger: presetLedger }}
        initialParties={parties}
        initialPaymentMethodsByPartyId={paymentMethodsByPartyId}
      />
    </>
  );
}
