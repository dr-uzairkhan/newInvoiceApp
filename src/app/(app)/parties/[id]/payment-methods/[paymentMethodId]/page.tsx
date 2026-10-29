import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { PaymentMethodForm } from "@/components/payment-method/PaymentMethodForm";
import { partyService } from "@/services/partyService";
import { paymentMethodService } from "@/services/paymentMethodService";
import type { PaymentMethodField } from "@/repositories/paymentMethodRepository";

export default async function EditPaymentMethodPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; paymentMethodId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id, paymentMethodId } = await params;
  const { returnTo } = await searchParams;
  const [party, paymentMethod] = await Promise.all([
    partyService.getById(id),
    paymentMethodService.getById(paymentMethodId),
  ]);
  if (!party || !paymentMethod || paymentMethod.partyId !== party.id) {
    notFound();
  }

  const fields = paymentMethod.fields as unknown as PaymentMethodField[];

  return (
    <>
      <PageHeader title="Edit Payment Method" subtitle={`For ${party.name}.`} />
      <PaymentMethodForm
        mode="edit"
        partyId={party.id}
        paymentMethodId={paymentMethod.id}
        returnTo={returnTo}
        defaultValues={{
          type: paymentMethod.type,
          label: paymentMethod.label,
          isDefault: paymentMethod.isDefault,
          fields,
        }}
      />
    </>
  );
}
