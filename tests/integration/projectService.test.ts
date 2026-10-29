// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  projectService,
  ProjectDeletionBlockedError,
  PreferredPaymentMethodMismatchError,
  deriveAbbreviation,
} from "@/services/projectService";
import { partyService } from "@/services/partyService";
import { paymentMethodService } from "@/services/paymentMethodService";
import { prisma } from "@/lib/prisma";
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
    abbreviation: "",
    clientId: "",
    contractorId: "",
    preferredPaymentMethodId: "",
    invoiceNumberFormat: "{abbreviation}-{number}-{date}",
    currencyMode: "SINGLE",
    displayCurrency: "USD",
    referralCreditEnabled: false,
    status: "ACTIVE",
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

describe("deriveAbbreviation", () => {
  it("takes the initials of each word in a multi-word name", () => {
    expect(deriveAbbreviation("Torque Gears")).toBe("TG");
    expect(deriveAbbreviation("Acme Robotics Inc")).toBe("ARI");
  });

  it("falls back to the first two characters for a single-word name", () => {
    expect(deriveAbbreviation("Torque")).toBe("TO");
  });
});

describe("projectService", () => {
  it("creates a project linking a contractor and a client", async () => {
    const contractor = await createTestParty("[test] Contractor");
    const client = await createTestParty("[test] Client");

    const project = await projectService.create(
      baseProjectInput({
        name: "[test] Ongoing Support",
        contractorId: contractor.id,
        clientId: client.id,
      }),
    );
    createdProjectIds.push(project.id);

    expect(project.contractorId).toBe(contractor.id);
    expect(project.clientId).toBe(client.id);
    expect(project.displayCurrency).toBe("USD");
    expect(project.status).toBe("ACTIVE");
  });

  it("M35 — round-trips referralCreditEnabled/referralCreditLabel, defaulting off with no label", async () => {
    const contractor = await createTestParty("[test] Referral Contractor");
    const client = await createTestParty("[test] Referral Client");

    const defaulted = await projectService.create(
      baseProjectInput({
        name: "[test] Referral Default",
        contractorId: contractor.id,
        clientId: client.id,
      }),
    );
    createdProjectIds.push(defaulted.id);
    expect(defaulted.referralCreditEnabled).toBe(false);
    expect(defaulted.referralCreditLabel).toBeNull();

    const enabled = await projectService.create(
      baseProjectInput({
        name: "[test] Referral Enabled",
        contractorId: contractor.id,
        clientId: client.id,
        referralCreditEnabled: true,
        referralCreditLabel: "With Thanks to Jane",
      }),
    );
    createdProjectIds.push(enabled.id);
    expect(enabled.referralCreditEnabled).toBe(true);
    expect(enabled.referralCreditLabel).toBe("With Thanks to Jane");

    const updated = await projectService.update(
      enabled.id,
      baseProjectInput({
        name: "[test] Referral Enabled",
        contractorId: contractor.id,
        clientId: client.id,
        referralCreditEnabled: false,
        referralCreditLabel: "",
      }),
    );
    expect(updated.referralCreditEnabled).toBe(false);
    expect(updated.referralCreditLabel).toBeNull();
  });

  it("auto-derives the abbreviation from the project name when left blank", async () => {
    const contractor = await createTestParty("[test] Abbrev Contractor");
    const client = await createTestParty("[test] Abbrev Client");

    const project = await projectService.create(
      baseProjectInput({
        name: "Torque Gears",
        contractorId: contractor.id,
        clientId: client.id,
        abbreviation: "",
      }),
    );
    createdProjectIds.push(project.id);

    expect(project.abbreviation).toBe("TG");
  });

  it("uses the explicit abbreviation when provided, instead of deriving one", async () => {
    const contractor = await createTestParty("[test] Explicit Contractor");
    const client = await createTestParty("[test] Explicit Client");

    const project = await projectService.create(
      baseProjectInput({
        name: "[test] Gearbox Ventures",
        contractorId: contractor.id,
        clientId: client.id,
        abbreviation: "GV",
      }),
    );
    createdProjectIds.push(project.id);

    expect(project.abbreviation).toBe("GV");
  });

  it("accepts a preferred payment method that belongs to the selected contractor", async () => {
    const contractor = await createTestParty("[test] PPM Contractor");
    const client = await createTestParty("[test] PPM Client");
    const method = await paymentMethodService.create(
      contractor.id,
      basePaymentMethodInput(),
    );

    const project = await projectService.create(
      baseProjectInput({
        name: "[test] PPM Project",
        contractorId: contractor.id,
        clientId: client.id,
        preferredPaymentMethodId: method.id,
      }),
    );
    createdProjectIds.push(project.id);

    expect(project.preferredPaymentMethodId).toBe(method.id);
  });

  it("rejects a preferred payment method that belongs to a different party", async () => {
    const contractor = await createTestParty("[test] Mismatch Contractor");
    const otherParty = await createTestParty("[test] Mismatch Other");
    const client = await createTestParty("[test] Mismatch Client");
    const otherPartysMethod = await paymentMethodService.create(
      otherParty.id,
      basePaymentMethodInput(),
    );

    await expect(
      projectService.create(
        baseProjectInput({
          name: "[test] Mismatch Project",
          contractorId: contractor.id,
          clientId: client.id,
          preferredPaymentMethodId: otherPartysMethod.id,
        }),
      ),
    ).rejects.toBeInstanceOf(PreferredPaymentMethodMismatchError);
  });

  it("re-validates the preferred payment method on update, not just create", async () => {
    const contractorA = await createTestParty("[test] Update Contractor A");
    const contractorB = await createTestParty("[test] Update Contractor B");
    const client = await createTestParty("[test] Update Client");
    const methodForA = await paymentMethodService.create(
      contractorA.id,
      basePaymentMethodInput(),
    );

    const project = await projectService.create(
      baseProjectInput({
        name: "[test] Update Project",
        contractorId: contractorA.id,
        clientId: client.id,
        preferredPaymentMethodId: methodForA.id,
      }),
    );
    createdProjectIds.push(project.id);

    await expect(
      projectService.update(
        project.id,
        baseProjectInput({
          name: "[test] Update Project",
          contractorId: contractorB.id,
          clientId: client.id,
          preferredPaymentMethodId: methodForA.id,
        }),
      ),
    ).rejects.toBeInstanceOf(PreferredPaymentMethodMismatchError);
  });

  it("stores previous invoice-number formats from the free-text field, deduped and without the current format", async () => {
    const contractor = await createTestParty("[test] Formats Contractor");
    const client = await createTestParty("[test] Formats Client");
    const project = await projectService.create(
      baseProjectInput({
        name: "[test] Formats Project",
        contractorId: contractor.id,
        clientId: client.id,
        invoiceNumberFormat: "{abbreviation}-{number}",
        previousInvoiceNumberFormats:
          "OLD-{number}\n{abbreviation}-{number}\n OLD-{number} , Q-{date}/{number}",
      }),
    );
    createdProjectIds.push(project.id);

    const stored = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
    });
    expect(stored.previousInvoiceNumberFormats).toEqual([
      "OLD-{number}",
      "Q-{date}/{number}",
    ]);
  });

  it("appends the outgoing format to the previous formats when the format changes on update, and leaves it alone otherwise", async () => {
    const contractor = await createTestParty("[test] Change Contractor");
    const client = await createTestParty("[test] Change Client");
    const input = baseProjectInput({
      name: "[test] Change Project",
      contractorId: contractor.id,
      clientId: client.id,
      invoiceNumberFormat: "{abbreviation}-{number}",
    });
    const project = await projectService.create(input);
    createdProjectIds.push(project.id);

    await projectService.update(project.id, {
      ...input,
      invoiceNumberFormat: "{abbreviation}-{year}/{month:MMM}{number:month}",
    });
    let stored = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
    });
    expect(stored.previousInvoiceNumberFormats).toEqual([
      "{abbreviation}-{number}",
    ]);

    // Same format again: nothing new is appended, the list is kept as submitted.
    await projectService.update(project.id, {
      ...input,
      invoiceNumberFormat: "{abbreviation}-{year}/{month:MMM}{number:month}",
      previousInvoiceNumberFormats: "{abbreviation}-{number}",
    });
    stored = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
    });
    expect(stored.previousInvoiceNumberFormats).toEqual([
      "{abbreviation}-{number}",
    ]);

    // A second change prepends the newest outgoing format.
    await projectService.update(project.id, {
      ...input,
      invoiceNumberFormat: "{abbreviation}-{number:year}",
      previousInvoiceNumberFormats: "{abbreviation}-{number}",
    });
    stored = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
    });
    expect(stored.previousInvoiceNumberFormats).toEqual([
      "{abbreviation}-{year}/{month:MMM}{number:month}",
      "{abbreviation}-{number}",
    ]);
  });

  it("deletes a project with zero invoices", async () => {
    const contractor = await createTestParty("[test] Delete Contractor");
    const client = await createTestParty("[test] Delete Client");
    const project = await projectService.create(
      baseProjectInput({
        name: "[test] Deletable Project",
        contractorId: contractor.id,
        clientId: client.id,
      }),
    );

    await expect(projectService.isDeletable(project.id)).resolves.toBe(true);
    await expect(projectService.delete(project.id)).resolves.toBeUndefined();
    await expect(projectService.getById(project.id)).resolves.toBeNull();
  });

  it("blocks deletion when the project has at least one invoice", async () => {
    const contractor = await createTestParty("[test] Invoice Contractor");
    const client = await createTestParty("[test] Invoice Client");
    const project = await projectService.create(
      baseProjectInput({
        name: "[test] Project With Invoice",
        contractorId: contractor.id,
        clientId: client.id,
      }),
    );
    createdProjectIds.push(project.id);

    const invoice = await prisma.invoice.create({
      data: {
        projectId: project.id,
        invoiceNumber: "TEST-001",
        status: "DRAFT",
        issueDate: new Date("2026-01-01"),
        dueDate: new Date("2026-01-15"),
        subtotal: "100.00",
        total: "100.00",
        fromPartySnapshot: {},
        toPartySnapshot: {},
        paymentDetailsSnapshot: [],
      },
    });
    createdInvoiceIds.push(invoice.id);

    await expect(projectService.isDeletable(project.id)).resolves.toBe(false);
    await expect(projectService.delete(project.id)).rejects.toBeInstanceOf(
      ProjectDeletionBlockedError,
    );

    await prisma.invoice.delete({ where: { id: invoice.id } });
    createdInvoiceIds.splice(createdInvoiceIds.indexOf(invoice.id), 1);

    await expect(projectService.isDeletable(project.id)).resolves.toBe(true);
  });
});

describe("projectService reorder (sortOrder)", () => {
  it("appends a newly created project after the current max sortOrder", async () => {
    const contractor = await createTestParty("[test] Sort Contractor");
    const client = await createTestParty("[test] Sort Client");

    const a = await projectService.create(
      baseProjectInput({
        name: "[test] Sort A",
        contractorId: contractor.id,
        clientId: client.id,
      }),
    );
    createdProjectIds.push(a.id);

    const b = await projectService.create(
      baseProjectInput({
        name: "[test] Sort B",
        contractorId: contractor.id,
        clientId: client.id,
      }),
    );
    createdProjectIds.push(b.id);

    expect(b.sortOrder).toBeGreaterThan(a.sortOrder);
  });

  it("move swaps sortOrder with the adjacent ACTIVE project and is a no-op past the last one", async () => {
    const contractor = await createTestParty("[test] Move Contractor");
    const client = await createTestParty("[test] Move Client");

    const a = await projectService.create(
      baseProjectInput({
        name: "[test] Move A",
        contractorId: contractor.id,
        clientId: client.id,
      }),
    );
    createdProjectIds.push(a.id);
    const b = await projectService.create(
      baseProjectInput({
        name: "[test] Move B",
        contractorId: contractor.id,
        clientId: client.id,
      }),
    );
    createdProjectIds.push(b.id);

    await projectService.move(b.id, "up");
    const [aAfterUp, bAfterUp] = await Promise.all([
      projectService.getById(a.id),
      projectService.getById(b.id),
    ]);
    expect(bAfterUp!.sortOrder).toBeLessThan(aAfterUp!.sortOrder);
    expect(new Set([aAfterUp!.sortOrder, bAfterUp!.sortOrder])).toEqual(
      new Set([a.sortOrder, b.sortOrder]),
    );

    // b is now the highest sortOrder created so far in this test — nothing
    // ACTIVE can be above it, so moving it further down is a no-op.
    await projectService.move(aAfterUp!.id, "down");
    const aAfterNoop = await projectService.getById(a.id);
    expect(aAfterNoop!.sortOrder).toBe(aAfterUp!.sortOrder);
  });

  it("skips an ARCHIVED project sitting between two ACTIVE ones when finding a move neighbor", async () => {
    const contractor = await createTestParty("[test] Skip Contractor");
    const client = await createTestParty("[test] Skip Client");

    const a = await projectService.create(
      baseProjectInput({
        name: "[test] Skip A",
        contractorId: contractor.id,
        clientId: client.id,
      }),
    );
    createdProjectIds.push(a.id);
    const archived = await projectService.create(
      baseProjectInput({
        name: "[test] Skip Archived",
        contractorId: contractor.id,
        clientId: client.id,
        status: "ARCHIVED",
      }),
    );
    createdProjectIds.push(archived.id);
    const b = await projectService.create(
      baseProjectInput({
        name: "[test] Skip B",
        contractorId: contractor.id,
        clientId: client.id,
      }),
    );
    createdProjectIds.push(b.id);

    await projectService.move(b.id, "up");

    const [aAfter, archivedAfter, bAfter] = await Promise.all([
      projectService.getById(a.id),
      projectService.getById(archived.id),
      projectService.getById(b.id),
    ]);
    expect(bAfter!.sortOrder).toBe(a.sortOrder);
    expect(aAfter!.sortOrder).toBe(b.sortOrder);
    expect(archivedAfter!.sortOrder).toBe(archived.sortOrder);
  });
});
