"use server";

import { revalidatePath } from "next/cache";
import {
  userService,
  DuplicateUserEmailError,
  LastAdminError,
} from "@/services/userService";
import { userSchema } from "@/lib/validation/user";
import { requireRole } from "@/lib/authz";
import { ROLES } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/client";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createUserAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireRole(ROLES.manageUsers);
  if (!check.ok) return { success: false, error: check.error };

  const parsed = userSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const user = await userService.create(parsed.data);
    revalidatePath("/settings/users");
    return { success: true, data: { id: user.id } };
  } catch (error) {
    if (error instanceof DuplicateUserEmailError) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}

export async function updateUserRoleAction(
  id: string,
  role: Role,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireRole(ROLES.manageUsers);
  if (!check.ok) return { success: false, error: check.error };

  try {
    const user = await userService.updateRole(id, role);
    revalidatePath("/settings/users");
    return { success: true, data: { id: user.id } };
  } catch (error) {
    if (error instanceof LastAdminError) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}

export async function deleteUserAction(
  id: string,
): Promise<ActionResult<null>> {
  const check = await requireRole(ROLES.manageUsers);
  if (!check.ok) return { success: false, error: check.error };

  try {
    await userService.delete(id);
  } catch (error) {
    if (error instanceof LastAdminError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePath("/settings/users");
  return { success: true, data: null };
}
