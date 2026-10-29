import { defineTool, requireConfirm } from "@/mcp/core";
import {
  confirmSchema,
  idSchema,
  notFound,
  revalidateAfterWrite,
} from "@/mcp/tools/shared";
import { ROLES } from "@/lib/permissions";
import { projectAlertScheduleSchema } from "@/lib/validation/projectAlertSchedule";
import { projectAlertScheduleService } from "@/services/projectAlertScheduleService";
import { projectService } from "@/services/projectService";
import type { ProjectAlertSchedule } from "@/generated/prisma/client";

async function loadSchedule(scheduleId: string): Promise<ProjectAlertSchedule> {
  const schedule = await projectAlertScheduleService.getById(scheduleId);
  return schedule ?? notFound(`Alert schedule ${scheduleId}`);
}

const fields = projectAlertScheduleSchema.shape;

export const listAlertSchedules = defineTool({
  name: "list_alert_schedules",
  title: "List reminder schedules",
  description:
    "A project's day-of-month reminder schedules with whether each is currently fired (due and not yet cleared). A schedule labelled \"Send Invoice\" also drives the dashboard planner and the project's next-billing date.",
  inputSchema: { projectId: idSchema },
  scope: "READ",
  annotations: { readOnlyHint: true },
  target: ({ projectId }) => ({ type: "project", id: projectId }),
  handler: async ({ projectId }) => {
    if (!(await projectService.getById(projectId))) notFound(`Project ${projectId}`);
    return {
      schedules: await projectAlertScheduleService.listForProjectWithFiringState(projectId),
    };
  },
});

export const createAlertSchedule = defineTool({
  name: "create_alert_schedule",
  title: "Create reminder schedule",
  description:
    "Adds a day-of-month reminder (1–31; clamped to the month's last day) to a project. recurring true fires every month; false fires once. Label it exactly \"Send Invoice\" to make it an invoicing signal for the planner.",
  inputSchema: { projectId: idSchema, ...fields },
  scope: "WRITE",
  roles: ROLES.writeAlertSchedules,
  target: ({ projectId }) => ({ type: "project", id: projectId }),
  handler: async ({ projectId, ...rest }) => {
    if (!(await projectService.getById(projectId))) notFound(`Project ${projectId}`);
    const schedule = await projectAlertScheduleService.create(
      projectId,
      projectAlertScheduleSchema.parse(rest),
    );
    revalidateAfterWrite();
    return { schedule };
  },
});

export const updateAlertSchedule = defineTool({
  name: "update_alert_schedule",
  title: "Update reminder schedule",
  description: "Changes a schedule's day, recurrence or label. Only the fields you pass change.",
  inputSchema: {
    scheduleId: idSchema,
    dayOfMonth: fields.dayOfMonth.optional(),
    recurring: fields.recurring.optional(),
    label: fields.label,
  },
  scope: "WRITE",
  roles: ROLES.writeAlertSchedules,
  target: ({ scheduleId }) => ({ type: "alertSchedule", id: scheduleId }),
  handler: async ({ scheduleId, ...patch }) => {
    const existing = await loadSchedule(scheduleId);
    const schedule = await projectAlertScheduleService.update(
      scheduleId,
      projectAlertScheduleSchema.parse({
        dayOfMonth: patch.dayOfMonth ?? existing.dayOfMonth,
        recurring: patch.recurring ?? existing.recurring,
        label: patch.label ?? existing.label ?? "",
      }),
    );
    revalidateAfterWrite();
    return { schedule };
  },
});

export const clearAlertSchedule = defineTool({
  name: "clear_alert_schedule",
  title: "Clear a fired reminder",
  description:
    "Marks a fired reminder as handled. A recurring schedule re-arms next month; a one-time schedule stays cleared.",
  inputSchema: { scheduleId: idSchema },
  scope: "WRITE",
  roles: ROLES.clearAlertSchedules,
  annotations: { idempotentHint: true },
  target: ({ scheduleId }) => ({ type: "alertSchedule", id: scheduleId }),
  handler: async ({ scheduleId }) => {
    await loadSchedule(scheduleId);
    const schedule = await projectAlertScheduleService.clear(scheduleId);
    revalidateAfterWrite();
    return { schedule };
  },
});

export const deleteAlertSchedule = defineTool({
  name: "delete_alert_schedule",
  title: "Delete reminder schedule",
  description: "Removes a reminder schedule from its project. Irreversible — requires confirm: true.",
  inputSchema: { scheduleId: idSchema, confirm: confirmSchema },
  scope: "WRITE_DESTRUCTIVE",
  roles: ROLES.writeAlertSchedules,
  annotations: { destructiveHint: true },
  target: ({ scheduleId }) => ({ type: "alertSchedule", id: scheduleId }),
  handler: async ({ scheduleId, confirm }) => {
    requireConfirm(confirm, "Deleting a reminder schedule");
    await loadSchedule(scheduleId);
    await projectAlertScheduleService.delete(scheduleId);
    revalidateAfterWrite();
    return { deleted: true, scheduleId };
  },
});

export const ALERT_SCHEDULE_TOOLS = [
  listAlertSchedules,
  createAlertSchedule,
  updateAlertSchedule,
  clearAlertSchedule,
  deleteAlertSchedule,
];
