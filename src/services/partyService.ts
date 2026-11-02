import { partyRepository } from "@/repositories/partyRepository";
import type { PartyWriteInput } from "@/repositories/partyRepository";
import type { PartyCoreInput, PartyInput } from "@/lib/validation/party";
import { hasAnyAddressField } from "@/lib/validation/partyAddress";
import { toAddressWriteFields } from "@/services/partyAddressService";
import type { Party } from "@/generated/prisma/client";

/**
 * Thrown when a delete is blocked by a live foreign-key reference
 * (Docs/implementation_decisions.md §18). Callers (server actions) catch this
 * specifically to surface a friendly message instead of a raw DB error.
 */
export class PartyDeletionBlockedError extends Error {
  constructor() {
    super(
      "This party is still assigned to a project as its contractor or client. Remove it from the project (or delete the project) before deleting the party.",
    );
    this.name = "PartyDeletionBlockedError";
  }
}

/** Label given to the address entered on the party create form when the admin leaves its label blank. */
export const DEFAULT_ADDRESS_LABEL = "Primary";

/** Empty-string optional fields become `null`, never left `undefined` — see partyRepository. */
function toWriteInput(input: PartyCoreInput): PartyWriteInput {
  return {
    name: input.name,
    email: input.email && input.email.length > 0 ? input.email : null,
    type: input.type,
  };
}

function list(): Promise<Party[]> {
  return partyRepository.findMany();
}

function getById(id: string): Promise<Party | null> {
  return partyRepository.findById(id);
}

/**
 * The create form's optional first address becomes the party's default
 * `PartyAddress` when any of its fields is filled in (Docs/
 * implementation_decisions.md §16); an all-blank block creates nothing.
 */
function create(input: PartyInput): Promise<Party> {
  const initialAddress = hasAnyAddressField(input)
    ? {
        label: input.addressLabel || DEFAULT_ADDRESS_LABEL,
        isDefault: true,
        ...toAddressWriteFields(input),
      }
    : null;
  return partyRepository.create(toWriteInput(input), initialAddress);
}

/** Only the party's own fields — addresses are edited through partyAddressService. */
function update(id: string, input: PartyCoreInput): Promise<Party> {
  return partyRepository.update(id, toWriteInput(input));
}

/** Story 1.3 — blocked while referenced as any Project's contractor or client. */
async function isDeletable(id: string): Promise<boolean> {
  const referenced = await partyRepository.isReferencedByAnyProject(id);
  return !referenced;
}

async function deleteParty(id: string): Promise<void> {
  if (!(await isDeletable(id))) {
    throw new PartyDeletionBlockedError();
  }
  await partyRepository.delete(id);
}

export const partyService = {
  list,
  getById,
  create,
  update,
  isDeletable,
  delete: deleteParty,
};
