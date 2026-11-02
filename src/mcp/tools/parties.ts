import { z } from "zod";
import { defineTool, requireConfirm } from "@/mcp/core";
import {
  confirmSchema,
  idSchema,
  maskPaymentMethod,
  notFound,
  revalidateAfterWrite,
} from "@/mcp/tools/shared";
import { ROLES } from "@/lib/permissions";
import {
  partyCoreSchema,
  partySchema,
  type PartyCoreInput,
} from "@/lib/validation/party";
import { partyService } from "@/services/partyService";
import { partyAddressService } from "@/services/partyAddressService";
import { paymentMethodService } from "@/services/paymentMethodService";
import type { Party } from "@/generated/prisma/client";

/** The form-shaped input an existing party corresponds to — the base an `update_party` merge starts from. */
export function partyToInput(party: Party): PartyCoreInput {
  return {
    name: party.name,
    email: party.email ?? "",
    type: party.type,
  };
}

async function loadParty(partyId: string): Promise<Party> {
  const party = await partyService.getById(partyId);
  return party ?? notFound(`Party ${partyId}`);
}

/** Create accepts the optional first address too; update only the party's own fields (addresses have their own tools). */
const partyCreateFields = partySchema.shape;
const partyCoreFields = partyCoreSchema.shape;

export const listParties = defineTool({
  name: "list_parties",
  title: "List parties",
  description:
    "Lists every party (people and organisations). Any party can act as a contractor, a client, or both on a project.",
  inputSchema: {},
  scope: "READ",
  annotations: { readOnlyHint: true },
  handler: async () => ({ parties: await partyService.list() }),
});

export const getParty = defineTool({
  name: "get_party",
  title: "Get party",
  description:
    "One party with its addresses and payment methods. Payment-method field values are masked (last characters only); full bank details are only visible in the app.",
  inputSchema: { partyId: idSchema },
  scope: "READ",
  annotations: { readOnlyHint: true },
  target: ({ partyId }) => ({ type: "party", id: partyId }),
  handler: async ({ partyId }) => {
    const party = await loadParty(partyId);
    const [addresses, paymentMethods] = await Promise.all([
      partyAddressService.listForParty(partyId),
      paymentMethodService.listForParty(partyId),
    ]);
    return {
      party,
      addresses,
      paymentMethods: paymentMethods.map(maskPaymentMethod),
    };
  },
});

export const createParty = defineTool({
  name: "create_party",
  title: "Create party",
  description:
    'Creates a party (a client, a contractor, or both). type is INDIVIDUAL or ORGANIZATION. Email and the address fields are optional — pass empty strings to leave them blank. Any filled address field creates the party\'s first (default) address, labelled addressLabel or "Primary"; add more with create_address.',
  inputSchema: partyCreateFields,
  scope: "WRITE",
  roles: ROLES.writeParties,
  handler: async (args) => {
    const party = await partyService.create(partySchema.parse(args));
    const addresses = await partyAddressService.listForParty(party.id);
    revalidateAfterWrite();
    return { party, addresses };
  },
});

export const updateParty = defineTool({
  name: "update_party",
  title: "Update party",
  description:
    "Updates a party's name, email or type. Only the fields you pass change; addresses are edited with the address tools. Already-sent invoices keep their snapshotted party details and are not affected.",
  inputSchema: {
    partyId: idSchema,
    ...Object.fromEntries(
      Object.entries(partyCoreFields).map(([key, schema]) => [
        key,
        schema.optional(),
      ]),
    ),
  } as { partyId: typeof idSchema } & {
    [K in keyof typeof partyCoreFields]: z.ZodOptional<
      (typeof partyCoreFields)[K]
    >;
  },
  scope: "WRITE",
  roles: ROLES.writeParties,
  target: ({ partyId }) => ({ type: "party", id: partyId }),
  handler: async ({ partyId, ...patch }) => {
    const existing = await loadParty(partyId);
    const merged = { ...partyToInput(existing) };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
    }
    const party = await partyService.update(
      partyId,
      partyCoreSchema.parse(merged),
    );
    revalidateAfterWrite();
    return { party };
  },
});

export const deleteParty = defineTool({
  name: "delete_party",
  title: "Delete party",
  description:
    "Permanently deletes a party with its addresses and payment methods. Refused while any project references the party. Irreversible — requires confirm: true.",
  inputSchema: { partyId: idSchema, confirm: confirmSchema },
  scope: "WRITE_DESTRUCTIVE",
  roles: ROLES.writeParties,
  annotations: { destructiveHint: true },
  target: ({ partyId }) => ({ type: "party", id: partyId }),
  handler: async ({ partyId, confirm }) => {
    requireConfirm(confirm, "Deleting a party");
    await loadParty(partyId);
    await partyService.delete(partyId);
    revalidateAfterWrite();
    return { deleted: true, partyId };
  },
});

export const PARTY_TOOLS = [
  listParties,
  getParty,
  createParty,
  updateParty,
  deleteParty,
];
