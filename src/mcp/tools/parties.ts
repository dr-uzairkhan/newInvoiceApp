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
import { partySchema, type PartyInput } from "@/lib/validation/party";
import { partyService } from "@/services/partyService";
import { paymentMethodService } from "@/services/paymentMethodService";
import type { Party } from "@/generated/prisma/client";

/** The form-shaped input an existing party corresponds to — the base an `update_party` merge starts from. */
export function partyToInput(party: Party): PartyInput {
  return {
    name: party.name,
    email: party.email ?? "",
    type: party.type,
    street1: party.street1 ?? "",
    street2: party.street2 ?? "",
    city: party.city ?? "",
    state: party.state ?? "",
    postalCode: party.postalCode ?? "",
    country: party.country ?? "",
  };
}

async function loadParty(partyId: string): Promise<Party> {
  const party = await partyService.getById(partyId);
  return party ?? notFound(`Party ${partyId}`);
}

const partyFields = partySchema.shape;

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
    "One party with its payment methods. Payment-method field values are masked (last characters only); full bank details are only visible in the app.",
  inputSchema: { partyId: idSchema },
  scope: "READ",
  annotations: { readOnlyHint: true },
  target: ({ partyId }) => ({ type: "party", id: partyId }),
  handler: async ({ partyId }) => {
    const party = await loadParty(partyId);
    const paymentMethods = await paymentMethodService.listForParty(partyId);
    return { party, paymentMethods: paymentMethods.map(maskPaymentMethod) };
  },
});

export const createParty = defineTool({
  name: "create_party",
  title: "Create party",
  description:
    "Creates a party (a client, a contractor, or both). type is INDIVIDUAL or ORGANIZATION. Address fields and email are optional — pass empty strings to leave them blank.",
  inputSchema: partyFields,
  scope: "WRITE",
  roles: ROLES.writeParties,
  handler: async (args) => {
    const party = await partyService.create(partySchema.parse(args));
    revalidateAfterWrite();
    return { party };
  },
});

export const updateParty = defineTool({
  name: "update_party",
  title: "Update party",
  description:
    "Updates a party. Only the fields you pass change. Already-sent invoices keep their snapshotted party details and are not affected.",
  inputSchema: {
    partyId: idSchema,
    ...Object.fromEntries(
      Object.entries(partyFields).map(([key, schema]) => [key, schema.optional()]),
    ),
  } as { partyId: typeof idSchema } & {
    [K in keyof typeof partyFields]: z.ZodOptional<(typeof partyFields)[K]>;
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
    const party = await partyService.update(partyId, partySchema.parse(merged));
    revalidateAfterWrite();
    return { party };
  },
});

export const deleteParty = defineTool({
  name: "delete_party",
  title: "Delete party",
  description:
    "Permanently deletes a party and its payment methods. Refused while any project references the party. Irreversible — requires confirm: true.",
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

export const PARTY_TOOLS = [listParties, getParty, createParty, updateParty, deleteParty];
