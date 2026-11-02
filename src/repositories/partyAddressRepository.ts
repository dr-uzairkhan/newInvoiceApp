import { prisma } from "@/lib/prisma";
import type { PartyAddress, Prisma } from "@/generated/prisma/client";

/**
 * Thin Prisma wrappers only — no validation, no business rules. Optional
 * fields are `string | null` (never `undefined`), same convention as
 * partyRepository: `null` clears, a value sets, and the null-normalization
 * happens in partyAddressService.
 */
export type PartyAddressWriteInput = {
  partyId: string;
  label: string;
  isDefault: boolean;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

function findByParty(partyId: string): Promise<PartyAddress[]> {
  return prisma.partyAddress.findMany({
    where: { partyId },
    orderBy: { createdAt: "asc" },
  });
}

/** Keyed by party, for pages that offer every party's addresses at once (the project form). */
async function findAllGroupedByParty(): Promise<
  Record<string, PartyAddress[]>
> {
  const addresses = await prisma.partyAddress.findMany({
    orderBy: { createdAt: "asc" },
  });
  const byPartyId: Record<string, PartyAddress[]> = {};
  for (const address of addresses) {
    (byPartyId[address.partyId] ??= []).push(address);
  }
  return byPartyId;
}

function countByParty(partyId: string): Promise<number> {
  return prisma.partyAddress.count({ where: { partyId } });
}

function findById(id: string): Promise<PartyAddress | null> {
  return prisma.partyAddress.findUnique({ where: { id } });
}

function create(data: PartyAddressWriteInput): Promise<PartyAddress> {
  return prisma.partyAddress.create({ data });
}

function update(
  id: string,
  data: Omit<PartyAddressWriteInput, "partyId">,
): Promise<PartyAddress> {
  return prisma.partyAddress.update({ where: { id }, data });
}

function deleteById(id: string): Promise<PartyAddress> {
  return prisma.partyAddress.delete({ where: { id } });
}

/**
 * Un-sets any currently-default address for the party, optionally excluding
 * one id (the row being updated). Mirrors
 * paymentMethodRepository.unsetDefaultForParty.
 */
function unsetDefaultForParty(
  partyId: string,
  excludeId?: string,
): Promise<Prisma.BatchPayload> {
  return prisma.partyAddress.updateMany({
    where: {
      partyId,
      isDefault: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    data: { isDefault: false },
  });
}

/**
 * Live-reference check (Docs/implementation_decisions.md §18) — same direct
 * Project query the party and payment-method repositories use.
 */
function isReferencedByAnyProject(addressId: string): Promise<boolean> {
  return prisma.project
    .count({
      where: {
        OR: [
          { contractorAddressId: addressId },
          { clientAddressId: addressId },
        ],
      },
    })
    .then((count) => count > 0);
}

export const partyAddressRepository = {
  findByParty,
  findAllGroupedByParty,
  countByParty,
  findById,
  create,
  update,
  delete: deleteById,
  unsetDefaultForParty,
  isReferencedByAnyProject,
};
