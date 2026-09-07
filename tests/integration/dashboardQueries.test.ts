// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { invoiceService } from "@/services/invoiceService";
import { projectService } from "@/services/projectService";
import { partyService } from "@/services/partyService";
import { paymentMethodService } from "@/services/paymentMethodService";
import { prisma } from "@/lib/prisma";
import type { InvoiceInput } from "@/lib/validation/invoice";
import type { ProjectInput } from "@/lib/validation/project";
import type { PartyInput } from "@/lib/validation/party";
import type { PaymentMethodInput } from "@/lib/validation/paymentMethod";

/**
 * M10 — countByStatus/sumSubtotalByStatus exclude
 * VOID correctly, findOverdueCandidates returns only SENT + past-due, and
 * findMissingPreferredPaymentMethod returns the correct (ACTIVE-only) set.
 * These aggregates run over the whole table (seed data included), so every
 * assertion compares against a captured "before" baseline rather than an
 * absolute count/sum — the same approach a real dashboard load would need to
 * be robust against pre-existing rows.
 */

const createdPartyIds: string[] = [];
const createdProjectIds: string[] = [];
const createdInvoiceIds: string[] = [];

function basePartyInput(overrides: Partial<PartyInput> = {}): PartyInput {
  return {
    name: "[test] Party",
    email: "",
    type: "ORGANIZATION",
    street1: "",
    street2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    ...overrides,
  };
}

async function createTestParty(name: string) {
  const party = await partyService.create(basePartyInput({ name }));
  createdPartyIds.push(party.id);
  return party;
}

function basePaymentMethodInput(
  overrides: Partial<PaymentMethodInput> = {},
): PaymentMethodInput {
  return {
    type: "BANK_WIRE",
    label: "Test Account",
    isDefault: false,
    fields: [{ key: "bank_name", label: "Bank Name", value: "Test Bank" }],
    ...overrides,
  };
}

function baseProjectInput(overrides: Partial<ProjectInput>): ProjectInput {
  return {
    name: "[test] Project",
    abbreviation: "TP",
    clientId: "",
    contractorId: "",
    preferredPaymentMethodId: "",
    invoiceNumberFormat: "{abbreviation}-{number}",
    currencyMode: "SINGLE",
    displayCurrency: "USD",
    referralCreditEnabled: false,
    status: "ACTIVE",
    ...overrides,
  };
}

async function createTestProject(overrides: Partial<ProjectInput> = {}) {
  const contractor = await createTestParty("[test] Contractor");
  const client = await createTestParty("[test] Client");
  const paymentMethod = await paymentMethodService.create(
    contractor.id,
    basePaymentMethodInput(),
  );

  const project = await projectService.create(
    baseProjectInput({
      contractorId: contractor.id,
      clientId: client.id,
      preferredPaymentMethodId: paymentMethod.id,
      ...overrides,
    }),
  );
  createdProjectIds.push(project.id);

  return { project, contractor, client, paymentMethod };
}

function baseInvoiceInput(overrides: Partial<InvoiceInput> = {}): InvoiceInput {
  return {
    invoiceNumber: "TP-01",
    issueDate: "2026-01-01",
    dueDate: "2026-01-15",
    convertedTotal: "",
    items: [
      {
        description: "Consulting",
        quantity: "2",
        unitPrice: "150.00",
        isFlatAmount: false,
        amount: "",
        durationText: "",
      },
    ],
    ...overrides,
  };
}

afterEach(async () => {
  if (createdInvoiceIds.length) {
    await prisma.invoice.deleteMany({
      where: { id: { in: createdInvoiceIds.splice(0) } },
    });
  }
  if (createdProjectIds.length) {
    await prisma.project.deleteMany({
      where: { id: { in: createdProjectIds.splice(0) } },
    });
  }
  if (createdPartyIds.length) {
    await prisma.party.deleteMany({
      where: { id: { in: createdPartyIds.splice(0) } },
    });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("invoiceService dashboard aggregates", () => {
  it("countByStatus tracks only invoices currently in that status", async () => {
    const { project } = await createTestProject();
    const draftBefore = await invoiceService.countByStatus("DRAFT");
    const voidBefore = await invoiceService.countByStatus("VOID");

    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);
    await expect(invoiceService.countByStatus("DRAFT")).resolves.toBe(
      draftBefore + 1,
    );

    await invoiceService.transitionStatus(invoice.id, "VOID");
    await expect(invoiceService.countByStatus("DRAFT")).resolves.toBe(
      draftBefore,
    );
    await expect(invoiceService.countByStatus("VOID")).resolves.toBe(
      voidBefore + 1,
    );
  });

  it("sumSubtotalByStatus sums only matching-status invoices, excluding VOID", async () => {
    const { project } = await createTestProject();
    const sentBefore = await invoiceService.sumSubtotalByStatus("SENT");

    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        items: [
          {
            description: "Consulting",
            quantity: "1",
            unitPrice: "250",
            isFlatAmount: false,
            amount: "",
            durationText: "",
          },
        ],
      }),
    );
    createdInvoiceIds.push(invoice.id);
    await invoiceService.transitionStatus(invoice.id, "SENT");

    const sentAfterSend = await invoiceService.sumSubtotalByStatus("SENT");
    expect(sentAfterSend.minus(sentBefore).toString()).toBe("250");

    await invoiceService.transitionStatus(invoice.id, "VOID");
    const sentAfterVoid = await invoiceService.sumSubtotalByStatus("SENT");
    expect(sentAfterVoid.toString()).toBe(sentBefore.toString());
  });

  it("listOverdue returns only SENT invoices with a past-due date", async () => {
    const { project } = await createTestProject();

    const overdue = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-OD1",
        issueDate: "2020-01-01",
        dueDate: "2020-01-15",
      }),
    );
    createdInvoiceIds.push(overdue.id);
    await invoiceService.transitionStatus(overdue.id, "SENT");

    const pastDueDraft = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-OD2",
        issueDate: "2020-01-01",
        dueDate: "2020-01-15",
      }),
    );
    createdInvoiceIds.push(pastDueDraft.id);

    const pastDuePaid = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-OD3",
        issueDate: "2020-01-01",
        dueDate: "2020-01-15",
      }),
    );
    createdInvoiceIds.push(pastDuePaid.id);
    await invoiceService.transitionStatus(pastDuePaid.id, "SENT");
    await invoiceService.transitionStatus(pastDuePaid.id, "PAID");

    const futureDue = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-OD4",
        issueDate: "2099-01-01",
        dueDate: "2099-01-15",
      }),
    );
    createdInvoiceIds.push(futureDue.id);
    await invoiceService.transitionStatus(futureDue.id, "SENT");

    const overdueIds = (await invoiceService.listOverdue()).map((i) => i.id);

    expect(overdueIds).toContain(overdue.id);
    expect(overdueIds).not.toContain(pastDueDraft.id);
    expect(overdueIds).not.toContain(pastDuePaid.id);
    expect(overdueIds).not.toContain(futureDue.id);
  });

  it("listDueSoon returns only SENT invoices due soon, not overdue or already-paid", async () => {
    const { project } = await createTestProject();
    const soonDate = new Date();
    soonDate.setDate(soonDate.getDate() + 3);
    const soonDateStr = soonDate.toISOString().slice(0, 10);

    const dueSoon = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-DS1",
        issueDate: "2020-01-01",
        dueDate: soonDateStr,
      }),
    );
    createdInvoiceIds.push(dueSoon.id);
    await invoiceService.transitionStatus(dueSoon.id, "SENT");

    const overdue = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-DS2",
        issueDate: "2020-01-01",
        dueDate: "2020-01-15",
      }),
    );
    createdInvoiceIds.push(overdue.id);
    await invoiceService.transitionStatus(overdue.id, "SENT");

    const farOut = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-DS3",
        issueDate: "2020-01-01",
        dueDate: "2099-01-15",
      }),
    );
    createdInvoiceIds.push(farOut.id);
    await invoiceService.transitionStatus(farOut.id, "SENT");

    const dueSoonIds = (await invoiceService.listDueSoon()).map((i) => i.id);
    expect(dueSoonIds).toContain(dueSoon.id);
    expect(dueSoonIds).not.toContain(overdue.id);
    expect(dueSoonIds).not.toContain(farOut.id);
  });

  it("listPaidThisMonth includes a freshly-paid invoice but not a still-SENT one", async () => {
    const { project } = await createTestProject();

    const paid = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-PM1" }),
    );
    createdInvoiceIds.push(paid.id);
    await invoiceService.transitionStatus(paid.id, "SENT");
    await invoiceService.transitionStatus(paid.id, "PAID");

    const stillSent = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-PM2" }),
    );
    createdInvoiceIds.push(stillSent.id);
    await invoiceService.transitionStatus(stillSent.id, "SENT");

    const paidIds = (await invoiceService.listPaidThisMonth()).map((i) => i.id);
    expect(paidIds).toContain(paid.id);
    expect(paidIds).not.toContain(stillSent.id);
  });

  it("listRecentActivity includes SENT/PAID/VOID invoices but never DRAFT", async () => {
    const { project } = await createTestProject();
    const draft = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-RA1" }),
    );
    createdInvoiceIds.push(draft.id);

    const sent = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-RA2" }),
    );
    createdInvoiceIds.push(sent.id);
    await invoiceService.transitionStatus(sent.id, "SENT");

    const recentIds = (await invoiceService.listRecentActivity(50)).map(
      (i) => i.id,
    );
    expect(recentIds).toContain(sent.id);
    expect(recentIds).not.toContain(draft.id);
  });
});

describe("projectService dashboard aggregates", () => {
  it("countActive counts only ACTIVE projects, not ARCHIVED", async () => {
    const contractor = await createTestParty("[test] Active Count Contractor");
    const client = await createTestParty("[test] Active Count Client");
    const before = await projectService.countActive();

    const active = await projectService.create(
      baseProjectInput({
        name: "[test] Active Proj",
        contractorId: contractor.id,
        clientId: client.id,
        status: "ACTIVE",
      }),
    );
    createdProjectIds.push(active.id);
    await expect(projectService.countActive()).resolves.toBe(before + 1);

    const archived = await projectService.create(
      baseProjectInput({
        name: "[test] Archived Proj",
        contractorId: contractor.id,
        clientId: client.id,
        status: "ARCHIVED",
      }),
    );
    createdProjectIds.push(archived.id);
    await expect(projectService.countActive()).resolves.toBe(before + 1);
  });

  it("listMissingPreferredPaymentMethod returns only ACTIVE projects with none set", async () => {
    const contractor = await createTestParty("[test] Missing PPM Contractor");
    const client = await createTestParty("[test] Missing PPM Client");
    const method = await paymentMethodService.create(
      contractor.id,
      basePaymentMethodInput(),
    );

    const missing = await projectService.create(
      baseProjectInput({
        name: "[test] Missing PPM Active",
        contractorId: contractor.id,
        clientId: client.id,
        preferredPaymentMethodId: "",
        status: "ACTIVE",
      }),
    );
    createdProjectIds.push(missing.id);

    const hasMethod = await projectService.create(
      baseProjectInput({
        name: "[test] Has PPM Active",
        contractorId: contractor.id,
        clientId: client.id,
        preferredPaymentMethodId: method.id,
        status: "ACTIVE",
      }),
    );
    createdProjectIds.push(hasMethod.id);

    const missingArchived = await projectService.create(
      baseProjectInput({
        name: "[test] Missing PPM Archived",
        contractorId: contractor.id,
        clientId: client.id,
        preferredPaymentMethodId: "",
        status: "ARCHIVED",
      }),
    );
    createdProjectIds.push(missingArchived.id);

    const ids = (await projectService.listMissingPreferredPaymentMethod()).map(
      (p) => p.id,
    );
    expect(ids).toContain(missing.id);
    expect(ids).not.toContain(hasMethod.id);
    expect(ids).not.toContain(missingArchived.id);
  });
});
