import { z } from "zod";
import { defineTool, requireConfirm } from "@/mcp/core";
import {
  confirmSchema,
  idSchema,
  notFound,
  revalidateAfterWrite,
} from "@/mcp/tools/shared";
import { ROLES } from "@/lib/permissions";
import { projectSchema, type ProjectInput } from "@/lib/validation/project";
import { projectService } from "@/services/projectService";
import { invoiceService } from "@/services/invoiceService";
import { projectAlertScheduleService } from "@/services/projectAlertScheduleService";
import type { ProjectWithRelations } from "@/repositories/projectRepository";

function projectSummary(project: ProjectWithRelations) {
  return {
    id: project.id,
    name: project.name,
    abbreviation: project.abbreviation,
    serviceDescription: project.serviceDescription,
    status: project.status,
    client: { id: project.client.id, name: project.client.name },
    contractor: { id: project.contractor.id, name: project.contractor.name },
    preferredPaymentMethod: project.preferredPaymentMethod
      ? {
          id: project.preferredPaymentMethod.id,
          label: project.preferredPaymentMethod.label,
        }
      : null,
    invoiceNumberFormat: project.invoiceNumberFormat,
    previousInvoiceNumberFormats: project.previousInvoiceNumberFormats,
    invoicePeriodType: project.invoicePeriodType,
    currencyMode: project.currencyMode,
    displayCurrency: project.displayCurrency,
    referralCreditEnabled: project.referralCreditEnabled,
    referralCreditLabel: project.referralCreditLabel,
    sortOrder: project.sortOrder,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/** The form-shaped input an existing project corresponds to — the base an `update_project` merge starts from. */
export function projectToInput(project: ProjectWithRelations): ProjectInput {
  return {
    name: project.name,
    abbreviation: project.abbreviation ?? "",
    serviceDescription: project.serviceDescription ?? "",
    clientId: project.clientId,
    contractorId: project.contractorId,
    preferredPaymentMethodId: project.preferredPaymentMethodId ?? "",
    invoiceNumberFormat: project.invoiceNumberFormat,
    previousInvoiceNumberFormats: project.previousInvoiceNumberFormats.join("\n"),
    invoicePeriodType: project.invoicePeriodType ?? "",
    currencyMode: project.currencyMode,
    displayCurrency: project.displayCurrency,
    referralCreditEnabled: project.referralCreditEnabled,
    referralCreditLabel: project.referralCreditLabel ?? "",
    status: project.status,
  };
}

async function loadProject(projectId: string): Promise<ProjectWithRelations> {
  const project = await projectService.getById(projectId);
  return project ?? notFound(`Project ${projectId}`);
}

const projectFields = projectSchema.shape;

export const listProjects = defineTool({
  name: "list_projects",
  title: "List projects",
  description:
    "Lists projects with their client, contractor, numbering format and currency settings. Filter by status to see only ACTIVE or ARCHIVED projects.",
  inputSchema: {
    status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  },
  scope: "READ",
  annotations: { readOnlyHint: true },
  handler: async ({ status }) => {
    const projects = await projectService.list(status ? { status } : undefined);
    return { projects: projects.map(projectSummary) };
  },
});

export const getProject = defineTool({
  name: "get_project",
  title: "Get project",
  description:
    "One project in full, plus what a new invoice would default to (suggested next invoice number for today, default period start) and its reminder schedules with firing state.",
  inputSchema: { projectId: idSchema },
  scope: "READ",
  annotations: { readOnlyHint: true },
  target: ({ projectId }) => ({ type: "project", id: projectId }),
  handler: async ({ projectId }) => {
    const project = await loadProject(projectId);
    const [nextNumber, defaultPeriodStart, alertSchedules] = await Promise.all([
      invoiceService.previewNextInvoiceNumber(projectId),
      invoiceService.previewNextPeriodStart(projectId),
      projectAlertScheduleService.listForProjectWithFiringState(projectId),
    ]);
    return {
      project: projectSummary(project),
      nextInvoice: {
        suggestedNumber: nextNumber.suggested,
        conflictingLastInvoiceNumber: nextNumber.conflictingLastInvoiceNumber,
        defaultPeriodStart,
      },
      alertSchedules,
    };
  },
});

export const createProject = defineTool({
  name: "create_project",
  title: "Create project",
  description:
    "Creates a project linking a contractor party to a client party. The preferred payment method must belong to the contractor. invoiceNumberFormat uses tokens such as {abbreviation}, {number}, {number:month}, {year}, {month:MMM}, {date}. Optional text fields may be passed as empty strings.",
  inputSchema: projectFields,
  scope: "WRITE",
  roles: ROLES.writeProjects,
  handler: async (args, ctx) => {
    const input = projectSchema.parse(args);
    const project = await projectService.create(input, ctx.principal.userId);
    revalidateAfterWrite();
    return { project: projectSummary(await loadProject(project.id)) };
  },
});

export const updateProject = defineTool({
  name: "update_project",
  title: "Update project",
  description:
    "Updates a project. Only the fields you pass change; everything else keeps its current value. Changing invoiceNumberFormat automatically records the old format in previousInvoiceNumberFormats.",
  inputSchema: {
    projectId: idSchema,
    ...Object.fromEntries(
      Object.entries(projectFields).map(([key, schema]) => [key, schema.optional()]),
    ),
  } as { projectId: typeof idSchema } & {
    [K in keyof typeof projectFields]: z.ZodOptional<(typeof projectFields)[K]>;
  },
  scope: "WRITE",
  roles: ROLES.writeProjects,
  target: ({ projectId }) => ({ type: "project", id: projectId }),
  handler: async ({ projectId, ...patch }) => {
    const existing = await loadProject(projectId);
    const merged = { ...projectToInput(existing) };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
    }
    const input = projectSchema.parse(merged);
    await projectService.update(projectId, input);
    revalidateAfterWrite();
    return { project: projectSummary(await loadProject(projectId)) };
  },
});

export const archiveProject = defineTool({
  name: "archive_project",
  title: "Archive or reactivate project",
  description:
    "Sets a project's status to ARCHIVED (hidden from the dashboard and active lists; its invoices stay) or back to ACTIVE.",
  inputSchema: {
    projectId: idSchema,
    status: z.enum(["ACTIVE", "ARCHIVED"]),
  },
  scope: "WRITE",
  roles: ROLES.writeProjects,
  annotations: { idempotentHint: true },
  target: ({ projectId }) => ({ type: "project", id: projectId }),
  handler: async ({ projectId, status }) => {
    const existing = await loadProject(projectId);
    await projectService.update(projectId, {
      ...projectToInput(existing),
      status,
    });
    revalidateAfterWrite();
    return { project: projectSummary(await loadProject(projectId)) };
  },
});

export const reorderProject = defineTool({
  name: "reorder_project",
  title: "Move project up or down",
  description:
    "Swaps the project's manual display position with its neighbouring ACTIVE project on the Projects page.",
  inputSchema: { projectId: idSchema, direction: z.enum(["up", "down"]) },
  scope: "WRITE",
  roles: ROLES.writeProjects,
  target: ({ projectId }) => ({ type: "project", id: projectId }),
  handler: async ({ projectId, direction }) => {
    await loadProject(projectId);
    await projectService.move(projectId, direction);
    revalidateAfterWrite();
    return { ok: true };
  },
});

export const deleteProject = defineTool({
  name: "delete_project",
  title: "Delete project",
  description:
    "Permanently deletes a project. Refused while the project has any invoices (archive it instead). Irreversible — requires confirm: true.",
  inputSchema: { projectId: idSchema, confirm: confirmSchema },
  scope: "WRITE_DESTRUCTIVE",
  roles: ROLES.writeProjects,
  annotations: { destructiveHint: true },
  target: ({ projectId }) => ({ type: "project", id: projectId }),
  handler: async ({ projectId, confirm }) => {
    requireConfirm(confirm, "Deleting a project");
    await loadProject(projectId);
    await projectService.delete(projectId);
    revalidateAfterWrite();
    return { deleted: true, projectId };
  },
});

export const PROJECT_TOOLS = [
  listProjects,
  getProject,
  createProject,
  updateProject,
  archiveProject,
  reorderProject,
  deleteProject,
];
