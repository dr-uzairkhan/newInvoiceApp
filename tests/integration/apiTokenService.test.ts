// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  apiTokenService,
  hashToken,
  scopeAllows,
  ApiTokenNotFoundError,
} from "@/services/apiTokenService";
import { prisma } from "@/lib/prisma";

const createdUserIds: string[] = [];

async function createTestUser(role: "ADMIN" | "STANDARD" | "RESTRICTED" = "ADMIN") {
  const user = await prisma.user.create({
    data: {
      email: `test-token-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      name: "[test] token owner",
      role,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

afterEach(async () => {
  if (createdUserIds.length) {
    // ApiToken rows cascade with the user.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("apiTokenService", () => {
  it("creates a token whose plaintext is returned once and only its hash is stored", async () => {
    const user = await createTestUser();
    const { token, plaintext } = await apiTokenService.create(
      { name: "[test] laptop", scope: "WRITE", expiresInDays: 90 },
      user.id,
    );
    expect(plaintext.startsWith("nv_")).toBe(true);
    expect(token.tokenHash).toBe(hashToken(plaintext));
    expect(token.tokenHash).not.toContain(plaintext.slice(3, 20));
    expect(plaintext.startsWith(token.tokenPrefix)).toBe(true);
    expect(token.expiresAt).not.toBeNull();
  });

  it("authenticates a valid token as its owner's current role and scope", async () => {
    const user = await createTestUser("STANDARD");
    const { plaintext } = await apiTokenService.create(
      { name: "[test] t", scope: "READ", expiresInDays: 0 },
      user.id,
    );
    const principal = await apiTokenService.authenticate(plaintext);
    expect(principal).toMatchObject({
      userId: user.id,
      role: "STANDARD",
      scope: "READ",
    });

    // Role is read live: demoting the user demotes every token immediately.
    await prisma.user.update({ where: { id: user.id }, data: { role: "RESTRICTED" } });
    expect((await apiTokenService.authenticate(plaintext))?.role).toBe("RESTRICTED");
  });

  it("rejects unknown, malformed, revoked and expired tokens", async () => {
    const user = await createTestUser();
    const { token, plaintext } = await apiTokenService.create(
      { name: "[test] t", scope: "WRITE", expiresInDays: 30 },
      user.id,
    );
    expect(await apiTokenService.authenticate("not-a-token")).toBeNull();
    expect(await apiTokenService.authenticate(`${plaintext}x`)).toBeNull();

    await apiTokenService.revoke(token.id);
    expect(await apiTokenService.authenticate(plaintext)).toBeNull();

    const { token: expiring, plaintext: expiringPlain } = await apiTokenService.create(
      { name: "[test] expiring", scope: "WRITE", expiresInDays: 30 },
      user.id,
    );
    await prisma.apiToken.update({
      where: { id: expiring.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await apiTokenService.authenticate(expiringPlain)).toBeNull();
  });

  it("stamps lastUsedAt on use and revoke is idempotent; revoking a missing token throws", async () => {
    const user = await createTestUser();
    const { token, plaintext } = await apiTokenService.create(
      { name: "[test] t", scope: "READ", expiresInDays: 0 },
      user.id,
    );
    expect(token.lastUsedAt).toBeNull();
    await apiTokenService.authenticate(plaintext);
    const used = await prisma.apiToken.findUniqueOrThrow({ where: { id: token.id } });
    expect(used.lastUsedAt).not.toBeNull();

    const first = await apiTokenService.revoke(token.id);
    const second = await apiTokenService.revoke(token.id);
    expect(second.revokedAt?.getTime()).toBe(first.revokedAt?.getTime());
    await expect(apiTokenService.revoke("missing")).rejects.toBeInstanceOf(
      ApiTokenNotFoundError,
    );
  });

  it("scopes nest: READ ⊂ WRITE ⊂ WRITE_DESTRUCTIVE", () => {
    expect(scopeAllows("READ", "READ")).toBe(true);
    expect(scopeAllows("READ", "WRITE")).toBe(false);
    expect(scopeAllows("WRITE", "READ")).toBe(true);
    expect(scopeAllows("WRITE", "WRITE_DESTRUCTIVE")).toBe(false);
    expect(scopeAllows("WRITE_DESTRUCTIVE", "WRITE")).toBe(true);
  });
});
