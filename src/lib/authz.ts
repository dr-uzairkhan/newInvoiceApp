import { auth } from "@/lib/auth";
import type { Role } from "@/generated/prisma/client";
import type { Session } from "next-auth";

type GuardResult =
  { ok: true; session: Session } | { ok: false; error: string };

/**
 * M28 — the real enforcement boundary for Server Actions. Page/layout-level
 * gating (`src/app/(app)/layout.tsx`) only covers navigation — Server
 * Actions are callable directly regardless of which page rendered their
 * trigger, and a session can also expire mid-visit — so every action needs
 * its own check, not just the role-restricted subset. Call at the top of an
 * action and return early on failure:
 *
 *   const check = await requireSession();
 *   if (!check.ok) return { success: false, error: check.error };
 *
 * `check.session` on success is mainly there for `createdByUserId`
 * (M28.6) — most call sites just check `.ok`.
 *
 * See Docs/internal/feedback_backlog.md's M28 section.
 */
export async function requireSession(): Promise<GuardResult> {
  const session = await auth();
  if (!session) {
    return { ok: false, error: "You must be signed in to do that." };
  }
  return { ok: true, session };
}

/** Same as `requireSession`, plus a role check. */
export async function requireRole(
  allowed: readonly Role[],
): Promise<GuardResult> {
  const session = await auth();
  if (!session) {
    return { ok: false, error: "You must be signed in to do that." };
  }
  if (!allowed.includes(session.user.role)) {
    return { ok: false, error: "You don't have permission to do that." };
  }
  return { ok: true, session };
}
