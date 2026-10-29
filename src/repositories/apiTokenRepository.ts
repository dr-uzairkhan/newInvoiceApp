import { prisma } from "@/lib/prisma";
import type { ApiToken, ApiTokenScope } from "@/generated/prisma/client";

/** Thin Prisma wrappers only — no validation, no business rules. */
export type ApiTokenWriteInput = {
  userId: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  scope: ApiTokenScope;
  expiresAt: Date | null;
};

export type ApiTokenWithUser = ApiToken & {
  user: { id: string; email: string; name: string | null; role: "ADMIN" | "STANDARD" | "RESTRICTED" };
};

function create(data: ApiTokenWriteInput): Promise<ApiToken> {
  return prisma.apiToken.create({ data });
}

function findByHash(tokenHash: string): Promise<ApiTokenWithUser | null> {
  return prisma.apiToken.findUnique({
    where: { tokenHash },
    include: {
      user: { select: { id: true, email: true, name: true, role: true } },
    },
  });
}

function findById(id: string): Promise<ApiToken | null> {
  return prisma.apiToken.findUnique({ where: { id } });
}

function findAll(): Promise<ApiTokenWithUser[]> {
  return prisma.apiToken.findMany({
    include: {
      user: { select: { id: true, email: true, name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

function revoke(id: string, revokedAt: Date): Promise<ApiToken> {
  return prisma.apiToken.update({ where: { id }, data: { revokedAt } });
}

function touchLastUsed(id: string, lastUsedAt: Date): Promise<ApiToken> {
  return prisma.apiToken.update({ where: { id }, data: { lastUsedAt } });
}

export const apiTokenRepository = {
  create,
  findByHash,
  findById,
  findAll,
  revoke,
  touchLastUsed,
};
