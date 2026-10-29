// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { executeTool } from "@/mcp/core";
import { ALL_TOOLS } from "@/mcp/tools";
import {
  createDraftInvoice,
  deleteInvoice,
  getInvoice,
  listInvoices,
  markInvoiceSent,
  updateDraftInvoice,
  voidInvoice,
} from "@/mcp/tools/invoices";
import { createParty, deleteParty, updateParty } from "@/mcp/tools/parties";
import {
  createPaymentMethod,
  getPaymentMethod,
  listPaymentMethods,
} from "@/mcp/tools/paymentMethods";
import { createProject, getProject, updateProject } from "@/mcp/tools/projects";
import { addInvoiceComment, deleteInvoiceComment, listInvoiceComments } from "@/mcp/tools/comments";
import { createAlertSchedule, listAlertSchedules } from "@/mcp/tools/alertSchedules";
import { getInvoicePdf } from "@/mcp/tools/documents";
import type { Principal } from "@/services/apiTokenService";
import { prisma } from "@/lib/prisma";
import type { ApiTokenScope, Role } from "@/generated/prisma/client";

const createdUserIds: string[] = [];
const createdPartyIds: string[] = [];
const createdProjectIds: string[] = [];
const createdInvoiceIds: string[] = [];

async function principalFor(role: Role, scope: ApiTokenScope): Promise<Principal> {
  const user = await prisma.user.create({
    data: {
      email: `test-mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      name: `[test] ${role}`,
      role,
    },
  });
  createdUserIds.push(user.id);
  const token = await prisma.apiToken.create({
    data: {
      userId: user.id,
      name: "[test] token",
      tokenHash: `test-${user.id}`,
      tokenPrefix: "nv_test",
      scope,
    },
  });
  return { tokenId: token.id, userId: user.id, userEmail: user.email, role, scope };
}

/** Runs a tool exactly as the endpoint would and returns the parsed JSON (or the error text). */
async function call(tool: Parameters<typeof executeTool>[0], args: unknown, principal: Principal) {
  const result = await executeTool(tool, args, { principal });
  const text = result.content[0]?.type === "text" ? result.content[0].text : "";
  return { result, text, data: result.isError ? null : JSON.parse(text) };
}

const partyInput = (name: string) => ({
  name,
  email: "",
  type: "ORGANIZATION" as const,
  street1: "",
  street2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
});

async function setupProject(principal: Principal) {
  const contractor = (await call(createParty, partyInput("[test] MCP Contractor"), principal)).data.party;
  const client = (await call(createParty, partyInput("[test] MCP Client"), principal)).data.party;
  createdPartyIds.push(contractor.id, client.id);
  const method = (
    await call(
      createPaymentMethod,
      {
        partyId: contractor.id,
        type: "BANK_WIRE",
        label: "[test] Main account",
        isDefault: true,
        fields: [
          { key: "bank", label: "Bank", value: "Example Bank" },
          { key: "account", label: "Account number", value: "123456789012" },
        ],
      },
      principal,
    )
  ).data.paymentMethod;
  const project = (
    await call(
      createProject,
      {
        name: "[test] MCP Project",
        abbreviation: "MP",
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
      },
      principal,
    )
  ).data.project;
  createdProjectIds.push(project.id);
  return { contractor, client, method, project };
}

afterEach(async () => {
  if (createdInvoiceIds.length) {
    await prisma.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
    createdInvoiceIds.length = 0;
  }
  if (createdProjectIds.length) {
    await prisma.invoice.deleteMany({ where: { projectId: { in: createdProjectIds } } });
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

describe("mcp tool registry", () => {
  it("has unique tool names and every tool declares a scope", () => {
    const names = ALL_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThanOrEqual(30);
    for (const tool of ALL_TOOLS) {
      expect(["READ", "WRITE", "WRITE_DESTRUCTIVE"]).toContain(tool.scope);
    }
  });
});

describe("mcp tools — rule enforcement", () => {
  it("denies a write tool to a READ token and writes a 'denied' audit row", async () => {
    const principal = await principalFor("ADMIN", "READ");
    const { result, text } = await call(createParty, partyInput("[test] denied"), principal);
    expect(result.isError).toBe(true);
    expect(text).toContain("scope (READ) does not allow create_party");
    const rows = await prisma.mcpAuditLog.findMany({ where: { tokenId: principal.tokenId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tool: "create_party", outcome: "denied" });
  });

  it("applies the same role table as the Server Actions: RESTRICTED may write invoices but not parties", async () => {
    const admin = await principalFor("ADMIN", "WRITE_DESTRUCTIVE");
    const { project } = await setupProject(admin);
    const restricted = await principalFor("RESTRICTED", "WRITE_DESTRUCTIVE");

    const denied = await call(createParty, partyInput("[test] nope"), restricted);
    expect(denied.result.isError).toBe(true);
    expect(denied.text).toContain("role (RESTRICTED) is not allowed");

    const allowed = await call(
      createDraftInvoice,
      {
        projectId: project.id,
        issueDate: "2026-02-01",
        dueDate: "2026-02-15",
        items: [
          { description: "Work", isFlatAmount: false, quantity: "2", unitPrice: "50", amount: "", durationText: "" },
        ],
      },
      restricted,
    );
    expect(allowed.result.isError).toBeUndefined();
    createdInvoiceIds.push(allowed.data.invoice.id);
    expect(allowed.data.invoice.invoiceNumber).toBe("MP-01");
    expect(allowed.data.invoice.total).toBe("100");
  });

  it("refuses destructive calls without confirm: true, and scope WRITE cannot delete at all", async () => {
    const admin = await principalFor("ADMIN", "WRITE_DESTRUCTIVE");
    const { project } = await setupProject(admin);
    const draft = (
      await call(
        createDraftInvoice,
        {
          projectId: project.id,
          issueDate: "2026-02-01",
          dueDate: "2026-02-15",
          items: [{ description: "Work", isFlatAmount: true, quantity: "", unitPrice: "", amount: "10", durationText: "Fixed" }],
        },
        admin,
      )
    ).data.invoice;
    createdInvoiceIds.push(draft.id);

    const noConfirm = await call(deleteInvoice, { invoiceId: draft.id }, admin);
    expect(noConfirm.result.isError).toBe(true);
    expect(noConfirm.text).toContain("confirm: true");
    expect(await prisma.invoice.findUnique({ where: { id: draft.id } })).not.toBeNull();

    const writeOnly = await principalFor("ADMIN", "WRITE");
    const wrongScope = await call(deleteInvoice, { invoiceId: draft.id, confirm: true }, writeOnly);
    expect(wrongScope.result.isError).toBe(true);
    expect(wrongScope.text).toContain("needs WRITE_DESTRUCTIVE");

    const deleted = await call(deleteInvoice, { invoiceId: draft.id, confirm: true }, admin);
    expect(deleted.data).toEqual({ deleted: true, invoiceId: draft.id });
    createdInvoiceIds.length = 0;
  });

  it("surfaces service rules as readable tool errors: sent-invoice lock, transition matrix, send validation", async () => {
    const admin = await principalFor("ADMIN", "WRITE_DESTRUCTIVE");
    const { project } = await setupProject(admin);
    const draft = (
      await call(
        createDraftInvoice,
        {
          projectId: project.id,
          issueDate: "2026-02-01",
          dueDate: "2026-02-15",
          items: [{ description: "Work", isFlatAmount: true, quantity: "", unitPrice: "", amount: "10", durationText: "Fixed" }],
        },
        admin,
      )
    ).data.invoice;
    createdInvoiceIds.push(draft.id);

    const sent = await call(markInvoiceSent, { invoiceId: draft.id }, admin);
    expect(sent.data.invoice.status).toBe("SENT");

    const locked = await call(updateDraftInvoice, { invoiceId: draft.id, itemsNote: "late edit" }, admin);
    expect(locked.result.isError).toBe(true);
    expect(locked.text.toLowerCase()).toContain("draft");

    const again = await call(markInvoiceSent, { invoiceId: draft.id }, admin);
    expect(again.result.isError).toBe(true);

    const voided = await call(voidInvoice, { invoiceId: draft.id, confirm: true }, admin);
    expect(voided.data.invoice.status).toBe("VOID");

    const audit = await prisma.mcpAuditLog.findMany({
      where: { tokenId: admin.tokenId, tool: "update_draft_invoice" },
    });
    expect(audit[0]).toMatchObject({ outcome: "error", targetType: "invoice", targetId: draft.id });
  });

  it("merges partial updates onto the existing record", async () => {
    const admin = await principalFor("ADMIN", "WRITE");
    const { project, client } = await setupProject(admin);

    const updatedParty = await call(updateParty, { partyId: client.id, city: "Springfield" }, admin);
    expect(updatedParty.data.party).toMatchObject({ name: "[test] MCP Client", city: "Springfield" });

    const updatedProject = await call(
      updateProject,
      { projectId: project.id, invoiceNumberFormat: "{abbreviation}-{year}/{month:MMM}{number:month}" },
      admin,
    );
    expect(updatedProject.data.project.invoiceNumberFormat).toBe(
      "{abbreviation}-{year}/{month:MMM}{number:month}",
    );
    // The format change recorded the outgoing format as history (projectService rule).
    expect(updatedProject.data.project.previousInvoiceNumberFormats).toEqual(["{abbreviation}-{number}"]);
    expect(updatedProject.data.project.client.id).toBe(client.id);

    const detail = await call(getProject, { projectId: project.id }, admin);
    expect(detail.data.nextInvoice.suggestedNumber).toMatch(/^MP-\d{4}\/[A-Z]{3}01$/);
  });

  it("masks payment-method values on every read path", async () => {
    const admin = await principalFor("ADMIN", "WRITE");
    const { contractor, method } = await setupProject(admin);
    const listed = await call(listPaymentMethods, { partyId: contractor.id }, admin);
    const got = await call(getPaymentMethod, { paymentMethodId: method.id }, admin);
    for (const pm of [listed.data.paymentMethods[0], got.data.paymentMethod]) {
      const account = pm.fields.find((f: { key: string }) => f.key === "account");
      expect(account.value).toBe("••••9012");
      expect(JSON.stringify(pm)).not.toContain("123456789012");
    }
  });

  it("comments: add, list, delete rule; schedules: create + list with firing state; invoices: filters; pdf: binary resource", async () => {
    const admin = await principalFor("ADMIN", "WRITE_DESTRUCTIVE");
    const other = await principalFor("STANDARD", "WRITE");
    const { project } = await setupProject(admin);
    const draft = (
      await call(
        createDraftInvoice,
        {
          projectId: project.id,
          issueDate: "2026-02-01",
          dueDate: "2026-02-15",
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31",
          items: [{ description: "Work", isFlatAmount: true, quantity: "", unitPrice: "", amount: "10", durationText: "Fixed" }],
        },
        admin,
      )
    ).data.invoice;
    createdInvoiceIds.push(draft.id);

    const added = await call(addInvoiceComment, { invoiceId: draft.id, body: "client confirmed" }, other);
    expect(added.data.comment.body).toBe("client confirmed");
    const listedComments = await call(listInvoiceComments, { invoiceId: draft.id }, admin);
    expect(listedComments.data.comments).toHaveLength(1);

    const forbidden = await call(
      deleteInvoiceComment,
      { commentId: added.data.comment.id, confirm: true },
      await principalFor("STANDARD", "WRITE"),
    );
    expect(forbidden.result.isError).toBe(true);
    const byAdmin = await call(deleteInvoiceComment, { commentId: added.data.comment.id, confirm: true }, admin);
    expect(byAdmin.data.deleted).toBe(true);

    const schedule = await call(
      createAlertSchedule,
      { projectId: project.id, dayOfMonth: 7, recurring: true, label: "Send Invoice" },
      admin,
    );
    expect(schedule.data.schedule.dayOfMonth).toBe(7);
    const schedules = await call(listAlertSchedules, { projectId: project.id }, admin);
    expect(schedules.data.schedules).toHaveLength(1);
    expect(schedules.data.schedules[0]).toHaveProperty("isFired");

    const drafts = await call(listInvoices, { projectId: project.id, status: "DRAFT" }, admin);
    expect(drafts.data.invoices.map((i: { id: string }) => i.id)).toContain(draft.id);
    const paid = await call(listInvoices, { projectId: project.id, status: "PAID" }, admin);
    expect(paid.data.invoices).toHaveLength(0);

    const detail = await call(getInvoice, { invoiceId: draft.id }, admin);
    expect(detail.data.invoice.periodStart).toContain("2026-01-01");
    expect(JSON.stringify(detail.data)).not.toContain("paymentDetails");

    const pdf = await executeTool(getInvoicePdf, { invoiceId: draft.id }, { principal: admin });
    expect(pdf.isError).toBeUndefined();
    const resource = pdf.content[0];
    expect(resource.type).toBe("resource");
    if (resource.type === "resource" && "blob" in resource.resource) {
      expect(resource.resource.mimeType).toBe("application/pdf");
      expect(Buffer.from(resource.resource.blob, "base64").subarray(0, 4).toString()).toBe("%PDF");
    } else {
      throw new Error("expected an embedded blob resource");
    }
  });

  it("delete_party is blocked by the service while a project references it", async () => {
    const admin = await principalFor("ADMIN", "WRITE_DESTRUCTIVE");
    const { client } = await setupProject(admin);
    const blocked = await call(deleteParty, { partyId: client.id, confirm: true }, admin);
    expect(blocked.result.isError).toBe(true);
    expect(await prisma.party.findUnique({ where: { id: client.id } })).not.toBeNull();
  });
});
