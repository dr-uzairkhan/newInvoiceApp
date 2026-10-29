import { prisma } from "@/lib/prisma";
import type { ProjectAlertSchedule } from "@/generated/prisma/client";

/** Thin Prisma wrappers only — no validation, no business rules. */
export type ProjectAlertScheduleWriteInput = {
  projectId: string;
  dayOfMonth: number;
  recurring: boolean;
  label: string | null;
};

export type AlertScheduleWithProject = ProjectAlertSchedule & {
  project: { id: string; name: string };
};

function findByProject(projectId: string): Promise<ProjectAlertSchedule[]> {
  return prisma.projectAlertSchedule.findMany({
    where: { projectId },
    orderBy: { dayOfMonth: "asc" },
  });
}

function findById(id: string): Promise<ProjectAlertSchedule | null> {
  return prisma.projectAlertSchedule.findUnique({ where: { id } });
}

function create(
  data: ProjectAlertScheduleWriteInput,
): Promise<ProjectAlertSchedule> {
  return prisma.projectAlertSchedule.create({
    data: {
      projectId: data.projectId,
      dayOfMonth: data.dayOfMonth,
      recurring: data.recurring,
      label: data.label,
    },
  });
}

function update(
  id: string,
  data: Omit<ProjectAlertScheduleWriteInput, "projectId">,
): Promise<ProjectAlertSchedule> {
  return prisma.projectAlertSchedule.update({
    where: { id },
    data: {
      dayOfMonth: data.dayOfMonth,
      recurring: data.recurring,
      label: data.label,
    },
  });
}

function deleteById(id: string): Promise<ProjectAlertSchedule> {
  return prisma.projectAlertSchedule.delete({ where: { id } });
}

function clear(id: string, clearedAt: Date): Promise<ProjectAlertSchedule> {
  return prisma.projectAlertSchedule.update({
    where: { id },
    data: { clearedAt },
  });
}

/**
 * Candidates for "currently fired" across every ACTIVE project — narrows in
 * SQL to what's structurally possible (ACTIVE project, and not a
 * permanently-done one-time schedule), but the exact clamped-day-of-month
 * math stays in application code (src/lib/alertScheduleFiring.ts), same
 * philosophy as invoicePeriod.ts's computeDueDate never living in SQL.
 */
function findFireableAcrossActiveProjects(): Promise<
  AlertScheduleWithProject[]
> {
  return prisma.projectAlertSchedule.findMany({
    where: {
      // §33 — internal projects never surface on the dashboard, so their
      // (rare) schedules are excluded here too.
      project: { status: "ACTIVE", ledger: "CLIENT" },
      OR: [{ recurring: true }, { clearedAt: null }],
    },
    include: { project: { select: { id: true, name: true } } },
  });
}

export const projectAlertScheduleRepository = {
  findByProject,
  findById,
  create,
  update,
  delete: deleteById,
  clear,
  findFireableAcrossActiveProjects,
};
