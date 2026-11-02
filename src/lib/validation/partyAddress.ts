import { z } from "zod";

/**
 * The six postal fields shared by a PartyAddress and, on the party create
 * form, the optional first address (Docs/implementation_decisions.md §16).
 * All optional at this layer — an address is allowed to be as sparse as a
 * bare country — but see `partyAddressSchema` for the "not entirely blank"
 * rule that applies once an address is a row of its own.
 */
export const addressFieldsSchema = z.object({
  street1: z.string().trim().optional().or(z.literal("")),
  street2: z.string().trim().optional().or(z.literal("")),
  city: z.string().trim().optional().or(z.literal("")),
  state: z.string().trim().optional().or(z.literal("")),
  postalCode: z.string().trim().optional().or(z.literal("")),
  country: z.string().trim().optional().or(z.literal("")),
});

export type AddressFieldsInput = z.infer<typeof addressFieldsSchema>;

export const ADDRESS_FIELD_KEYS = [
  "street1",
  "street2",
  "city",
  "state",
  "postalCode",
  "country",
] as const satisfies readonly (keyof AddressFieldsInput)[];

/** True when at least one of the six postal fields carries text. */
export function hasAnyAddressField(input: AddressFieldsInput): boolean {
  return ADDRESS_FIELD_KEYS.some((key) => (input[key] ?? "").length > 0);
}

/**
 * Partial-able base — `.partial()` this one (the MCP `update_address` tool
 * does), never the refined schema below.
 */
export const partyAddressBaseSchema = addressFieldsSchema.extend({
  label: z.string().trim().min(1, "Label is required"),
  isDefault: z.boolean(),
});

/** A stored address must say *something* — a label alone isn't an address. */
export const partyAddressSchema = partyAddressBaseSchema.superRefine(
  (value, ctx) => {
    if (!hasAnyAddressField(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["street1"],
        message: "Fill in at least one address field",
      });
    }
  },
);

export type PartyAddressInput = z.infer<typeof partyAddressBaseSchema>;
