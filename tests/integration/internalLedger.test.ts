// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { invoiceService } from "@/services/invoiceService";
import { projectService } from "@/services/projectService";
import { partyService } from "@/services/partyService";
import { paymentMethodService } from "@/services/paymentMethodService";
import { projectAlertScheduleService } from "@/services/projectAlertScheduleService";
import { executeTool } from "@/mcp/core";
import { listProjects } from "@/mcp/tools/projects";
import { listInvoices } from "@/mcp/tools/invoices";
import { prisma } from "@/lib/prisma";
import type { ProjectInput } from "@/lib/validation/project";
import type { Principal } from "@/services/apiTokenService";

const createdPartyIds: string[] = [];
const createdProjectIds: string[] = [];
const createdInvoiceIds: string[] = [];
const createdUserIds: string[] = [];

async function createParty(name: string) {
  const party = await partyService.create({
    name,
    email: "",
    type: "ORGANIZATION",
    street1: "",
    street2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
  });
  createdPartyIds.push(party.id);
  return party;
}

async function createProject(overrides: Partial<ProjectInput>) {
  const contractor = await createParty("[test] Ledger Issuer");
  const client = await createParty("[test] Ledger Client");
  const method = await paymentMethodService.create(contractor.id, {
    type: "CUSTOM",
    label: "[test] Method",
    isDefault: true,
    fields: [{ key: "note", label: "Note", value: "n/a" }],
  });
  const project = await projectService.create({
    name: "[test] Ledger Project",
    abbreviation: "LG",
    serviceDescription: "",
    clientId: client.id,
    contractorId: contractor.id,
    preferredPaymentMethodId: method.id,
    invoiceNumberFormat: "{abbreviation}-{number}",
    previousInvoiceNumberFormats: "",
    invoicePeriodType: "",
    currencyMode: "SINGLE",
    displayCurrency: "USD",
    referralCreditEnabled: false,
    referralCreditLabel: "",
    status: "ACTIVE",
    ...overrides,
  });
  createdProjectIds.push(project.id);
  return project;
}

async function createInvoice(projectId: string, invoiceNumber: string, issueDate: string, dueDate: string) {
  const invoice = await invoiceService.createDraft(projectId, {
    invoiceNumber,
    issueDate,
    dueDate,
    items: [
      { description: "Work", isFlatAmount: true, quantity: "", unitPrice: "", amount: "250", durationText: "Fixed" },
    ],
  });
  createdInvoiceIds.push(invoice.id);
  return invoice;
}

async function principal(): Promise<Principal> {
  const user = await prisma.user.create({
    data: {
      email: `test-ledger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      role: "ADMIN",
    },
  });
  createdUserIds.push(user.id);
  const token = await prisma.apiToken.create({
    data: { userId: user.id, name: "[test]", tokenHash: `ledger-${user.id}`, tokenPrefix: "nv_t", scope: "READ" },
  });
  return { tokenId: token.id, userId: user.id, userEmail: user.email, role: "ADMIN", scope: "READ" };
}

/** Every cross-project aggregate the main app renders — captured before and after to prove internal rows change none of them. */
async function snapshotMainAggregates() {
  const [
    invoices,
    sent,
    drafts,
    overdue,
    stale,
    sentCount,
    draftCount,
    sentUsd,
    projects,
    active,
    activeCount,
    recent,
    missingPm,
    fired,
    live,
  ] = await Promise.all([
    invoiceService.list(),
    invoiceService.listByStatus("SENT"),
    invoiceService.listByStatus("DRAFT"),
    invoiceService.listOverdue(),
    invoiceService.listStaleDrafts(),
    invoiceService.countByStatus("SENT"),
    invoiceService.countByStatus("DRAFT"),
    invoiceService.sumSubtotalByStatus("SENT"),
    projectService.list(),
    projectService.list({ status: "ACTIVE" }),
    projectService.countActive(),
    projectService.listRecentlyCreated(50),
    projectService.listMissingPreferredPaymentMethod(),
    projectAlertScheduleService.listFiredAcrossActiveProjects(),
    projectAlertScheduleService.listLiveAcrossActiveProjects(),
  ]);
  return {
    invoices: invoices.length,
    sent: sent.length,
    drafts: drafts.length,
    overdue: overdue.length,
    stale: stale.length,
    sentCount,
    draftCount,
    sentUsd: sentUsd.toString(),
    projects: projects.length,
    active: active.length,
    activeCount,
    recent: recent.length,
    missingPm: missingPm.length,
    fired: fired.length,
    live: live.length,
  };
}

afterEach(async () => {
  if (createdInvoiceIds.length) {
    await prisma.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
    createdInvoiceIds.length = 0;
  }
  if (createdProjectIds.length) {
    await prisma.projectAlertSchedule.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    createdProjectIds.length = 0;
  }
  if (createdPartyIds.length) {
    await prisma.paymentMethod.deleteMany({ where: { partyId: { in: createdPartyIds } } });
    await prisma.party.deleteMany({ where: { id: { in: createdPartyIds } } });
    createdPartyIds.length = 0;
  }
  if (createdUserIds.length) {
    await prisma.mcpAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("internal ledger (§33)", () => {
  it("an INTERNAL project with an overdue sent invoice, a stale draft and a schedule changes no main-app aggregate", async () => {
    const before = await snapshotMainAggregates();

    const internal = await createProject({ ledger: "INTERNAL" });
    const sent = await createInvoice(internal.id, "LG-01", "2020-01-01", "2020-01-15");
    await prisma.invoice.update({ where: { id: sent.id }, data: { status: "SENT" } });
    const draft = await createInvoice(internal.id, "LG-02", "2020-02-01", "2020-02-15");
    await prisma.invoice.update({ where: { id: draft.id }, data: { createdAt: new Date("2020-02-01") } });
    await projectAlertScheduleService.create(internal.id, { dayOfMonth: 1, recurring: true, label: "Send Invoice" });

    const after = await snapshotMainAggregates();
    expect(after).toEqual(before);

    // …while the internal section sees all of it.
    const internalProjects = await projectService.list({ ledger: "INTERNAL" });
    expect(internalProjects.map((project) => project.id)).toContain(internal.id);
    const internalInvoices = await invoiceService.list({ ledger: "INTERNAL" });
    expect(internalInvoices.map((invoice) => invoice.id).sort()).toEqual([sent.id, draft.id].sort());
    expect(await invoiceService.listByStatus("SENT", { ledger: "INTERNAL" })).toHaveLength(1);

    // Direct lookups are never scoped.
    expect((await projectService.getById(internal.id))?.ledger).toBe("INTERNAL");
    expect((await invoiceService.getById(sent.id))?.id).toBe(sent.id);
    expect((await invoiceService.listByProject(internal.id)).length).toBe(2);
  });

  it("a CLIENT project is the default and does appear in the main aggregates", async () => {
    const before = await snapshotMainAggregates();
    const client = await createProject({});
    expect(client.ledger).toBe("CLIENT");
    const after = await snapshotMainAggregates();
    expect(after.projects).toBe(before.projects + 1);
    expect(after.activeCount).toBe(before.activeCount + 1);
  });

  it("the ledger is set once: update ignores a different value", async () => {
    const internal = await createProject({ ledger: "INTERNAL" });
    await projectService.update(internal.id, {
      name: "[test] Ledger Project renamed",
      abbreviation: "LG",
      serviceDescription: "",
      clientId: internal.clientId,
      contractorId: internal.contractorId,
      preferredPaymentMethodId: internal.preferredPaymentMethodId ?? "",
      invoiceNumberFormat: internal.invoiceNumberFormat,
      previousInvoiceNumberFormats: "",
      invoicePeriodType: "",
      currencyMode: "SINGLE",
      displayCurrency: "USD",
      referralCreditEnabled: false,
      referralCreditLabel: "",
      status: "ACTIVE",
      ledger: "CLIENT",
    });
    expect((await projectService.getById(internal.id))?.ledger).toBe("INTERNAL");
  });

  it("MCP list tools default to CLIENT and accept ledger: INTERNAL", async () => {
    const admin = await principal();
    const internal = await createProject({ ledger: "INTERNAL" });
    const invoice = await createInvoice(internal.id, "LG-01", "2026-01-01", "2026-01-15");

    const read = async (tool: Parameters<typeof executeTool>[0], args: unknown) => {
      const result = await executeTool(tool, args, { principal: admin });
      return JSON.parse(result.content[0].type === "text" ? result.content[0].text : "{}");
    };

    const defaultProjects = await read(listProjects, {});
    expect(defaultProjects.projects.map((p: { id: string }) => p.id)).not.toContain(internal.id);
    const internalProjects = await read(listProjects, { ledger: "INTERNAL" });
    expect(internalProjects.projects.map((p: { id: string }) => p.id)).toContain(internal.id);
    expect(internalProjects.projects.find((p: { id: string }) => p.id === internal.id).ledger).toBe("INTERNAL");

    const defaultInvoices = await read(listInvoices, {});
    expect(defaultInvoices.invoices.map((i: { id: string }) => i.id)).not.toContain(invoice.id);
    const internalInvoices = await read(listInvoices, { ledger: "INTERNAL" });
    expect(internalInvoices.invoices.map((i: { id: string }) => i.id)).toContain(invoice.id);
    // projectId wins over ledger — a project has exactly one ledger.
    const byProject = await read(listInvoices, { projectId: internal.id });
    expect(byProject.invoices).toHaveLength(1);
  });
});
