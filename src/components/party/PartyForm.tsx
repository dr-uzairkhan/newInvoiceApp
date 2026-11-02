"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { partySchema, type PartyInput } from "@/lib/validation/party";
import { hasAnyAddressField } from "@/lib/validation/partyAddress";
import { createPartyAction, updatePartyAction } from "@/actions/party.actions";
import { AddressFieldsInputs } from "@/components/party-address/AddressFieldsInputs";
import { toLocalPartyAddress } from "@/components/party-address/PartyAddressForm";
import { FormField } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Party, PartyAddress } from "@/generated/prisma/client";

const partyTypeLabels: Record<PartyInput["type"], string> = {
  INDIVIDUAL: "Individual",
  ORGANIZATION: "Organization",
};

/** Mirrors partyService's label fallback for the create form's first address. */
const DEFAULT_ADDRESS_LABEL = "Primary";

/**
 * M17.3 — builds a Party-shaped object from
 * validated input + a freshly-issued id, mirroring partyService's
 * null-normalization, so an embedded `onCreated` caller can use it without a
 * round-trip refetch.
 */
function toLocalParty(id: string, input: PartyInput): Party {
  return {
    id,
    name: input.name,
    email: input.email && input.email.length > 0 ? input.email : null,
    type: input.type,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function PartyForm({
  mode,
  partyId,
  defaultValues,
  onCreated,
  embedded = false,
}: {
  mode: "create" | "edit";
  partyId?: string;
  defaultValues?: Partial<PartyInput>;
  /**
   * M17.3 — when provided, called with the created
   * Party (and its first address, if one was entered) instead of navigating
   * to its detail page. Lets this form be embedded in a modal (e.g.
   * Project's inline "create new party" escape hatch) without leaving the
   * page underneath it.
   */
  onCreated?: (party: Party, defaultAddress: PartyAddress | null) => void;
  /**
   * Renders bare form fields with no Card wrapper and no side-by-side grid
   * — for use inside another page's modal.
   */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PartyInput>({
    resolver: zodResolver(partySchema),
    defaultValues: {
      name: "",
      email: "",
      type: "ORGANIZATION",
      addressLabel: "",
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
      if (mode === "edit") {
        const result = await updatePartyAction(partyId!, values);
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Party updated");
        router.push(`/parties/${result.data.id}`);
        router.refresh();
        return;
      }

      const result = await createPartyAction(values);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Party created");

      if (onCreated) {
        const defaultAddress =
          result.data.defaultAddressId && hasAnyAddressField(values)
            ? toLocalPartyAddress(
                result.data.defaultAddressId,
                result.data.id,
                {
                  label: values.addressLabel || DEFAULT_ADDRESS_LABEL,
                  isDefault: true,
                  ...values,
                },
              )
            : null;
        onCreated(toLocalParty(result.data.id, values), defaultAddress);
        return;
      }

      router.push(`/parties/${result.data.id}`);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  });

  const formFields = (
    <form onSubmit={onSubmit} noValidate>
      <FormField
        label="Name"
        htmlFor="name"
        required
        error={errors.name?.message}
      >
        <Input id="name" {...register("name")} />
      </FormField>

      <FormField label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" {...register("email")} />
      </FormField>

      <FormField
        label="Type"
        htmlFor="type"
        required
        error={errors.type?.message}
      >
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="type" className="w-full">
                <SelectValue
                  placeholder="Select a type"
                  renderValue={(value) =>
                    partyTypeLabels[value as PartyInput["type"]]
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                <SelectItem value="ORGANIZATION">Organization</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </FormField>

      {mode === "create" ? (
        // The optional first address, saved as the party's default. Further
        // addresses (and edits to this one) live on the Addresses tab.
        <div className="mt-6 mb-2 border-t border-border pt-4">
          <h3 className="text-[13px] font-bold text-foreground">Address</h3>
          <p className="mt-0.5 mb-3 text-[11px] text-muted-foreground">
            Optional. Becomes this party&rsquo;s default address; more can be
            added later from the party&rsquo;s Addresses tab.
          </p>
          <FormField
            label="Address Label"
            htmlFor="addressLabel"
            error={errors.addressLabel?.message}
          >
            <Input
              id="addressLabel"
              placeholder={`Defaults to "${DEFAULT_ADDRESS_LABEL}"`}
              {...register("addressLabel")}
            />
          </FormField>
          <AddressFieldsInputs register={register} errors={errors} />
        </div>
      ) : (
        <p className="mb-4 text-[11px] text-muted-foreground">
          Addresses are managed on this party&rsquo;s Addresses tab.
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting
          ? "Saving…"
          : mode === "create"
            ? "Create Party"
            : "Save Changes"}
      </Button>
    </form>
  );

  if (embedded) {
    return formFields;
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardContent className="pt-6">{formFields}</CardContent>
      </Card>
    </div>
  );
}
