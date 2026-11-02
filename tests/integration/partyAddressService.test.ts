// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  partyAddressService,
  PartyAddressDeletionBlockedError,
} from "@/services/partyAddressService";
import { partyService } from "@/services/partyService";
import { prisma } from "@/lib/prisma";
import type { PartyAddressInput } from "@/lib/validation/partyAddress";
import { partyAddressSchema } from "@/lib/validation/partyAddress";

const createdPartyIds: string[] = [];
const createdProjectIds: string[] = [];

async function createTestParty(name: string) {
  const party = await partyService.create({
    name,
    email: "",
    type: "ORGANIZATION",
    addressLabel: "",
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

function baseInput(
  overrides: Partial<PartyAddressInput> = {},
): PartyAddressInput {
  return {
    label: "[test] Address",
    isDefault: false,
    street1: "1 Test Lane",
    street2: "",
    city: "Testville",
    state: "",
    postalCode: "",
    country: "Testland",
    ...overrides,
  };
}

afterEach(async () => {
  if (createdProjectIds.length) {
    await prisma.project.deleteMany({
      where: { id: { in: createdProjectIds.splice(0) } },
    });
  }
  if (createdPartyIds.length) {
    // PartyAddress.partyId cascades on Party delete.
    await prisma.party.deleteMany({
      where: { id: { in: createdPartyIds.splice(0) } },
    });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("partyAddressSchema", () => {
  it("rejects an address with a label but no postal fields", () => {
    const result = partyAddressSchema.safeParse(
      baseInput({ street1: "", city: "", country: "" }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts an address with any single postal field", () => {
    expect(
      partyAddressSchema.safeParse(
        baseInput({ street1: "", city: "", country: "Testland" }),
      ).success,
    ).toBe(true);
  });
});

describe("partyAddressService", () => {
  it("makes a party's first address the default regardless of the flag, and stores blanks as null", async () => {
    const party = await createTestParty("[test] First Address Party");

    const first = await partyAddressService.create(
      party.id,
      baseInput({ label: "Office", isDefault: false }),
    );

    expect(first.isDefault).toBe(true);
    expect(first.street2).toBeNull();
    expect(first.postalCode).toBeNull();
  });

  it("keeps at most one default per party across create and update", async () => {
    const party = await createTestParty("[test] Default Juggling Party");
    const first = await partyAddressService.create(
      party.id,
      baseInput({ label: "First" }),
    );
    const second = await partyAddressService.create(
      party.id,
      baseInput({ label: "Second", isDefault: true }),
    );

    let addresses = await partyAddressService.listForParty(party.id);
    expect(addresses.filter((a) => a.isDefault).map((a) => a.id)).toEqual([
      second.id,
    ]);

    await partyAddressService.update(
      first.id,
      party.id,
      baseInput({ label: "First", isDefault: true }),
    );
    addresses = await partyAddressService.listForParty(party.id);
    expect(addresses.filter((a) => a.isDefault).map((a) => a.id)).toEqual([
      first.id,
    ]);

    // Re-saving the current default as default doesn't un-set itself.
    await partyAddressService.update(
      first.id,
      party.id,
      baseInput({ label: "First renamed", isDefault: true }),
    );
    addresses = await partyAddressService.listForParty(party.id);
    expect(addresses.filter((a) => a.isDefault)).toHaveLength(1);
    expect(addresses.find((a) => a.id === first.id)?.label).toBe(
      "First renamed",
    );
  });

  it("leaves other parties' defaults alone", async () => {
    const partyA = await createTestParty("[test] Party A");
    const partyB = await createTestParty("[test] Party B");
    const addressA = await partyAddressService.create(partyA.id, baseInput());
    await partyAddressService.create(partyB.id, baseInput({ isDefault: true }));

    const refetched = await partyAddressService.getById(addressA.id);
    expect(refetched?.isDefault).toBe(true);
  });

  it("blocks deletion while a project has the address selected on either side, and allows it once unselected", async () => {
    const contractor = await createTestParty("[test] Address Contractor");
    const client = await createTestParty("[test] Address Client");
    const contractorAddress = await partyAddressService.create(
      contractor.id,
      baseInput({ label: "Contractor HQ" }),
    );
    const clientAddress = await partyAddressService.create(
      client.id,
      baseInput({ label: "Client site" }),
    );
    const spare = await partyAddressService.create(
      client.id,
      baseInput({ label: "Spare" }),
    );

    const project = await prisma.project.create({
      data: {
        name: "[test] Address Project",
        clientId: client.id,
        contractorId: contractor.id,
        contractorAddressId: contractorAddress.id,
        clientAddressId: clientAddress.id,
        invoiceNumberFormat: "{number}",
        displayCurrency: "USD",
        status: "ACTIVE",
      },
    });
    createdProjectIds.push(project.id);

    await expect(
      partyAddressService.isDeletable(contractorAddress.id),
    ).resolves.toBe(false);
    await expect(
      partyAddressService.isDeletable(clientAddress.id),
    ).resolves.toBe(false);
    await expect(partyAddressService.isDeletable(spare.id)).resolves.toBe(true);
    await expect(
      partyAddressService.delete(clientAddress.id),
    ).rejects.toBeInstanceOf(PartyAddressDeletionBlockedError);

    await prisma.project.update({
      where: { id: project.id },
      data: { clientAddressId: null },
    });
    await expect(
      partyAddressService.delete(clientAddress.id),
    ).resolves.toBeUndefined();
    await expect(
      partyAddressService.getById(clientAddress.id),
    ).resolves.toBeNull();
  });

  it("cascades with its party", async () => {
    const party = await createTestParty("[test] Cascade Party");
    const address = await partyAddressService.create(party.id, baseInput());

    await partyService.delete(party.id);
    createdPartyIds.splice(createdPartyIds.indexOf(party.id), 1);

    await expect(partyAddressService.getById(address.id)).resolves.toBeNull();
  });
});
