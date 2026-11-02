import { partyAddressRepository } from "@/repositories/partyAddressRepository";
import type { PartyAddressWriteInput } from "@/repositories/partyAddressRepository";
import type { PartyAddressInput } from "@/lib/validation/partyAddress";
import type { PartyAddress } from "@/generated/prisma/client";

/**
 * Thrown when a delete is blocked by a live foreign-key reference
 * (Docs/implementation_decisions.md §18). Callers (server actions, MCP)
 * catch this specifically to surface a friendly message instead of a raw
 * DB error.
 */
export class PartyAddressDeletionBlockedError extends Error {
  constructor() {
    super(
      "This address is selected on a project. Change that project's address before deleting it.",
    );
    this.name = "PartyAddressDeletionBlockedError";
  }
}

/** Empty-string optional fields become `null`, never left `undefined` — see partyAddressRepository. */
export function toAddressWriteFields(
  input: Omit<PartyAddressInput, "label" | "isDefault">,
): Omit<PartyAddressWriteInput, "partyId" | "label" | "isDefault"> {
  const nullIfEmpty = (value: string | undefined) =>
    value && value.length > 0 ? value : null;
  return {
    street1: nullIfEmpty(input.street1),
    street2: nullIfEmpty(input.street2),
    city: nullIfEmpty(input.city),
    state: nullIfEmpty(input.state),
    postalCode: nullIfEmpty(input.postalCode),
    country: nullIfEmpty(input.country),
  };
}

function listForParty(partyId: string): Promise<PartyAddress[]> {
  return partyAddressRepository.findByParty(partyId);
}

/** Every party's addresses at once — the project form's pickers need all of them up front. */
function listAllGroupedByParty(): Promise<Record<string, PartyAddress[]>> {
  return partyAddressRepository.findAllGroupedByParty();
}

/** Party detail page's tab badge count. */
function countForParty(partyId: string): Promise<number> {
  return partyAddressRepository.countByParty(partyId);
}

function getById(id: string): Promise<PartyAddress | null> {
  return partyAddressRepository.findById(id);
}

/**
 * Docs/implementation_decisions.md §16 — at most one default per party,
 * enforced here (not just disabled in the UI) by un-setting any prior
 * default before writing. A party's *first* address is always made the
 * default, whatever the checkbox said: with a single address there is
 * nothing else it could fall back to, and projects left on "party default"
 * would otherwise show no address at all.
 */
async function create(
  partyId: string,
  input: PartyAddressInput,
): Promise<PartyAddress> {
  const isFirst = (await partyAddressRepository.countByParty(partyId)) === 0;
  const isDefault = isFirst || input.isDefault;
  if (isDefault) {
    await partyAddressRepository.unsetDefaultForParty(partyId);
  }
  return partyAddressRepository.create({
    partyId,
    label: input.label,
    isDefault,
    ...toAddressWriteFields(input),
  });
}

async function update(
  id: string,
  partyId: string,
  input: PartyAddressInput,
): Promise<PartyAddress> {
  if (input.isDefault) {
    await partyAddressRepository.unsetDefaultForParty(partyId, id);
  }
  return partyAddressRepository.update(id, {
    label: input.label,
    isDefault: input.isDefault,
    ...toAddressWriteFields(input),
  });
}

/** Blocked while selected as any Project's contractor or client address. */
async function isDeletable(id: string): Promise<boolean> {
  const referenced = await partyAddressRepository.isReferencedByAnyProject(id);
  return !referenced;
}

async function deleteAddress(id: string): Promise<void> {
  if (!(await isDeletable(id))) {
    throw new PartyAddressDeletionBlockedError();
  }
  await partyAddressRepository.delete(id);
}

export const partyAddressService = {
  listForParty,
  listAllGroupedByParty,
  countForParty,
  getById,
  create,
  update,
  isDeletable,
  delete: deleteAddress,
};
