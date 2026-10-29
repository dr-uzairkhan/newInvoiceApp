import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { PaymentMethodForm } from "@/components/payment-method/PaymentMethodForm";
import { partyService } from "@/services/partyService";

export default async function NewPaymentMethodPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const party = await partyService.getById(id);
  if (!party) {
    notFound();
  }

  return (
    <>
      <PageHeader title="Add Payment Method" subtitle={`For ${party.name}.`} />
      <PaymentMethodForm
        mode="create"
        partyId={party.id}
        returnTo={returnTo}
      />
    </>
  );
}
