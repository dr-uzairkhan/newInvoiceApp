import type { Role } from "@/generated/prisma/client";

/**
 * The one table of role gates, shared by the Server Actions
 * (`requireRole(ROLES.x)`) and the MCP tool layer (`src/mcp`), so a rule
 * changed here applies to both callers by construction — see
 * `Docs/implementation_decisions.md` §8 (roles) and §32 (MCP).
 *
 * Business rules themselves live in the services as named errors; these
 * are only "who may attempt it".
 */
export const ALL_ROLES: readonly Role[] = ["ADMIN", "STANDARD", "RESTRICTED"];

export const ROLES = {
  /** Users, AI providers and API tokens are administered by ADMINs only. */
  manageUsers: ["ADMIN"] as readonly Role[],
  manageAiProviders: ["ADMIN"] as readonly Role[],
  manageApiTokens: ["ADMIN"] as readonly Role[],
  /** Master data: parties, payment methods, projects and their reminder schedules. */
  writeParties: ["ADMIN", "STANDARD"] as readonly Role[],
  writePaymentMethods: ["ADMIN", "STANDARD"] as readonly Role[],
  writeProjects: ["ADMIN", "STANDARD"] as readonly Role[],
  writeAlertSchedules: ["ADMIN", "STANDARD"] as readonly Role[],
  /** Day-to-day invoicing is open to every signed-in role, RESTRICTED included. */
  clearAlertSchedules: ALL_ROLES,
  writeInvoices: ALL_ROLES,
  writeComments: ALL_ROLES,
  read: ALL_ROLES,
} as const;

export function hasRole(role: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(role);
}
