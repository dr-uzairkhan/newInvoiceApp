"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { FormField } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import type { AddressFieldsInput } from "@/lib/validation/partyAddress";

/**
 * The six postal inputs, shared by the standalone address form (party
 * Addresses tab / project form dialog) and the party create form's optional
 * first address, so the two never drift in layout or labels.
 */
export function AddressFieldsInputs<T extends AddressFieldsInput>({
  register,
  errors,
  idPrefix = "",
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<AddressFieldsInput>;
  /** Keeps `id`/`htmlFor` unique when two copies render on one page. */
  idPrefix?: string;
}) {
  // react-hook-form's `register` is generic over the whole form type; the
  // six field names are the same on every form that embeds this component.
  const reg = register as unknown as UseFormRegister<AddressFieldsInput>;
  return (
    <>
      <FormField
        label="Street 1"
        htmlFor={`${idPrefix}street1`}
        error={errors.street1?.message}
      >
        <Input id={`${idPrefix}street1`} {...reg("street1")} />
      </FormField>

      <FormField
        label="Street 2"
        htmlFor={`${idPrefix}street2`}
        error={errors.street2?.message}
      >
        <Input id={`${idPrefix}street2`} {...reg("street2")} />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="City"
          htmlFor={`${idPrefix}city`}
          error={errors.city?.message}
        >
          <Input id={`${idPrefix}city`} {...reg("city")} />
        </FormField>
        <FormField
          label="State"
          htmlFor={`${idPrefix}state`}
          error={errors.state?.message}
        >
          <Input id={`${idPrefix}state`} {...reg("state")} />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Postal Code"
          htmlFor={`${idPrefix}postalCode`}
          error={errors.postalCode?.message}
        >
          <Input id={`${idPrefix}postalCode`} {...reg("postalCode")} />
        </FormField>
        <FormField
          label="Country"
          htmlFor={`${idPrefix}country`}
          error={errors.country?.message}
        >
          <Input id={`${idPrefix}country`} {...reg("country")} />
        </FormField>
      </div>
    </>
  );
}
