"use server";

import { revalidatePath } from "next/cache";
import {
  projectService,
  ProjectDeletionBlockedError,
  PreferredPaymentMethodMismatchError,
} from "@/services/projectService";
import { projectSchema } from "@/lib/validation/project";
import { requireRole } from "@/lib/authz";
import { ROLES } from "@/lib/permissions";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createProjectAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireRole(ROLES.writeProjects);
  if (!check.ok) return { success: false, error: check.error };

  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const project = await projectService.create(
      parsed.data,
      check.session.user.id,
    );
    revalidatePath("/projects");
    return { success: true, data: { id: project.id } };
  } catch (error) {
    if (error instanceof PreferredPaymentMethodMismatchError) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}

export async function updateProjectAction(
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireRole(ROLES.writeProjects);
  if (!check.ok) return { success: false, error: check.error };

  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const project = await projectService.update(id, parsed.data);
    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    return { success: true, data: { id: project.id } };
  } catch (error) {
    if (error instanceof PreferredPaymentMethodMismatchError) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}

export async function moveProjectAction(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult<null>> {
  const check = await requireRole(ROLES.writeProjects);
  if (!check.ok) return { success: false, error: check.error };

  await projectService.move(id, direction);
  revalidatePath("/");
  revalidatePath("/projects");
  return { success: true, data: null };
}

export async function deleteProjectAction(
  id: string,
): Promise<ActionResult<null>> {
  const check = await requireRole(ROLES.writeProjects);
  if (!check.ok) return { success: false, error: check.error };

  try {
    await projectService.delete(id);
  } catch (error) {
    if (error instanceof ProjectDeletionBlockedError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePath("/projects");
  return { success: true, data: null };
}
