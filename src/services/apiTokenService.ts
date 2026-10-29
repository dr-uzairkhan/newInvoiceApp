import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  apiTokenRepository,
  type ApiTokenWithUser,
} from "@/repositories/apiTokenRepository";
import type { ApiTokenInput } from "@/lib/validation/apiToken";
import type { ApiToken, ApiTokenScope, Role } from "@/generated/prisma/client";

export class ApiTokenNotFoundError extends Error {
  constructor() {
    super("That API token no longer exists.");
    this.name = "ApiTokenNotFoundError";
  }
}

/** Who an authenticated MCP call acts as — the token's owner, with the owner's *current* role. */
export type Principal = {
  tokenId: string;
  userId: string;
  userEmail: string;
  role: Role;
  scope: ApiTokenScope;
};

const TOKEN_PREFIX = "nv_";
/** Re-stamp `lastUsedAt` at most this often, so a busy client doesn't write a row per call. */
const LAST_USED_THROTTLE_MS = 60_000;

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/**
 * Personal API tokens for the MCP endpoint (`Docs/implementation_decisions.md`
 * §32). The plaintext exists only in the create() result; the DB holds its
 * SHA-256 hash (a leaked database never yields usable tokens) plus a short
 * display prefix. Verification hashes the presented token and compares in
 * constant time against the stored hash the lookup returned.
 */
async function create(
  input: ApiTokenInput,
  userId: string,
): Promise<{ token: ApiToken; plaintext: string }> {
  const plaintext = `${TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
  const expiresAt =
    input.expiresInDays === 0
      ? null
      : new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
  const token = await apiTokenRepository.create({
    userId,
    name: input.name,
    tokenHash: hashToken(plaintext),
    tokenPrefix: plaintext.slice(0, TOKEN_PREFIX.length + 6),
    scope: input.scope,
    expiresAt,
  });
  return { token, plaintext };
}

/**
 * Resolves a presented bearer token to a principal, or `null` for anything
 * that must not be trusted: unknown, revoked, or expired. The role comes
 * from the owning user *now*, never from the token row — demoting or
 * deleting a user takes effect on their tokens immediately.
 */
async function authenticate(plaintext: string): Promise<Principal | null> {
  if (!plaintext.startsWith(TOKEN_PREFIX)) return null;
  const presentedHash = hashToken(plaintext);
  const row = await apiTokenRepository.findByHash(presentedHash);
  if (!row) return null;
  if (!constantTimeEqualHex(row.tokenHash, presentedHash)) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

  const now = new Date();
  if (
    !row.lastUsedAt ||
    now.getTime() - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS
  ) {
    await apiTokenRepository.touchLastUsed(row.id, now);
  }
  return toPrincipal(row);
}

function toPrincipal(row: ApiTokenWithUser): Principal {
  return {
    tokenId: row.id,
    userId: row.user.id,
    userEmail: row.user.email,
    role: row.user.role,
    scope: row.scope,
  };
}

function constantTimeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function list(): Promise<ApiTokenWithUser[]> {
  return apiTokenRepository.findAll();
}

/** Kept here (not in a component) so the settings page can render without reading the clock itself. */
function isExpired(
  token: { expiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  return token.expiresAt !== null && token.expiresAt.getTime() <= now.getTime();
}

async function revoke(id: string): Promise<ApiToken> {
  const existing = await apiTokenRepository.findById(id);
  if (!existing) throw new ApiTokenNotFoundError();
  if (existing.revokedAt) return existing;
  return apiTokenRepository.revoke(id, new Date());
}

/** READ ⊂ WRITE ⊂ WRITE_DESTRUCTIVE. */
const SCOPE_RANK: Record<ApiTokenScope, number> = {
  READ: 0,
  WRITE: 1,
  WRITE_DESTRUCTIVE: 2,
};

export function scopeAllows(
  granted: ApiTokenScope,
  required: ApiTokenScope,
): boolean {
  return SCOPE_RANK[granted] >= SCOPE_RANK[required];
}

export const apiTokenService = {
  create,
  authenticate,
  list,
  isExpired,
  revoke,
};
