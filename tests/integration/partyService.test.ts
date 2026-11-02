// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  partyService,
  PartyDeletionBlockedError,
} from "@/services/partyService";
import { partyAddressService } from "@/services/partyAddressService";
import { prisma } from "@/lib/prisma";
import type { PartyInput } from "@/lib/validation/party";

const createdPartyIds: string[] = [];
const createdProjectIds: string[] = [];
const createdInvoiceIds: string[] = [];

function baseInput(overrides: Partial<PartyInput> = {}): PartyInput {
  return {
    name: "[test] Party",
    email: "",
    type: "ORGANIZATION",
    addressLabel: "",
    street1: "",
    street2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
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

describe("partyService", () => {
  it("creates a party with its first address as the default PartyAddress", async () => {
    const party = await partyService.create(
      baseInput({
        name: "Test Contractor LLC",
        email: "hello@test-contractor.example",
        type: "ORGANIZATION",
        addressLabel: "Head office",
        street1: "1 Main St",
        city: "Springfield",
        state: "IL",
        postalCode: "62701",
        country: "USA",
      }),
    );
    createdPartyIds.push(party.id);

    expect(party.name).toBe("Test Contractor LLC");
    expect(party.email).toBe("hello@test-contractor.example");

    const addresses = await partyAddressService.listForParty(party.id);
    expect(addresses).toHaveLength(1);
    expect(addresses[0]).toMatchObject({
      label: "Head office",
      isDefault: true,
      street1: "1 Main St",
      street2: null,
      city: "Springfield",
      country: "USA",
    });
  });

  it('labels the first address "Primary" when no label is given, and creates none when every address field is blank', async () => {
    const withAddress = await partyService.create(
      baseInput({ name: "Just A City", city: "Austin" }),
    );
    const bare = await partyService.create(baseInput({ name: "Bare Party" }));
    createdPartyIds.push(withAddress.id, bare.id);

    expect(bare.email).toBeNull();
    const labelled = await partyAddressService.listForParty(withAddress.id);
    expect(labelled.map((a) => a.label)).toEqual(["Primary"]);
    await expect(partyAddressService.listForParty(bare.id)).resolves.toEqual(
      [],
    );
  });

  it("updates a party's own fields without touching its addresses", async () => {
    const party = await partyService.create(
      baseInput({ name: "Original Name", city: "Austin" }),
    );
    createdPartyIds.push(party.id);

    const updated = await partyService.update(party.id, {
      name: "Renamed",
      email: "renamed@test.example",
      type: "INDIVIDUAL",
    });

    expect(updated.name).toBe("Renamed");
    expect(updated.type).toBe("INDIVIDUAL");
    const addresses = await partyAddressService.listForParty(party.id);
    expect(addresses.map((a) => a.city)).toEqual(["Austin"]);
  });

  it("clears a previously-set optional field to null when edited to empty", async () => {
    const party = await partyService.create(
      baseInput({ name: "Has Email", email: "old@test.example" }),
    );
    createdPartyIds.push(party.id);
    expect(party.email).toBe("old@test.example");

    const updated = await partyService.update(
      party.id,
      baseInput({ name: "Has Email", email: "" }),
    );
    expect(updated.email).toBeNull();
  });

  it("deletes an unreferenced party", async () => {
    const party = await partyService.create(baseInput({ name: "Deletable" }));

    await expect(partyService.isDeletable(party.id)).resolves.toBe(true);
    await expect(partyService.delete(party.id)).resolves.toBeUndefined();
    await expect(partyService.getById(party.id)).resolves.toBeNull();
  });

  it("blocks deletion when the party is a project's contractor or client, and allows it once unreferenced", async () => {
    const contractor = await partyService.create(
      baseInput({ name: "[test] Contractor" }),
    );
    const client = await partyService.create(
      baseInput({ name: "[test] Client" }),
    );
    createdPartyIds.push(contractor.id, client.id);

    const project = await prisma.project.create({
      data: {
        name: "[test] Project",
        clientId: client.id,
        contractorId: contractor.id,
        invoiceNumberFormat: "{number}",
        displayCurrency: "USD",
        status: "ACTIVE",
      },
    });
    createdProjectIds.push(project.id);

    await expect(partyService.isDeletable(contractor.id)).resolves.toBe(false);
    await expect(partyService.isDeletable(client.id)).resolves.toBe(false);
    await expect(partyService.delete(contractor.id)).rejects.toBeInstanceOf(
      PartyDeletionBlockedError,
    );
    await expect(partyService.delete(client.id)).rejects.toBeInstanceOf(
      PartyDeletionBlockedError,
    );

    // Unreferencing the project's contractor/client unblocks deletion.
    await prisma.project.delete({ where: { id: project.id } });
    createdProjectIds.splice(createdProjectIds.indexOf(project.id), 1);

    await expect(partyService.isDeletable(contractor.id)).resolves.toBe(true);
    await expect(partyService.delete(contractor.id)).resolves.toBeUndefined();
    createdPartyIds.splice(createdPartyIds.indexOf(contractor.id), 1);
  });

  it("is never blocked by a historical invoice snapshot — only by a live Project FK", async () => {
    const originalContractor = await partyService.create(
      baseInput({ name: "[test] Snapshot Contractor" }),
    );
    const replacementContractor = await partyService.create(
      baseInput({ name: "[test] Replacement Contractor" }),
    );
    const client = await partyService.create(
      baseInput({ name: "[test] Snapshot Client" }),
    );
    createdPartyIds.push(
      originalContractor.id,
      replacementContractor.id,
      client.id,
    );

    const project = await prisma.project.create({
      data: {
        name: "[test] Snapshot Project",
        clientId: client.id,
        contractorId: originalContractor.id,
        invoiceNumberFormat: "{number}",
        displayCurrency: "USD",
        status: "ACTIVE",
      },
    });
    createdProjectIds.push(project.id);

    // A SENT invoice permanently snapshots the original contractor's data —
    // this JSON copy must never act as a deletion-blocking reference
    // (Invoice has no FK to Party). It stays in the DB, unmodified, for the
    // rest of this test.
    const invoice = await prisma.invoice.create({
      data: {
        projectId: project.id,
        invoiceNumber: "SNAP-01",
        status: "SENT",
        issueDate: new Date("2026-01-01"),
        dueDate: new Date("2026-01-15"),
        subtotal: "100.00",
        total: "100.00",
        fromPartySnapshot: { name: originalContractor.name },
        toPartySnapshot: { name: client.name },
        paymentDetailsSnapshot: [],
      },
    });
    createdInvoiceIds.push(invoice.id);

    // Reassign the project to a different contractor — the original
    // contractor no longer has any live Project FK, even though the SENT
    // invoice above still carries their name in its snapshot.
    await prisma.project.update({
      where: { id: project.id },
      data: { contractorId: replacementContractor.id },
    });

    await expect(partyService.isDeletable(originalContractor.id)).resolves.toBe(
      true,
    );
    await expect(
      partyService.delete(originalContractor.id),
    ).resolves.toBeUndefined();
    createdPartyIds.splice(createdPartyIds.indexOf(originalContractor.id), 1);

    // The invoice (and its now-orphaned-looking snapshot) is untouched.
    const stillThere = await prisma.invoice.findUnique({
      where: { id: invoice.id },
    });
    expect(stillThere).not.toBeNull();
    expect((stillThere!.fromPartySnapshot as { name: string }).name).toBe(
      "[test] Snapshot Contractor",
    );
  });
});
