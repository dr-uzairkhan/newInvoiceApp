"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  partyAddressSchema,
  type PartyAddressInput,
} from "@/lib/validation/partyAddress";
import {
  createPartyAddressAction,
  updatePartyAddressAction,
} from "@/actions/partyAddress.actions";
import { AddressFieldsInputs } from "@/components/party-address/AddressFieldsInputs";
import { FormField } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { PartyAddress } from "@/generated/prisma/client";

/**
 * Builds a PartyAddress-shaped object from validated input + a freshly
 * issued id, mirroring partyAddressService's null-normalization, so a
 * dialog caller can use it without a round-trip refetch (same idea as
 * PaymentMethodForm's toLocalPaymentMethod).
 */
export function toLocalPartyAddress(
  id: string,
  partyId: string,
  input: PartyAddressInput,
): PartyAddress {
  const nullIfEmpty = (value: string | undefined) =>
    value && value.length > 0 ? value : null;
  return {
    id,
    partyId,
    label: input.label,
    isDefault: input.isDefault,
    street1: nullIfEmpty(input.street1),
    street2: nullIfEmpty(input.street2),
    city: nullIfEmpty(input.city),
    state: nullIfEmpty(input.state),
    postalCode: nullIfEmpty(input.postalCode),
    country: nullIfEmpty(input.country),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Create/edit one of a party's addresses (Docs/implementation_decisions.md
 * §16). Always rendered inside PartyAddressDialog, so it never navigates —
 * it reports the saved row through `onSaved` and the dialog decides what
 * to refresh.
 */
export function PartyAddressForm({
  mode,
  partyId,
  addressId,
  defaultValues,
  onSaved,
}: {
  mode: "create" | "edit";
  partyId: string;
  addressId?: string;
  defaultValues?: Partial<PartyAddressInput>;
  onSaved: (address: PartyAddress) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PartyAddressInput>({
    resolver: zodResolver(partyAddressSchema),
    defaultValues: {
      label: "",
      isDefault: false,
      street1: "",
      street2: "",
      city: "",
      state: "",
      postalCode: "",
      country: "",
      ...defaultValues,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setIsSubmitting(true);
    try {
      const result =
        mode === "create"
          ? await createPartyAddressAction(partyId, values)
          : await updatePartyAddressAction(addressId!, partyId, values);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(mode === "create" ? "Address added" : "Address updated");
      onSaved(toLocalPartyAddress(result.data.id, partyId, values));
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FormField
        label="Label"
        htmlFor="address-label"
        required
        error={errors.label?.message}
      >
        <Input
          id="address-label"
          placeholder="e.g. Head office, Downtown branch"
          {...register("label")}
        />
      </FormField>

      <AddressFieldsInputs register={register} errors={errors} />

      <div className="mb-4 flex items-center gap-2">
        <Controller
          name="isDefault"
          control={control}
          render={({ field }) => (
            <Checkbox
              id="address-isDefault"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked)}
            />
          )}
        />
        <label
          htmlFor="address-isDefault"
          className="text-[13px] font-medium text-foreground"
        >
          Default address for this party
        </label>
      </div>
      <p className="-mt-2 mb-4 text-[11px] text-muted-foreground">
        Projects that don&rsquo;t pick a specific address use the default. A
        party&rsquo;s first address is always its default.
      </p>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting
          ? "Saving…"
          : mode === "create"
            ? "Add Address"
            : "Save Changes"}
      </Button>
    </form>
  );
}
