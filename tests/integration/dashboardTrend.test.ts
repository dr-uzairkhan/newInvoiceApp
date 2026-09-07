// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { invoiceService } from "@/services/invoiceService";
import { projectService } from "@/services/projectService";
import { partyService } from "@/services/partyService";
import { paymentMethodService } from "@/services/paymentMethodService";
import { prisma } from "@/lib/prisma";
import { daysAgo } from "@/lib/dashboardTrend";
import type { InvoiceInput } from "@/lib/validation/invoice";
import type { ProjectInput } from "@/lib/validation/project";
import type { PartyInput } from "@/lib/validation/party";
import type { PaymentMethodInput } from "@/lib/validation/paymentMethod";

/**
 * M27 dashboard trend (Docs/ui_design_guide.md §16) — entered/exited window
 * math for the stat-card trends + the stale-drafts query. Same before/after
 * baseline approach as tests/integration/dashboardQueries.test.ts, since
 * these aggregates run over the whole table (real data included).
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
  const contractor = await createTestParty("[test] Trend Contractor");
  const client = await createTestParty("[test] Trend Client");
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

describe("projectService.getActiveProjectsTrend", () => {
  it("counts a freshly-created ACTIVE project as entered, and archiving one as exited", async () => {
    const before = await projectService.getActiveProjectsTrend();

    const { project } = await createTestProject({ status: "ACTIVE" });
    const afterCreate = await projectService.getActiveProjectsTrend();
    expect(afterCreate.delta).toBe(before.delta + 1);

    await projectService.update(project.id, {
      ...baseProjectInput({
        contractorId: project.contractorId,
        clientId: project.clientId,
        status: "ARCHIVED",
      }),
    });
    const afterArchive = await projectService.getActiveProjectsTrend();
    // Not back to `before.delta` — a documented artifact of the approximation
    // (src/lib/dashboardTrend.ts): "entered" only counts *currently* ACTIVE
    // projects, so archiving this one drops it out of "entered" entirely
    // while still adding one to "exited", netting -1 rather than 0 for a
    // create-then-archive round trip fully inside the trailing window.
    expect(afterArchive.delta).toBe(before.delta - 1);
  });
});

describe("invoiceService.listStaleDrafts", () => {
  it("includes a draft older than the stale threshold but not a fresh one", async () => {
    const { project } = await createTestProject();

    const fresh = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-FRESH" }),
    );
    createdInvoiceIds.push(fresh.id);

    const stale = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-STALE" }),
    );
    createdInvoiceIds.push(stale.id);
    await prisma.invoice.update({
      where: { id: stale.id },
      data: { createdAt: daysAgo(2) },
    });

    const staleIds = (await invoiceService.listStaleDrafts()).map((i) => i.id);
    expect(staleIds).toContain(stale.id);
    expect(staleIds).not.toContain(fresh.id);
  });
});

describe("invoiceService.getDraftInvoicesTrend", () => {
  it("counts a freshly-created draft as entered, and one sent as exited", async () => {
    const { project } = await createTestProject();
    const before = await invoiceService.getDraftInvoicesTrend();

    const draft = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-DT1" }),
    );
    createdInvoiceIds.push(draft.id);
    const afterCreate = await invoiceService.getDraftInvoicesTrend();
    expect(afterCreate.delta).toBe(before.delta + 1);

    await invoiceService.transitionStatus(draft.id, "SENT");
    const afterSend = await invoiceService.getDraftInvoicesTrend();
    // Not back to `before.delta` — same round-trip-within-the-window artifact
    // as getActiveProjectsTrend's test above: sending it drops it out of
    // "entered" (no longer DRAFT) while adding one to "exited", netting -1.
    expect(afterSend.delta).toBe(before.delta - 1);
  });
});

describe("invoiceService.getSentUnpaidTrend", () => {
  it("counts a freshly-sent invoice as entered, and one marked paid as exited", async () => {
    const { project } = await createTestProject();
    const before = await invoiceService.getSentUnpaidTrend();

    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-SU1" }),
    );
    createdInvoiceIds.push(invoice.id);
    await invoiceService.transitionStatus(invoice.id, "SENT");
    const afterSend = await invoiceService.getSentUnpaidTrend();
    expect(afterSend.delta).toBe(before.delta + 1);

    await invoiceService.transitionStatus(invoice.id, "PAID");
    const afterPaid = await invoiceService.getSentUnpaidTrend();
    // Same round-trip-within-the-window artifact as the two tests above.
    expect(afterPaid.delta).toBe(before.delta - 1);
  });
});

describe("invoiceService.getOverdueTrend", () => {
  it("counts a recently-due overdue invoice as entered, and one resolved after being overdue as exited", async () => {
    const { project } = await createTestProject();

    const before = await invoiceService.getOverdueTrend(
      await invoiceService.listOverdue(),
    );

    const overdue = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-OT1",
        issueDate: "2020-01-01",
        dueDate: daysAgo(5).toISOString().slice(0, 10),
      }),
    );
    createdInvoiceIds.push(overdue.id);
    await invoiceService.transitionStatus(overdue.id, "SENT");

    const afterEntered = await invoiceService.getOverdueTrend(
      await invoiceService.listOverdue(),
    );
    expect(afterEntered.delta).toBe(before.delta + 1);

    await invoiceService.transitionStatus(overdue.id, "PAID");
    const afterResolved = await invoiceService.getOverdueTrend(
      await invoiceService.listOverdue(),
    );
    // Same round-trip-within-the-window artifact as the tests above.
    expect(afterResolved.delta).toBe(before.delta - 1);
  });
});
