import { prisma } from "@/lib/prisma";
import type { Party, PartyType } from "@/generated/prisma/client";
import type { PartyAddressWriteInput } from "@/repositories/partyAddressRepository";

/**
 * Thin Prisma wrappers only — no validation, no business rules. Optional
 * fields are `string | null` (never `undefined`) so callers always
 * explicitly state intent: `null` clears a field on update, a value sets it.
 * Undefined would be silently ignored by Prisma's update — see partyService
 * for where the null-normalization happens.
 */
export type PartyWriteInput = {
  name: string;
  email: string | null;
  type: PartyType;
};

function findMany(): Promise<Party[]> {
  return prisma.party.findMany({ orderBy: { name: "asc" } });
}

function findById(id: string): Promise<Party | null> {
  return prisma.party.findUnique({ where: { id } });
}

/**
 * `initialAddress`, when given, is created in the same statement as the
 * party (a nested write, so the two can't end up half-saved) — the party
 * create form's optional first address.
 */
function create(
  data: PartyWriteInput,
  initialAddress: Omit<PartyAddressWriteInput, "partyId"> | null = null,
): Promise<Party> {
  return prisma.party.create({
    data: {
      ...data,
      ...(initialAddress ? { addresses: { create: initialAddress } } : {}),
    },
  });
}

function update(id: string, data: PartyWriteInput): Promise<Party> {
  return prisma.party.update({ where: { id }, data });
}

function deleteById(id: string): Promise<Party> {
  return prisma.party.delete({ where: { id } });
}

/**
 * Live-reference check for Docs/implementation_decisions.md §18: a Party is
 * deletable only while not set as any Project's contractor or client. Queries
 * the Project table directly rather than going through projectRepository —
 * this was already fully live as of M2 (before projectRepository existed) and
 * stays a direct query now that it does, since it's a simple enough count not
 * to warrant a repository-to-repository dependency.
 */
function isReferencedByAnyProject(partyId: string): Promise<boolean> {
  return prisma.project
    .count({
      where: { OR: [{ contractorId: partyId }, { clientId: partyId }] },
    })
    .then((count) => count > 0);
}

export const partyRepository = {
  findMany,
  findById,
  create,
  update,
  delete: deleteById,
  isReferencedByAnyProject,
};
