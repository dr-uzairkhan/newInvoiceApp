// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  invoiceService,
  InvoiceNotDraftError,
  DuplicateInvoiceNumberError,
  InvalidTransitionError,
  InvoiceSendValidationError,
  InvoiceNotFoundError,
} from "@/services/invoiceService";
import { projectService } from "@/services/projectService";
import { partyService } from "@/services/partyService";
import { paymentMethodService } from "@/services/paymentMethodService";
import { prisma } from "@/lib/prisma";
import type { InvoiceInput } from "@/lib/validation/invoice";
import type { ProjectInput } from "@/lib/validation/project";
import type { PartyInput } from "@/lib/validation/party";
import type { PaymentMethodInput } from "@/lib/validation/paymentMethod";

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

async function createTestParty(overrides: Partial<PartyInput> = {}) {
  const party = await partyService.create(basePartyInput(overrides));
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
  const contractor = await createTestParty({ name: "[test] Contractor" });
  const client = await createTestParty({ name: "[test] Client" });
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
    itemsNote: "",
    bottomNote: "",
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

function flatItem(description: string, amount: string, durationText = "Fixed") {
  return {
    description,
    isFlatAmount: true as const,
    quantity: "",
    unitPrice: "",
    amount,
    durationText,
  };
}

function hourlyItem(description: string, quantity: string, unitPrice: string) {
  return {
    description,
    isFlatAmount: false as const,
    quantity,
    unitPrice,
    amount: "",
    durationText: "",
  };
}

/** M35 — `amount` is the positive magnitude the client submits; negated server-side. */
function referralCreditItem(description: string, amount: string) {
  return {
    description,
    isFlatAmount: true as const,
    isReferralCredit: true as const,
    quantity: "",
    unitPrice: "",
    amount,
    durationText: "",
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

describe("invoiceService.createDraft", () => {
  it("computes line amount, subtotal, and total from quantity × unitPrice", async () => {
    const { project } = await createTestProject();

    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        items: [
          {
            description: "Design",
            quantity: "3",
            unitPrice: "100.00",
            isFlatAmount: false,
            amount: "",
            durationText: "",
          },
          {
            description: "Development",
            quantity: "10",
            unitPrice: "50.50",
            isFlatAmount: false,
            amount: "",
            durationText: "",
          },
        ],
      }),
    );
    createdInvoiceIds.push(invoice.id);

    expect(invoice.subtotal.toString()).toBe("805");
    expect(invoice.total.toString()).toBe("805");
  });

  it("ignores any client-submitted amount/subtotal/total and always recomputes them", async () => {
    const { project } = await createTestProject();

    // A tampered payload that includes fields the real InvoiceInput type
    // doesn't even expose — simulating a client that bypassed the form and
    // hit the service/action directly with extra bogus values.
    const tamperedInput = {
      ...baseInvoiceInput({
        items: [
          {
            description: "Consulting",
            quantity: "1",
            unitPrice: "10",
            isFlatAmount: false,
            amount: "",
            durationText: "",
          },
        ],
      }),
      subtotal: "999999.99",
      total: "999999.99",
    } as InvoiceInput & { subtotal: string; total: string };
    (tamperedInput.items[0] as unknown as { amount: string }).amount =
      "999999.99";

    const invoice = await invoiceService.createDraft(project.id, tamperedInput);
    createdInvoiceIds.push(invoice.id);

    expect(invoice.subtotal.toString()).toBe("10");
    expect(invoice.total.toString()).toBe("10");
  });

  it("always sets total equal to subtotal — no tax anywhere", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);

    expect(invoice.total.toString()).toBe(invoice.subtotal.toString());
  });

  it("snapshots the contractor, client, and preferred payment method's live fields", async () => {
    const { project, contractor, client, paymentMethod } =
      await createTestProject();

    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);

    expect(invoice.fromPartySnapshot).toMatchObject({ name: contractor.name });
    expect(invoice.toPartySnapshot).toMatchObject({ name: client.name });

    // M17.5 — buildSnapshots copies the raw
    // PaymentMethod row (ciphertext), not paymentMethodService's decrypted
    // return value, so the snapshot matches the *stored* row exactly.
    const rawPaymentMethod = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });
    expect(invoice.paymentDetailsSnapshot).toEqual(rawPaymentMethod.fields);

    const snapshotFields = invoice.paymentDetailsSnapshot as unknown as {
      value: string;
    }[];
    const decryptedFields = paymentMethod.fields as unknown as {
      value: string;
    }[];
    expect(snapshotFields[0].value).not.toBe(decryptedFields[0].value);
  });

  it("persists convertedTotal only when the project's DisplayCurrency isn't USD", async () => {
    const { project: usdProject } = await createTestProject();
    const usdInvoice = await invoiceService.createDraft(
      usdProject.id,
      baseInvoiceInput({ convertedTotal: "500" }),
    );
    createdInvoiceIds.push(usdInvoice.id);
    expect(usdInvoice.convertedTotal).toBeNull();
    expect(usdInvoice.convertedCurrency).toBeNull();

    const { project: audProject } = await createTestProject({
      currencyMode: "DUAL",
      displayCurrency: "AUD",
    });
    const audInvoice = await invoiceService.createDraft(
      audProject.id,
      baseInvoiceInput({ invoiceNumber: "TP-02", convertedTotal: "750.50" }),
    );
    createdInvoiceIds.push(audInvoice.id);
    expect(audInvoice.convertedTotal?.toString()).toBe("750.5");
    expect(audInvoice.convertedCurrency).toBe("AUD");
  });

  it("rejects a duplicate invoice number within the same project with a friendly error", async () => {
    const { project } = await createTestProject();
    const first = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-DUP" }),
    );
    createdInvoiceIds.push(first.id);

    await expect(
      invoiceService.createDraft(
        project.id,
        baseInvoiceInput({ invoiceNumber: "TP-DUP" }),
      ),
    ).rejects.toBeInstanceOf(DuplicateInvoiceNumberError);
  });
});

describe("invoiceService.createDraft — Flat-amount items and notes (M14)", () => {
  it("computes an Hourly item's amount from quantity × unitPrice, and trusts a Flat item's amount directly", async () => {
    const { project } = await createTestProject();

    const created = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        items: [
          hourlyItem("Hourly work", "2", "100"),
          flatItem("Retainer", "500"),
        ],
      }),
    );
    createdInvoiceIds.push(created.id);
    const invoice = (await invoiceService.getById(created.id))!;

    expect(invoice.items).toHaveLength(2);
    const hourly = invoice.items.find((i) => i.description === "Hourly work")!;
    const flat = invoice.items.find((i) => i.description === "Retainer")!;

    expect(hourly.isFlatAmount).toBe(false);
    expect(hourly.quantity?.toString()).toBe("2");
    expect(hourly.unitPrice?.toString()).toBe("100");
    expect(hourly.amount.toString()).toBe("200");

    expect(flat.isFlatAmount).toBe(true);
    expect(flat.quantity).toBeNull();
    expect(flat.unitPrice).toBeNull();
    expect(flat.amount.toString()).toBe("500");

    expect(invoice.subtotal.toString()).toBe("700");
  });

  it("ignores any client-submitted amount for an Hourly item — still computed from quantity × unitPrice", async () => {
    const { project } = await createTestProject();

    const tamperedItem = {
      ...hourlyItem("Consulting", "1", "10"),
      amount: "999999.99",
    };
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ items: [tamperedItem] }),
    );
    createdInvoiceIds.push(invoice.id);

    expect(invoice.subtotal.toString()).toBe("10");
  });

  it("persists itemsNote and bottomNote independently — either, both, or neither may be blank", async () => {
    const { project } = await createTestProject();

    const bothBlank = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-N1" }),
    );
    createdInvoiceIds.push(bothBlank.id);
    expect(bothBlank.itemsNote).toBeNull();
    expect(bothBlank.bottomNote).toBeNull();

    const onlyItemsNote = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-N2",
        itemsNote: "Work done Jun 1 - Jun 30",
      }),
    );
    createdInvoiceIds.push(onlyItemsNote.id);
    expect(onlyItemsNote.itemsNote).toBe("Work done Jun 1 - Jun 30");
    expect(onlyItemsNote.bottomNote).toBeNull();

    const both = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-N3",
        itemsNote: "Work done Jun 1 - Jun 30",
        bottomNote: "Includes arrears from May",
      }),
    );
    createdInvoiceIds.push(both.id);
    expect(both.itemsNote).toBe("Work done Jun 1 - Jun 30");
    expect(both.bottomNote).toBe("Includes arrears from May");
  });
});

describe("invoiceService.createDraft — Referral Credit items (M35)", () => {
  it("negates the user-submitted positive magnitude and forces the null-qty/unitPrice, Flat-shaped storage", async () => {
    const { project } = await createTestProject();

    const created = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        items: [
          hourlyItem("Consulting", "2", "150"),
          referralCreditItem("Referral Credit (Thank you!)", "150"),
        ],
      }),
    );
    createdInvoiceIds.push(created.id);
    const invoice = (await invoiceService.getById(created.id))!;

    const credit = invoice.items.find((i) => i.isReferralCredit)!;
    expect(credit.isFlatAmount).toBe(true);
    expect(credit.quantity).toBeNull();
    expect(credit.unitPrice).toBeNull();
    expect(credit.amount.toString()).toBe("-150");

    // sumAmounts just adds every item's amount — subtotal/total absorb the
    // deduction with no separate adjustment concept.
    expect(invoice.subtotal.toString()).toBe("150");
    expect(invoice.total.toString()).toBe("150");
  });

  it("allows a zero-amount referral credit at draft-save time", async () => {
    const { project } = await createTestProject();

    const created = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        items: [referralCreditItem("Referral Credit (Thank you!)", "0")],
      }),
    );
    createdInvoiceIds.push(created.id);
    const invoice = (await invoiceService.getById(created.id))!;

    expect(invoice.items[0].amount.toString()).toBe("0");
  });
});

describe("invoiceService.validateForSend — Referral Credit (M35)", () => {
  it("blocks sending when the referral-credit item's amount is still zero", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        items: [
          hourlyItem("Consulting", "1", "100"),
          referralCreditItem("Referral Credit (Thank you!)", "0"),
        ],
      }),
    );
    createdInvoiceIds.push(invoice.id);

    await expect(invoiceService.validateForSend(invoice.id)).rejects.toThrow(
      InvoiceSendValidationError,
    );
  });

  it("allows sending once the referral-credit amount is nonzero", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-RC-01",
        items: [
          hourlyItem("Consulting", "1", "100"),
          referralCreditItem("Referral Credit (Thank you!)", "25"),
        ],
      }),
    );
    createdInvoiceIds.push(invoice.id);

    await expect(
      invoiceService.validateForSend(invoice.id),
    ).resolves.not.toThrow();
  });
});

describe("invoiceService.updateDraft — Flat-amount items and notes (M14)", () => {
  it("round-trips itemsNote/bottomNote and a mode change through updateDraft while DRAFT", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        items: [hourlyItem("Consulting", "1", "100")],
      }),
    );
    createdInvoiceIds.push(invoice.id);

    const updated = await invoiceService.updateDraft(
      invoice.id,
      baseInvoiceInput({
        itemsNote: "Updated items note",
        bottomNote: "Updated bottom note",
        items: [flatItem("Consulting (flat this time)", "250")],
      }),
    );

    expect(updated.itemsNote).toBe("Updated items note");
    expect(updated.bottomNote).toBe("Updated bottom note");
    expect(updated.subtotal.toString()).toBe("250");

    const reFetched = await invoiceService.getById(invoice.id);
    expect(reFetched?.items).toHaveLength(1);
    expect(reFetched?.items[0]?.isFlatAmount).toBe(true);
    expect(reFetched?.items[0]?.quantity).toBeNull();
  });

  it("is ordinary DRAFT-editable/locked-once-SENT content — itemsNote/bottomNote can't change via updateDraft once SENT", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ itemsNote: "Original note" }),
    );
    createdInvoiceIds.push(invoice.id);
    await invoiceService.transitionStatus(invoice.id, "SENT");

    await expect(
      invoiceService.updateDraft(
        invoice.id,
        baseInvoiceInput({ itemsNote: "Attempted change after send" }),
      ),
    ).rejects.toBeInstanceOf(InvoiceNotDraftError);

    const stillSent = await invoiceService.getById(invoice.id);
    expect(stillSent?.itemsNote).toBe("Original note");
  });
});

describe("invoiceService.updateDraft", () => {
  it("recomputes the snapshot from current live data on every save (Story 6.1)", async () => {
    const { project, contractor } = await createTestProject();

    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);
    expect(invoice.fromPartySnapshot).toMatchObject({
      email: null,
    });

    await partyService.update(contractor.id, {
      ...basePartyInput({ name: contractor.name }),
      email: "updated@test.example",
    });

    const updated = await invoiceService.updateDraft(
      invoice.id,
      baseInvoiceInput(),
    );

    expect(updated.fromPartySnapshot).toMatchObject({
      email: "updated@test.example",
    });
  });

  it("recalculates totals after a line item change", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        items: [
          {
            description: "Consulting",
            quantity: "1",
            unitPrice: "100",
            isFlatAmount: false,
            amount: "",
            durationText: "",
          },
        ],
      }),
    );
    createdInvoiceIds.push(invoice.id);
    expect(invoice.subtotal.toString()).toBe("100");

    const updated = await invoiceService.updateDraft(
      invoice.id,
      baseInvoiceInput({
        items: [
          {
            description: "Consulting",
            quantity: "1",
            unitPrice: "100",
            isFlatAmount: false,
            amount: "",
            durationText: "",
          },
          {
            description: "Extra",
            quantity: "2",
            unitPrice: "25",
            isFlatAmount: false,
            amount: "",
            durationText: "",
          },
        ],
      }),
    );

    expect(updated.subtotal.toString()).toBe("150");
  });

  it("throws InvoiceNotDraftError when the invoice is no longer DRAFT", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);

    // M6 owns the real transitionStatus — flip status directly here to
    // simulate a SENT invoice for this M5-scoped guard test.
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "SENT" },
    });

    await expect(
      invoiceService.updateDraft(invoice.id, baseInvoiceInput()),
    ).rejects.toBeInstanceOf(InvoiceNotDraftError);
  });
});

describe("invoiceService.previewNextInvoiceNumber", () => {
  it("computes the next sequence number for a fresh project", async () => {
    const { project } = await createTestProject();
    const preview = await invoiceService.previewNextInvoiceNumber(project.id);
    expect(preview.suggested).toBe("TP-01");
    expect(preview.conflictingLastInvoiceNumber).toBeNull();
  });

  it("advances past existing invoice numbers, skipping any gap left by a deletion", async () => {
    const { project } = await createTestProject();
    const first = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-01" }),
    );
    const second = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-05" }),
    );
    createdInvoiceIds.push(first.id, second.id);

    const preview = await invoiceService.previewNextInvoiceNumber(project.id);
    expect(preview.suggested).toBe("TP-06");
    expect(preview.conflictingLastInvoiceNumber).toBeNull();
  });

  it("flags a conflict when the last SENT invoice's number doesn't fit the project's current format", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "LEGACY-2026-INV" }),
    );
    createdInvoiceIds.push(invoice.id);
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "SENT" },
    });

    const preview = await invoiceService.previewNextInvoiceNumber(project.id);
    // Restarts at 01 since "LEGACY-2026-INV" doesn't structurally match
    // "{abbreviation}-{number}" — nothing to extract a sequence from.
    expect(preview.suggested).toBe("TP-01");
    expect(preview.conflictingLastInvoiceNumber).toBe("LEGACY-2026-INV");
  });

  it("does not flag a conflict when the last SENT invoice's number fits the current format", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-03" }),
    );
    createdInvoiceIds.push(invoice.id);
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "SENT" },
    });

    const preview = await invoiceService.previewNextInvoiceNumber(project.id);
    expect(preview.suggested).toBe("TP-04");
    expect(preview.conflictingLastInvoiceNumber).toBeNull();
  });

  it("does not flag a conflict off of a mismatched DRAFT invoice — only SENT/PAID count", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "LEGACY-2026-INV" }),
    );
    createdInvoiceIds.push(invoice.id);

    const preview = await invoiceService.previewNextInvoiceNumber(project.id);
    expect(preview.conflictingLastInvoiceNumber).toBeNull();
  });
});

describe("invoiceService.createDraft/updateDraft — billing period (M39)", () => {
  it("persists periodStart/periodEnd when both are provided", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ periodStart: "2026-01-01", periodEnd: "2026-01-31" }),
    );
    createdInvoiceIds.push(invoice.id);

    expect(invoice.periodStart?.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(invoice.periodEnd?.toISOString().slice(0, 10)).toBe("2026-01-31");
  });

  it("stores null when period fields are left blank", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);

    expect(invoice.periodStart).toBeNull();
    expect(invoice.periodEnd).toBeNull();
  });

  it("updates periodStart/periodEnd on a DRAFT save", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ periodStart: "2026-01-01", periodEnd: "2026-01-31" }),
    );
    createdInvoiceIds.push(invoice.id);

    const updated = await invoiceService.updateDraft(
      invoice.id,
      baseInvoiceInput({ periodStart: "2026-02-01", periodEnd: "2026-02-28" }),
    );

    expect(updated.periodStart?.toISOString().slice(0, 10)).toBe("2026-02-01");
    expect(updated.periodEnd?.toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});

describe("invoiceService.previewNextPeriodStart (M39)", () => {
  it("returns null for a project with no prior invoice", async () => {
    const { project } = await createTestProject();
    const preview = await invoiceService.previewNextPeriodStart(project.id);
    expect(preview).toBeNull();
  });

  it("returns null when the project's last SENT/PAID invoice never had a period set", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);
    await invoiceService.transitionStatus(invoice.id, "SENT");

    const preview = await invoiceService.previewNextPeriodStart(project.id);
    expect(preview).toBeNull();
  });

  it("returns the day after the last SENT invoice's periodEnd", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ periodStart: "2026-01-01", periodEnd: "2026-01-31" }),
    );
    createdInvoiceIds.push(invoice.id);
    await invoiceService.transitionStatus(invoice.id, "SENT");

    const preview = await invoiceService.previewNextPeriodStart(project.id);
    expect(preview).toBe("2026-02-01");
  });

  it("still chains off a PAID invoice's period", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ periodStart: "2026-01-01", periodEnd: "2026-01-31" }),
    );
    createdInvoiceIds.push(invoice.id);
    await invoiceService.transitionStatus(invoice.id, "SENT");
    await invoiceService.transitionStatus(invoice.id, "PAID");

    const preview = await invoiceService.previewNextPeriodStart(project.id);
    expect(preview).toBe("2026-02-01");
  });

  it("ignores a DRAFT invoice's period even if it's the most recent one", async () => {
    const { project } = await createTestProject();
    const sent = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-01",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
      }),
    );
    createdInvoiceIds.push(sent.id);
    await invoiceService.transitionStatus(sent.id, "SENT");

    const draft = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-02",
        issueDate: "2026-02-05",
        periodStart: "2026-02-01",
        periodEnd: "2026-02-15",
      }),
    );
    createdInvoiceIds.push(draft.id);

    const preview = await invoiceService.previewNextPeriodStart(project.id);
    expect(preview).toBe("2026-02-01");
  });
});

describe("invoiceService.listByProject", () => {
  it("returns only invoices belonging to the given project", async () => {
    const { project: projectA } = await createTestProject();
    const { project: projectB } = await createTestProject();

    const a1 = await invoiceService.createDraft(
      projectA.id,
      baseInvoiceInput({ invoiceNumber: "TP-01" }),
    );
    const a2 = await invoiceService.createDraft(
      projectA.id,
      baseInvoiceInput({ invoiceNumber: "TP-02" }),
    );
    const b1 = await invoiceService.createDraft(
      projectB.id,
      baseInvoiceInput({ invoiceNumber: "TP-01" }),
    );
    createdInvoiceIds.push(a1.id, a2.id, b1.id);

    const result = await invoiceService.listByProject(projectA.id);

    expect(result.map((invoice) => invoice.id).sort()).toEqual(
      [a1.id, a2.id].sort(),
    );
  });

  it("returns an empty array for a project with no invoices", async () => {
    const { project } = await createTestProject();
    const result = await invoiceService.listByProject(project.id);
    expect(result).toEqual([]);
  });

  it("M44: defaults to descending invoice-number order, independent of creation order", async () => {
    const { project } = await createTestProject();

    // Created out of number order — TP-05 first, TP-01 second — matching
    // the real bug this milestone fixes (a backfilled/ingested invoice
    // whose row-creation time doesn't match its natural number order).
    const five = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-05" }),
    );
    const one = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-01" }),
    );
    const three = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-03" }),
    );
    createdInvoiceIds.push(five.id, one.id, three.id);

    const result = await invoiceService.listByProject(project.id);

    expect(result.map((invoice) => invoice.invoiceNumber)).toEqual([
      "TP-05",
      "TP-03",
      "TP-01",
    ]);
  });

  it("M44: sorts ascending when explicitly requested", async () => {
    const { project } = await createTestProject();

    const five = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-05" }),
    );
    const one = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ invoiceNumber: "TP-01" }),
    );
    createdInvoiceIds.push(five.id, one.id);

    const result = await invoiceService.listByProject(project.id, "asc");

    expect(result.map((invoice) => invoice.invoiceNumber)).toEqual([
      "TP-01",
      "TP-05",
    ]);
  });
});

describe("invoiceService.listByParty", () => {
  it("returns invoices where the party is the project's client", async () => {
    const client = await createTestParty({ name: "[test] Party as Client" });
    const { project } = await createTestProject({ clientId: client.id });

    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);

    const result = await invoiceService.listByParty(client.id);

    expect(result.map((i) => i.id)).toEqual([invoice.id]);
  });

  it("returns invoices where the party is the project's contractor", async () => {
    const contractor = await createTestParty({
      name: "[test] Party as Contractor",
    });
    const { project } = await createTestProject({
      contractorId: contractor.id,
      preferredPaymentMethodId: "",
    });

    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);

    const result = await invoiceService.listByParty(contractor.id);

    expect(result.map((i) => i.id)).toEqual([invoice.id]);
  });

  it("returns invoices where the party is either the client or the contractor, across different projects", async () => {
    const shared = await createTestParty({ name: "[test] Shared Party" });
    const { project: projectA } = await createTestProject({
      clientId: shared.id,
    });
    const { project: projectB } = await createTestProject({
      contractorId: shared.id,
      preferredPaymentMethodId: "",
    });

    const a1 = await invoiceService.createDraft(
      projectA.id,
      baseInvoiceInput(),
    );
    const b1 = await invoiceService.createDraft(
      projectB.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(a1.id, b1.id);

    const result = await invoiceService.listByParty(shared.id);

    expect(result.map((i) => i.id).sort()).toEqual([a1.id, b1.id].sort());
  });

  it("returns an empty array for a party with no associated projects/invoices", async () => {
    const party = await createTestParty({ name: "[test] Unrelated Party" });
    const result = await invoiceService.listByParty(party.id);
    expect(result).toEqual([]);
  });

  it("excludes invoices belonging to an unrelated party's project", async () => {
    const { project: unrelatedProject } = await createTestProject();
    const unrelatedInvoice = await invoiceService.createDraft(
      unrelatedProject.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(unrelatedInvoice.id);

    const party = await createTestParty({ name: "[test] Excluded Party" });
    const result = await invoiceService.listByParty(party.id);

    expect(result).toEqual([]);
  });
});

describe("invoiceService.validateForSend", () => {
  it("rejects when there are no line items", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ items: [] }),
    );
    createdInvoiceIds.push(invoice.id);

    await expect(
      invoiceService.validateForSend(invoice.id),
    ).rejects.toBeInstanceOf(InvoiceSendValidationError);
  });

  it("rejects when the due date is before the issue date", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ issueDate: "2026-02-01", dueDate: "2026-01-01" }),
    );
    createdInvoiceIds.push(invoice.id);

    await expect(
      invoiceService.validateForSend(invoice.id),
    ).rejects.toBeInstanceOf(InvoiceSendValidationError);
  });

  it("rejects when the project's non-USD DisplayCurrency has no convertedTotal", async () => {
    const { project } = await createTestProject({
      currencyMode: "DUAL",
      displayCurrency: "AUD",
    });
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ convertedTotal: "" }),
    );
    createdInvoiceIds.push(invoice.id);

    await expect(
      invoiceService.validateForSend(invoice.id),
    ).rejects.toBeInstanceOf(InvoiceSendValidationError);
  });

  it("resolves without throwing when every requirement is met", async () => {
    const { project } = await createTestProject({
      currencyMode: "DUAL",
      displayCurrency: "AUD",
    });
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ convertedTotal: "500" }),
    );
    createdInvoiceIds.push(invoice.id);

    await expect(
      invoiceService.validateForSend(invoice.id),
    ).resolves.toBeUndefined();
  });
});

describe("invoiceService.transitionStatus", () => {
  it("DRAFT -> SENT succeeds and locks a final recompute of the snapshot", async () => {
    const { project, contractor } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);

    // Edit the source party after the last draft save but before sending —
    // the one final recompute at SENT (Story 6.2) should still pick this up.
    await partyService.update(contractor.id, {
      ...basePartyInput({ name: contractor.name }),
      email: "final-recompute@test.example",
    });

    const sent = await invoiceService.transitionStatus(invoice.id, "SENT");
    expect(sent.status).toBe("SENT");
    expect(sent.fromPartySnapshot).toMatchObject({
      email: "final-recompute@test.example",
    });

    // A later party edit must never affect the now-locked SENT snapshot.
    await partyService.update(contractor.id, {
      ...basePartyInput({ name: contractor.name }),
      email: "after-sent@test.example",
    });
    const reFetched = await invoiceService.getById(invoice.id);
    expect(reFetched?.fromPartySnapshot).toMatchObject({
      email: "final-recompute@test.example",
    });
  });

  it("createDraft -> updateDraft -> transitionStatus(SENT), then a source-party mutation leaves the SENT snapshot unchanged", async () => {
    const { project, contractor } = await createTestProject();

    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        items: [
          {
            description: "Consulting",
            quantity: "1",
            unitPrice: "100",
            isFlatAmount: false,
            amount: "",
            durationText: "",
          },
        ],
      }),
    );
    createdInvoiceIds.push(invoice.id);

    const updated = await invoiceService.updateDraft(
      invoice.id,
      baseInvoiceInput({
        items: [
          {
            description: "Consulting",
            quantity: "2",
            unitPrice: "100",
            isFlatAmount: false,
            amount: "",
            durationText: "",
          },
        ],
      }),
    );
    expect(updated.subtotal.toString()).toBe("200");

    const sent = await invoiceService.transitionStatus(invoice.id, "SENT");
    expect(sent.status).toBe("SENT");
    expect(sent.fromPartySnapshot).toMatchObject({ name: contractor.name });

    await partyService.update(contractor.id, {
      ...basePartyInput({ name: "Renamed After Send" }),
    });

    const reFetched = await invoiceService.getById(invoice.id);
    expect(reFetched?.fromPartySnapshot).toMatchObject({
      name: contractor.name,
    });
    expect(reFetched?.subtotal.toString()).toBe("200");
  });

  it("DRAFT -> VOID succeeds", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);

    const voided = await invoiceService.transitionStatus(invoice.id, "VOID");
    expect(voided.status).toBe("VOID");
  });

  it("SENT -> PAID succeeds", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);
    await invoiceService.transitionStatus(invoice.id, "SENT");

    const paid = await invoiceService.transitionStatus(invoice.id, "PAID");
    expect(paid.status).toBe("PAID");
  });

  it("SENT -> VOID succeeds", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);
    await invoiceService.transitionStatus(invoice.id, "SENT");

    const voided = await invoiceService.transitionStatus(invoice.id, "VOID");
    expect(voided.status).toBe("VOID");
  });

  it("rejects PAID -> VOID — a paid invoice can never be voided", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);
    await invoiceService.transitionStatus(invoice.id, "SENT");
    await invoiceService.transitionStatus(invoice.id, "PAID");

    await expect(
      invoiceService.transitionStatus(invoice.id, "VOID"),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it("rejects any transition back to DRAFT", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);
    await invoiceService.transitionStatus(invoice.id, "SENT");

    await expect(
      invoiceService.transitionStatus(invoice.id, "DRAFT"),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    await invoiceService.transitionStatus(invoice.id, "PAID");
    await expect(
      invoiceService.transitionStatus(invoice.id, "DRAFT"),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it("rejects any transition out of VOID", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);
    await invoiceService.transitionStatus(invoice.id, "VOID");

    await expect(
      invoiceService.transitionStatus(invoice.id, "SENT"),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(
      invoiceService.transitionStatus(invoice.id, "PAID"),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it("rejects DRAFT -> PAID directly, without passing through SENT", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);

    await expect(
      invoiceService.transitionStatus(invoice.id, "PAID"),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it("rejects PAID -> SENT — a paid invoice can never revert to sent", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);
    await invoiceService.transitionStatus(invoice.id, "SENT");
    await invoiceService.transitionStatus(invoice.id, "PAID");

    await expect(
      invoiceService.transitionStatus(invoice.id, "SENT"),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it("rejects VOID -> DRAFT — VOID is terminal", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    createdInvoiceIds.push(invoice.id);
    await invoiceService.transitionStatus(invoice.id, "VOID");

    await expect(
      invoiceService.transitionStatus(invoice.id, "DRAFT"),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it("blocks DRAFT -> SENT via validateForSend when send requirements aren't met, leaving the invoice DRAFT", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({ items: [] }),
    );
    createdInvoiceIds.push(invoice.id);

    await expect(
      invoiceService.transitionStatus(invoice.id, "SENT"),
    ).rejects.toBeInstanceOf(InvoiceSendValidationError);

    const stillDraft = await invoiceService.getById(invoice.id);
    expect(stillDraft?.status).toBe("DRAFT");
  });
});

describe("invoiceService.delete", () => {
  it("deletes a DRAFT invoice and cascades its line items", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );

    await invoiceService.delete(invoice.id);

    expect(await invoiceService.getById(invoice.id)).toBeNull();
    const remainingItems = await prisma.invoiceItem.count({
      where: { invoiceId: invoice.id },
    });
    expect(remainingItems).toBe(0);
  });

  it("deletes an invoice in any status (SENT/PAID/VOID), not just DRAFT", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput(),
    );
    await invoiceService.transitionStatus(invoice.id, "SENT");
    await invoiceService.transitionStatus(invoice.id, "PAID");

    await invoiceService.delete(invoice.id);
    expect(await invoiceService.getById(invoice.id)).toBeNull();
  });

  it("throws InvoiceNotFoundError for a nonexistent id", async () => {
    await expect(
      invoiceService.delete("nonexistent-id"),
    ).rejects.toBeInstanceOf(InvoiceNotFoundError);
  });
});

describe("invoiceService.getAutofillDataForProject", () => {
  it("returns null when the project has no prior invoice", async () => {
    const { project } = await createTestProject();
    await expect(
      invoiceService.getAutofillDataForProject(project.id),
    ).resolves.toBeNull();
  });

  it("returns the most recently issued invoice's items/notes as plain strings, any status", async () => {
    const { project } = await createTestProject();
    const older = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-OLDER",
        issueDate: "2026-01-01",
        items: [hourlyItem("Older work", "1", "100")],
      }),
    );
    createdInvoiceIds.push(older.id);

    const newer = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-NEWER",
        issueDate: "2026-02-01",
        dueDate: "2026-02-15",
        itemsNote: "Newer note",
        bottomNote: "Newer bottom",
        items: [
          hourlyItem("Consulting", "3", "150"),
          flatItem("Retainer", "500"),
        ],
      }),
    );
    createdInvoiceIds.push(newer.id);
    await invoiceService.transitionStatus(newer.id, "SENT");
    await invoiceService.transitionStatus(newer.id, "PAID");

    const autofill = await invoiceService.getAutofillDataForProject(project.id);

    expect(autofill).not.toBeNull();
    expect(autofill!.itemsNote).toBe("Newer note");
    expect(autofill!.bottomNote).toBe("Newer bottom");
    expect(autofill!.items).toEqual([
      {
        description: "Consulting",
        isFlatAmount: false,
        isReferralCredit: false,
        quantity: "3",
        unitPrice: "150",
        amount: "",
        durationText: "",
      },
      {
        description: "Retainer",
        isFlatAmount: true,
        isReferralCredit: false,
        quantity: "",
        unitPrice: "",
        amount: "500",
        durationText: "Fixed",
      },
    ]);
  });

  it("treats even a DRAFT or VOID invoice as 'last time' when it's the most recently issued (deliberate decision — any status counts)", async () => {
    const { project } = await createTestProject();
    const sent = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-SENT",
        issueDate: "2026-01-01",
        items: [hourlyItem("Sent work", "1", "100")],
      }),
    );
    createdInvoiceIds.push(sent.id);
    await invoiceService.transitionStatus(sent.id, "SENT");

    const laterVoid = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        invoiceNumber: "TP-VOID",
        issueDate: "2026-03-01",
        items: [hourlyItem("Voided work", "5", "200")],
      }),
    );
    createdInvoiceIds.push(laterVoid.id);
    await invoiceService.transitionStatus(laterVoid.id, "VOID");

    const autofill = await invoiceService.getAutofillDataForProject(project.id);
    expect(autofill!.items[0].description).toBe("Voided work");
  });

  it("M35 — carries a referral-credit row forward with its label but a blanked amount", async () => {
    const { project } = await createTestProject();
    const invoice = await invoiceService.createDraft(
      project.id,
      baseInvoiceInput({
        items: [
          hourlyItem("Consulting", "1", "100"),
          referralCreditItem("Referral Credit (Thank you!)", "150"),
        ],
      }),
    );
    createdInvoiceIds.push(invoice.id);

    const autofill = await invoiceService.getAutofillDataForProject(project.id);
    const credit = autofill!.items.find((i) => i.isReferralCredit)!;
    expect(credit.description).toBe("Referral Credit (Thank you!)");
    expect(credit.amount).toBe("");
  });
});
