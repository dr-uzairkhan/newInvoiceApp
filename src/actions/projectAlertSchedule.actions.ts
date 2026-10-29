"use server";

import { revalidatePath } from "next/cache";
import { projectAlertScheduleService } from "@/services/projectAlertScheduleService";
import { projectAlertScheduleSchema } from "@/lib/validation/projectAlertSchedule";
import { requireRole, requireSession } from "@/lib/authz";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Revalidates every surface that reads the fired-alert set: the owning
 * project's page, the dashboard planner, and the Projects list (its
 * alert-dot indicator) — so "clear from anywhere reflects everywhere" is
 * actually true.
 */
function revalidateAlertSchedulePaths(projectId: string): void {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function createProjectAlertScheduleAction(
  projectId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireRole(["ADMIN", "STANDARD"]);
  if (!check.ok) return { success: false, error: check.error };

  const parsed = projectAlertScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const schedule = await projectAlertScheduleService.create(
    projectId,
    parsed.data,
  );
  revalidateAlertSchedulePaths(projectId);
  return { success: true, data: { id: schedule.id } };
}

export async function updateProjectAlertScheduleAction(
  id: string,
  projectId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const check = await requireRole(["ADMIN", "STANDARD"]);
  if (!check.ok) return { success: false, error: check.error };

  const parsed = projectAlertScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const schedule = await projectAlertScheduleService.update(id, parsed.data);
  revalidateAlertSchedulePaths(projectId);
  return { success: true, data: { id: schedule.id } };
}

export async function deleteProjectAlertScheduleAction(
  id: string,
  projectId: string,
): Promise<ActionResult<null>> {
  const check = await requireRole(["ADMIN", "STANDARD"]);
  if (!check.ok) return { success: false, error: check.error };

  await projectAlertScheduleService.delete(id);
  revalidateAlertSchedulePaths(projectId);
  return { success: true, data: null };
}

export async function clearProjectAlertScheduleAction(
  id: string,
  projectId: string,
): Promise<ActionResult<null>> {
  const check = await requireSession();
  if (!check.ok) return { success: false, error: check.error };

  await projectAlertScheduleService.clear(id);
  revalidateAlertSchedulePaths(projectId);
  return { success: true, data: null };
}
