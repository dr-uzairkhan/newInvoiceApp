// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  invoiceCommentService,
  InvoiceCommentDeleteForbiddenError,
  InvoiceCommentNotFoundError,
} from "@/services/invoiceCommentService";
import { invoiceService, InvoiceNotFoundError } from "@/services/invoiceService";
import { projectService } from "@/services/projectService";
import { partyService } from "@/services/partyService";
import { paymentMethodService } from "@/services/paymentMethodService";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";

const createdPartyIds: string[] = [];
const createdProjectIds: string[] = [];
const createdInvoiceIds: string[] = [];
const createdUserIds: string[] = [];

async function createTestUser(role: Role) {
  const user = await prisma.user.create({
    data: {
      email: `test-comment-${role.toLowerCase()}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}@example.com`,
      name: `[test] ${role} user`,
      role,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function createTestInvoice() {
  const contractor = await partyService.create({
    name: "[test] Comment Contractor",
    type: "ORGANIZATION",
    email: "",
    street1: "",
    street2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
  });
  const client = await partyService.create({
    name: "[test] Comment Client",
    type: "ORGANIZATION",
    email: "",
    street1: "",
    street2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
  });
  createdPartyIds.push(contractor.id, client.id);
  const paymentMethod = await paymentMethodService.create(contractor.id, {
    type: "CUSTOM",
    label: "[test] Method",
    isDefault: true,
    fields: [{ key: "note", label: "Note", value: "n/a" }],
  });
  const project = await projectService.create({
    name: "[test] Comment Project",
    abbreviation: "TC",
    clientId: client.id,
    contractorId: contractor.id,
    preferredPaymentMethodId: paymentMethod.id,
    invoiceNumberFormat: "{abbreviation}-{number}",
    currencyMode: "SINGLE",
    displayCurrency: "USD",
    referralCreditEnabled: false,
    status: "ACTIVE",
  });
  createdProjectIds.push(project.id);
  const invoice = await invoiceService.createDraft(project.id, {
    invoiceNumber: "TC-01",
    issueDate: "2026-01-01",
    dueDate: "2026-01-15",
    items: [
      {
        description: "Work",
        isFlatAmount: false,
        quantity: "1",
        unitPrice: "100",
        amount: "",
        durationText: "",
      },
    ],
  });
  createdInvoiceIds.push(invoice.id);
  return invoice;
}

afterEach(async () => {
  if (createdInvoiceIds.length) {
    await prisma.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
    createdInvoiceIds.length = 0;
  }
  if (createdProjectIds.length) {
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    createdProjectIds.length = 0;
  }
  if (createdPartyIds.length) {
    await prisma.paymentMethod.deleteMany({
      where: { partyId: { in: createdPartyIds } },
    });
    await prisma.party.deleteMany({ where: { id: { in: createdPartyIds } } });
    createdPartyIds.length = 0;
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("invoiceCommentService", () => {
  it("adds comments in any status and lists them newest first with their author", async () => {
    const invoice = await createTestInvoice();
    const author = await createTestUser("STANDARD");

    await invoiceCommentService.add(invoice.id, { body: "First note" }, author.id);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "SENT" } });
    await invoiceCommentService.add(invoice.id, { body: "Client confirmed receipt" }, author.id);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
    await invoiceCommentService.add(invoice.id, { body: "Paid in full" }, null);

    const comments = await invoiceCommentService.listForInvoice(invoice.id);
    expect(comments.map((comment) => comment.body)).toEqual([
      "Paid in full",
      "Client confirmed receipt",
      "First note",
    ]);
    expect(comments[1].author?.id).toBe(author.id);
    expect(comments[0].author).toBeNull();
  });

  it("never touches the invoice row itself — updatedAt stays put", async () => {
    const invoice = await createTestInvoice();
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    await invoiceCommentService.add(invoice.id, { body: "A note" }, null);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it("rejects a comment on an invoice that doesn't exist", async () => {
    await expect(
      invoiceCommentService.add("does-not-exist", { body: "x" }, null),
    ).rejects.toBeInstanceOf(InvoiceNotFoundError);
  });

  it("lets the author or an ADMIN delete, and nobody else", async () => {
    const invoice = await createTestInvoice();
    const author = await createTestUser("STANDARD");
    const other = await createTestUser("STANDARD");
    const admin = await createTestUser("ADMIN");

    const mine = await invoiceCommentService.add(invoice.id, { body: "mine" }, author.id);
    const alsoMine = await invoiceCommentService.add(invoice.id, { body: "also mine" }, author.id);

    await expect(
      invoiceCommentService.remove(mine.id, { userId: other.id, role: "STANDARD" }),
    ).rejects.toBeInstanceOf(InvoiceCommentDeleteForbiddenError);

    await invoiceCommentService.remove(mine.id, { userId: author.id, role: "STANDARD" });
    await invoiceCommentService.remove(alsoMine.id, { userId: admin.id, role: "ADMIN" });
    expect(await invoiceCommentService.listForInvoice(invoice.id)).toHaveLength(0);

    await expect(
      invoiceCommentService.remove(mine.id, { userId: author.id, role: "STANDARD" }),
    ).rejects.toBeInstanceOf(InvoiceCommentNotFoundError);
  });

  it("canDelete mirrors the service rule for the UI", () => {
    const comment = { authorUserId: "u1" };
    expect(invoiceCommentService.canDelete(comment, { userId: "u1", role: "RESTRICTED" })).toBe(true);
    expect(invoiceCommentService.canDelete(comment, { userId: "u2", role: "STANDARD" })).toBe(false);
    expect(invoiceCommentService.canDelete(comment, { userId: "u2", role: "ADMIN" })).toBe(true);
    expect(invoiceCommentService.canDelete(comment, null)).toBe(false);
    expect(invoiceCommentService.canDelete({ authorUserId: null }, { userId: "u1", role: "STANDARD" })).toBe(false);
  });

  it("summarises count and newest body per invoice, skipping invoices with no comments", async () => {
    const invoice = await createTestInvoice();
    await invoiceCommentService.add(invoice.id, { body: "older" }, null);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await invoiceCommentService.add(invoice.id, { body: "newest" }, null);

    const summaries = await invoiceCommentService.summarizeByInvoiceIds([invoice.id, "no-such-invoice"]);
    expect(summaries.get(invoice.id)).toMatchObject({ count: 2, latestBody: "newest" });
    expect(summaries.has("no-such-invoice")).toBe(false);
    expect((await invoiceCommentService.summarizeByInvoiceIds([])).size).toBe(0);
  });

  it("is deleted along with its invoice", async () => {
    const invoice = await createTestInvoice();
    const comment = await invoiceCommentService.add(invoice.id, { body: "bye" }, null);
    await invoiceService.delete(invoice.id);
    createdInvoiceIds.length = 0;
    expect(await prisma.invoiceComment.findUnique({ where: { id: comment.id } })).toBeNull();
  });
});
