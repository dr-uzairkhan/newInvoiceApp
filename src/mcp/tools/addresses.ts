import { z } from "zod";
import { defineTool, requireConfirm } from "@/mcp/core";
import {
  confirmSchema,
  idSchema,
  notFound,
  revalidateAfterWrite,
} from "@/mcp/tools/shared";
import { ROLES } from "@/lib/permissions";
import {
  partyAddressBaseSchema,
  partyAddressSchema,
  type PartyAddressInput,
} from "@/lib/validation/partyAddress";
import { partyAddressService } from "@/services/partyAddressService";
import { partyService } from "@/services/partyService";
import type { PartyAddress } from "@/generated/prisma/client";

/** The form-shaped input an existing address corresponds to — the base an `update_address` merge starts from. */
function addressToInput(address: PartyAddress): PartyAddressInput {
  return {
    label: address.label,
    isDefault: address.isDefault,
    street1: address.street1 ?? "",
    street2: address.street2 ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    postalCode: address.postalCode ?? "",
    country: address.country ?? "",
  };
}

async function loadAddress(id: string): Promise<PartyAddress> {
  const address = await partyAddressService.getById(id);
  return address ?? notFound(`Address ${id}`);
}

const addressFields = partyAddressBaseSchema.shape;

export const listAddresses = defineTool({
  name: "list_addresses",
  title: "List addresses",
  description:
    "Lists a party's addresses. At most one is the default; a project that doesn't pick a specific address shows the party's default on its invoices.",
  inputSchema: { partyId: idSchema },
  scope: "READ",
  annotations: { readOnlyHint: true },
  target: ({ partyId }) => ({ type: "party", id: partyId }),
  handler: async ({ partyId }) => {
    if (!(await partyService.getById(partyId))) notFound(`Party ${partyId}`);
    return { addresses: await partyAddressService.listForParty(partyId) };
  },
});

export const createAddress = defineTool({
  name: "create_address",
  title: "Create address",
  description:
    "Adds an address to a party. label names it for the project form's picker (e.g. \"Head office\"); at least one of the address fields must be filled. A party's first address is always its default; setting isDefault true on a later one clears the previous default.",
  inputSchema: {
    partyId: idSchema,
    ...addressFields,
    isDefault: z.boolean().default(false),
  },
  scope: "WRITE",
  roles: ROLES.writeParties,
  target: ({ partyId }) => ({ type: "party", id: partyId }),
  handler: async ({ partyId, ...rest }) => {
    if (!(await partyService.getById(partyId))) notFound(`Party ${partyId}`);
    const address = await partyAddressService.create(
      partyId,
      partyAddressSchema.parse(rest),
    );
    revalidateAfterWrite();
    return { address };
  },
});

export const updateAddress = defineTool({
  name: "update_address",
  title: "Update address",
  description:
    "Updates an address. Only the fields you pass change. Unsent drafts pick the change up on their next save; already-sent invoices keep their snapshotted address.",
  inputSchema: {
    addressId: idSchema,
    ...Object.fromEntries(
      Object.entries(addressFields).map(([key, schema]) => [
        key,
        schema.optional(),
      ]),
    ),
  } as { addressId: typeof idSchema } & {
    [K in keyof typeof addressFields]: z.ZodOptional<(typeof addressFields)[K]>;
  },
  scope: "WRITE",
  roles: ROLES.writeParties,
  target: ({ addressId }) => ({ type: "address", id: addressId }),
  handler: async ({ addressId, ...patch }) => {
    const existing = await loadAddress(addressId);
    const merged = { ...addressToInput(existing) };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
    }
    const address = await partyAddressService.update(
      addressId,
      existing.partyId,
      partyAddressSchema.parse(merged),
    );
    revalidateAfterWrite();
    return { address };
  },
});

export const setDefaultAddress = defineTool({
  name: "set_default_address",
  title: "Set default address",
  description:
    "Makes this address the party's default (clearing the previous default).",
  inputSchema: { addressId: idSchema },
  scope: "WRITE",
  roles: ROLES.writeParties,
  annotations: { idempotentHint: true },
  target: ({ addressId }) => ({ type: "address", id: addressId }),
  handler: async ({ addressId }) => {
    const existing = await loadAddress(addressId);
    const address = await partyAddressService.update(
      addressId,
      existing.partyId,
      {
        ...addressToInput(existing),
        isDefault: true,
      },
    );
    revalidateAfterWrite();
    return { address };
  },
});

export const deleteAddress = defineTool({
  name: "delete_address",
  title: "Delete address",
  description:
    "Permanently deletes an address. Refused while any project has it selected as its contractor or client address. Irreversible — requires confirm: true.",
  inputSchema: { addressId: idSchema, confirm: confirmSchema },
  scope: "WRITE_DESTRUCTIVE",
  roles: ROLES.writeParties,
  annotations: { destructiveHint: true },
  target: ({ addressId }) => ({ type: "address", id: addressId }),
  handler: async ({ addressId, confirm }) => {
    requireConfirm(confirm, "Deleting an address");
    await loadAddress(addressId);
    await partyAddressService.delete(addressId);
    revalidateAfterWrite();
    return { deleted: true, addressId };
  },
});

export const ADDRESS_TOOLS = [
  listAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
];
