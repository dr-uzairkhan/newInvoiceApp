/**
 * Story 10.1 seed data: 1 contractor party, 1 client party, 1 payment method,
 * 1 project, 1 draft invoice, 1 sent invoice, 1 paid invoice. Safe demo data
 * only — no real banking/client-sensitive information, no tax, no logos.
 *
 * Idempotent: clears prior seed rows first, so `prisma db seed` always
 * produces exactly this shape regardless of how many times it's run.
 */
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

/** A seeded party's snapshot shows its (single, default) seeded address, flattened the way invoiceService stores it. */
function partySnapshot(party: {
  name: string;
  email: string | null;
  addresses: {
    street1: string | null;
    street2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  }[];
}) {
  const address = party.addresses.find(Boolean) ?? null;
  return {
    name: party.name,
    email: party.email,
    street1: address?.street1 ?? null,
    street2: address?.street2 ?? null,
    city: address?.city ?? null,
    state: address?.state ?? null,
    postalCode: address?.postalCode ?? null,
    country: address?.country ?? null,
  };
}

async function main() {
  // Clear prior seed data (FK-safe order: children before parents).
  await prisma.invoice.deleteMany();
  await prisma.project.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.party.deleteMany();

  const contractor = await prisma.party.create({
    data: {
      name: "Northwind Consulting LLC",
      email: "billing@northwindconsulting.example",
      type: "ORGANIZATION",
      addresses: {
        create: {
          label: "Primary",
          isDefault: true,
          street1: "500 Harbor Blvd",
          street2: "Suite 220",
          city: "Alameda",
          state: "CA",
          postalCode: "94501",
          country: "USA",
        },
      },
    },
    include: { addresses: true },
  });

  const client = await prisma.party.create({
    data: {
      name: "Acme Robotics Inc.",
      email: "accounts@acmerobotics.example",
      type: "ORGANIZATION",
      addresses: {
        create: {
          label: "Primary",
          isDefault: true,
          street1: "88 Innovation Way",
          city: "Austin",
          state: "TX",
          postalCode: "78701",
          country: "USA",
        },
      },
    },
    include: { addresses: true },
  });

  const paymentMethodFields = [
    { key: "bank_name", label: "Bank Name", value: "First Harbor Bank" },
    {
      key: "routing_number",
      label: "Routing Number (ABA)",
      value: "071000288",
    },
    { key: "account_number", label: "Account Number", value: "000123456789" },
  ];

  const paymentMethod = await prisma.paymentMethod.create({
    data: {
      partyId: contractor.id,
      type: "BANK_WIRE",
      label: "Primary Checking",
      isDefault: true,
      fields: paymentMethodFields,
    },
  });

  const project = await prisma.project.create({
    data: {
      name: "Acme Robotics — Ongoing Support",
      abbreviation: "ARS",
      clientId: client.id,
      contractorId: contractor.id,
      preferredPaymentMethodId: paymentMethod.id,
      invoiceNumberFormat: "{abbreviation}-{number}-{date}",
      displayCurrency: "USD",
      status: "ACTIVE",
    },
  });

  const fromPartySnapshot = partySnapshot(contractor);
  const toPartySnapshot = partySnapshot(client);

  await prisma.invoice.create({
    data: {
      projectId: project.id,
      invoiceNumber: "ARS-01-07082026",
      status: "DRAFT",
      issueDate: new Date("2026-07-08"),
      dueDate: new Date("2026-08-07"),
      subtotal: "7200.00",
      total: "7200.00",
      fromPartySnapshot,
      toPartySnapshot,
      paymentDetailsSnapshot: paymentMethodFields,
      items: {
        create: [
          {
            description: "Q3 platform integration — phase 1",
            quantity: "40.00",
            unitPrice: "150.00",
            amount: "6000.00",
            sortOrder: 0,
          },
          {
            description: "Environment setup & onboarding",
            quantity: "8.00",
            unitPrice: "150.00",
            amount: "1200.00",
            sortOrder: 1,
          },
        ],
      },
    },
  });

  await prisma.invoice.create({
    data: {
      projectId: project.id,
      invoiceNumber: "ARS-02-06012026",
      status: "SENT",
      issueDate: new Date("2026-06-01"),
      dueDate: new Date("2026-07-01"),
      subtotal: "26100.00",
      total: "26100.00",
      fromPartySnapshot,
      toPartySnapshot,
      paymentDetailsSnapshot: paymentMethodFields,
      items: {
        create: [
          {
            description: "Q2 sprint delivery — weeks 1-4",
            quantity: "160.00",
            unitPrice: "145.00",
            amount: "23200.00",
            sortOrder: 0,
          },
          {
            description: "Code review & QA support",
            quantity: "20.00",
            unitPrice: "145.00",
            amount: "2900.00",
            sortOrder: 1,
          },
        ],
      },
    },
  });

  await prisma.invoice.create({
    data: {
      projectId: project.id,
      invoiceNumber: "ARS-03-05012026",
      status: "PAID",
      issueDate: new Date("2026-05-01"),
      dueDate: new Date("2026-05-31"),
      subtotal: "9000.00",
      total: "9000.00",
      fromPartySnapshot,
      toPartySnapshot,
      paymentDetailsSnapshot: paymentMethodFields,
      items: {
        create: [
          {
            description: "Initial project setup & discovery",
            quantity: "1.00",
            unitPrice: "4000.00",
            amount: "4000.00",
            sortOrder: 0,
          },
          {
            description: "First month retainer",
            quantity: "1.00",
            unitPrice: "5000.00",
            amount: "5000.00",
            sortOrder: 1,
          },
        ],
      },
    },
  });

  console.log("Seed complete:", {
    parties: 2,
    paymentMethods: 1,
    projects: 1,
    invoices: 3,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
