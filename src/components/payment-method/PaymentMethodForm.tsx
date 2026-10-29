"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import {
  paymentMethodSchema,
  type PaymentMethodInput,
} from "@/lib/validation/paymentMethod";
import {
  createPaymentMethodAction,
  updatePaymentMethodAction,
} from "@/actions/paymentMethod.actions";
import { paymentMethodTemplates } from "@/components/payment-method/paymentMethodTemplates";
import { resolveBackTarget } from "@/lib/backNavigation";
import { cn } from "@/lib/utils";
import { FormField } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PaymentMethod } from "@/generated/prisma/client";

const typeLabels: Record<PaymentMethodInput["type"], string> = {
  BANK_WIRE: "Bank Wire",
  ZELLE: "Zelle",
  PAYONEER: "Payoneer",
  CUSTOM: "Custom",
};

/**
 * M17.4 — builds a PaymentMethod-shaped object from
 * validated input + a freshly-issued id, so an embedded `onCreated` caller
 * can use it without a round-trip refetch (mirrors PartyForm's
 * `toLocalParty`). Note: `input.fields` is plaintext here — the service
 * layer encrypts `.value` before writing (M17.5) but this local object is
 * only ever used for same-session UI state, never persisted.
 */
function toLocalPaymentMethod(
  id: string,
  partyId: string,
  input: PaymentMethodInput,
): PaymentMethod {
  return {
    id,
    partyId,
    type: input.type,
    label: input.label,
    isDefault: input.isDefault,
    fields: input.fields as unknown as PaymentMethod["fields"],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function PaymentMethodForm({
  mode,
  partyId,
  paymentMethodId,
  defaultValues,
  onCreated,
  embedded = false,
  returnTo,
}: {
  mode: "create" | "edit";
  partyId: string;
  paymentMethodId?: string;
  defaultValues?: Partial<PaymentMethodInput>;
  /**
   * M17.4 — when provided, called with the created
   * PaymentMethod instead of navigating to the party's detail page. Lets
   * this form be embedded in a modal (e.g. Project's inline "create payment
   * method" escape hatch) without leaving the page underneath it.
   */
  onCreated?: (paymentMethod: PaymentMethod) => void;
  /**
   * Renders bare form fields with no Card wrapper and no side-by-side grid
   * — for use inside another page's modal.
   */
  embedded?: boolean;
  /** Where to land after saving — defaults to this party's Payment Methods tab when unset (never used in `embedded` mode, which never navigates at all). */
  returnTo?: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<PaymentMethodInput>({
    resolver: zodResolver(paymentMethodSchema),
    defaultValues: {
      type: "BANK_WIRE",
      label: "",
      isDefault: false,
      fields: paymentMethodTemplates.BANK_WIRE.map((f) => ({ ...f })),
      ...defaultValues,
    },
  });

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "fields",
  });

  // Tracks the last-selected type so a template swap only fires when the
  // field list still exactly matches that type's untouched template — any
  // admin edit (including one that leaves labels/keys but not values blank)
  // permanently opts the row set out of further auto-swaps.
  const previousTypeRef = useRef<PaymentMethodInput["type"]>(
    defaultValues?.type ?? "BANK_WIRE",
  );

  const onSubmit = handleSubmit(async (values) => {
    setIsSubmitting(true);
    try {
      const result =
        mode === "create"
          ? await createPaymentMethodAction(partyId, values)
          : await updatePaymentMethodAction(paymentMethodId!, partyId, values);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        mode === "create" ? "Payment method created" : "Payment method updated",
      );

      if (onCreated) {
        onCreated(toLocalPaymentMethod(result.data.id, partyId, values));
        return;
      }

      router.push(
        resolveBackTarget(returnTo, {
          href: `/parties/${partyId}?tab=payment-methods`,
          label: "",
        }).href,
      );
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  });

  const formFields = (
    <form onSubmit={onSubmit} noValidate>
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
            <Select
              value={field.value}
              onValueChange={(value) => {
                if (!value) return;
                // Load the new type's starting scaffold only when the
                // current fields still exactly match the previous
                // type's untouched template — never clobber an admin's
                // in-progress edits (Docs/product_spec.md §4 Workflow 2).
                const currentFields = getValues("fields");
                const matchesPreviousTemplate =
                  JSON.stringify(currentFields) ===
                  JSON.stringify(
                    paymentMethodTemplates[previousTypeRef.current],
                  );
                field.onChange(value);
                if (matchesPreviousTemplate) {
                  setValue(
                    "fields",
                    paymentMethodTemplates[value].map((f) => ({ ...f })),
                  );
                }
                previousTypeRef.current = value as PaymentMethodInput["type"];
              }}
            >
              <SelectTrigger id="type" className="w-full">
                <SelectValue
                  placeholder="Select a type"
                  renderValue={(value) =>
                    typeLabels[value as PaymentMethodInput["type"]]
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(typeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>

      <FormField
        label="Payment Method Name"
        htmlFor="label"
        required
        error={errors.label?.message}
      >
        <Input
          id="label"
          placeholder="e.g. Chase Checking Account"
          {...register("label")}
        />
      </FormField>

      <div
        className={cn(
          "mb-4 flex flex-col gap-1 rounded-md transition-colors duration-1000",
        )}
      >
        <div className="flex items-center gap-2">
          <Controller
            name="isDefault"
            control={control}
            render={({ field }) => (
              <Checkbox
                id="isDefault"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked)}
              />
            )}
          />
          <label
            htmlFor="isDefault"
            className="text-[13px] font-medium text-foreground"
          >
            Set as default payment method for this party
          </label>
        </div>
        <p className="pl-6 text-[11px] text-muted-foreground">
          This is what a Project&rsquo;s Preferred Payment Method picker selects
          by default for this party.
        </p>
      </div>

      <div
        className={cn(
          "mb-2 flex items-center justify-between rounded-md transition-colors duration-1000",
        )}
      >
        <span className="text-[11px] font-bold tracking-[0.05em] text-muted-foreground uppercase">
          Fields <span className="text-destructive">*</span>
        </span>
        <Button
          type="button"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={() => append({ key: "", label: "", value: "" })}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Field
        </Button>
      </div>

      {errors.fields?.message ? (
        <p className="mb-2 text-[11px] text-destructive">
          {errors.fields.message}
        </p>
      ) : null}

      <div className="mb-4 flex flex-col gap-3">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="rounded-[10px] border border-border p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground">
                Field {index + 1}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                  aria-label="Move field up"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  disabled={index === fields.length - 1}
                  onClick={() => move(index, index + 1)}
                  aria-label="Move field down"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-destructive"
                  onClick={() => remove(index)}
                  aria-label="Remove field"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField
                label="Key"
                htmlFor={`fields.${index}.key`}
                error={errors.fields?.[index]?.key?.message}
                className="mb-0"
              >
                <Input
                  id={`fields.${index}.key`}
                  placeholder="bank_name"
                  {...register(`fields.${index}.key` as const)}
                />
              </FormField>
              <FormField
                label="Label"
                htmlFor={`fields.${index}.label`}
                error={errors.fields?.[index]?.label?.message}
                className="mb-0"
              >
                <Input
                  id={`fields.${index}.label`}
                  placeholder="Bank Name"
                  {...register(`fields.${index}.label` as const)}
                />
              </FormField>
              <FormField
                label="Value"
                htmlFor={`fields.${index}.value`}
                error={errors.fields?.[index]?.value?.message}
                className="mb-0"
              >
                <Input
                  id={`fields.${index}.value`}
                  placeholder="Deutsche Bank"
                  {...register(`fields.${index}.value` as const)}
                />
              </FormField>
            </div>
          </div>
        ))}
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting
          ? "Saving…"
          : mode === "create"
            ? "Add Payment Method"
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
