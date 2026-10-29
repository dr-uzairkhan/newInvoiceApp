"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { partySchema, type PartyInput } from "@/lib/validation/party";
import { createPartyAction, updatePartyAction } from "@/actions/party.actions";
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
import type { Party } from "@/generated/prisma/client";

const partyTypeLabels: Record<PartyInput["type"], string> = {
  INDIVIDUAL: "Individual",
  ORGANIZATION: "Organization",
};

/**
 * M17.3 — builds a Party-shaped object from
 * validated input + a freshly-issued id, mirroring partyService's
 * null-normalization, so an embedded `onCreated` caller can use it without a
 * round-trip refetch.
 */
function toLocalParty(id: string, input: PartyInput): Party {
  const nullIfEmpty = (value: string | undefined) =>
    value && value.length > 0 ? value : null;

  return {
    id,
    name: input.name,
    email: nullIfEmpty(input.email),
    type: input.type,
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
   * Party instead of navigating to its detail page. Lets this form be
   * embedded in a modal (e.g. Project's inline "create new party" escape
   * hatch) without leaving the page underneath it.
   */
  onCreated?: (party: Party) => void;
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
          ? await createPartyAction(values)
          : await updatePartyAction(partyId!, values);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(mode === "create" ? "Party created" : "Party updated");

      if (onCreated) {
        onCreated(toLocalParty(result.data.id, values));
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

      <FormField
        label="Email"
        htmlFor="email"
        error={errors.email?.message}
      >
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

      <FormField
        label="Street 1"
        htmlFor="street1"
        error={errors.street1?.message}
      >
        <Input id="street1" {...register("street1")} />
      </FormField>

      <FormField
        label="Street 2"
        htmlFor="street2"
        error={errors.street2?.message}
      >
        <Input id="street2" {...register("street2")} />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="City"
          htmlFor="city"
          error={errors.city?.message}
        >
          <Input id="city" {...register("city")} />
        </FormField>
        <FormField
          label="State"
          htmlFor="state"
          error={errors.state?.message}
        >
          <Input id="state" {...register("state")} />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Postal Code"
          htmlFor="postalCode"
          error={errors.postalCode?.message}
        >
          <Input id="postalCode" {...register("postalCode")} />
        </FormField>
        <FormField
          label="Country"
          htmlFor="country"
          error={errors.country?.message}
        >
          <Input id="country" {...register("country")} />
        </FormField>
      </div>

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
