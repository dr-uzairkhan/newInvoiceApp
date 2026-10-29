import { prisma } from "@/lib/prisma";
import type { McpAuditLog } from "@/generated/prisma/client";

/** Thin Prisma wrappers only. */
export type McpAuditLogWriteInput = {
  tokenId: string | null;
  userId: string | null;
  tool: string;
  targetType: string | null;
  targetId: string | null;
  outcome: "ok" | "denied" | "error";
  detail: string | null;
};

function create(data: McpAuditLogWriteInput): Promise<McpAuditLog> {
  return prisma.mcpAuditLog.create({ data });
}

function findRecent(limit: number): Promise<McpAuditLog[]> {
  return prisma.mcpAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

function findForTarget(
  targetType: string,
  targetId: string,
): Promise<McpAuditLog[]> {
  return prisma.mcpAuditLog.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: "desc" },
  });
}

export const mcpAuditLogRepository = { create, findRecent, findForTarget };
