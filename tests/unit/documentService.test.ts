import { describe, expect, it, vi } from "vitest";
import { documentService } from "@/services/documentService";
import { partyRepository } from "@/repositories/partyRepository";
import { paymentMethodRepository } from "@/repositories/paymentMethodRepository";
import { encryptSecret } from "@/lib/crypto/settingsEncryption";
import { Prisma } from "@/generated/prisma/client";
import type { InvoiceWithItems } from "@/repositories/invoiceRepository";

function fakeInvoice(
  overrides: Partial<InvoiceWithItems> = {},
): InvoiceWithItems {
  return {
    id: "inv_1",
    projectId: "proj_1",
    invoiceNumber: "TQ-01",
    status: "SENT",
    issueDate: new Date("2026-01-01"),
    dueDate: new Date("2026-01-15"),
    periodStart: null,
    periodEnd: null,
    subtotal: new Prisma.Decimal("300"),
    total: new Prisma.Decimal("300"),
    currency: "USD",
    convertedTotal: new Prisma.Decimal("450"),
    convertedCurrency: "AUD",
    fromPartySnapshot: {
      name: "Acme Robotics",
      email: "billing@acme.example",
      street1: "1 Main St",
      street2: null,
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
      country: "USA",
    },
    toPartySnapshot: {
      name: "Client Co",
      email: null,
      street1: null,
      street2: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
    },
    // M17.5 — stored encrypted, same as the real
    // Invoice.paymentDetailsSnapshot column since it's copied verbatim from
    // the now-encrypted PaymentMethod.fields.
    paymentDetailsSnapshot: [
      {
        key: "bank_name",
        label: "Bank Name",
        value: encryptSecret("Test Bank"),
      },
    ],
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    itemsNote: null,
    bottomNote: null,
    items: [
      {
        id: "item_1",
        invoiceId: "inv_1",
        description: "Consulting",
        isFlatAmount: false,
        isReferralCredit: false,
        quantity: new Prisma.Decimal("2"),
        unitPrice: new Prisma.Decimal("150"),
        amount: new Prisma.Decimal("300"),
        durationText: null,
        sortOrder: 0,
      },
    ],
    project: {
      id: "proj_1",
      name: "Acme Ongoing Support",
      serviceDescription: "Software Development Services",
    } as InvoiceWithItems["project"],
    ...overrides,
  } satisfies InvoiceWithItems;
}

describe("documentService.assembleInvoiceDocumentData", () => {
  it("maps snapshot fields and computed totals into the shared view model", () => {
    const data = documentService.assembleInvoiceDocumentData(fakeInvoice());

    expect(data.invoiceNumber).toBe("TQ-01");
    expect(data.serviceDescription).toBe("Software Development Services");
    expect(data.contractor).toMatchObject({ name: "Acme Robotics" });
    expect(data.client).toMatchObject({ name: "Client Co" });
    expect(data.paymentDetails).toEqual([
      { key: "bank_name", label: "Bank Name", value: "Test Bank" },
    ]);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({
      description: "Consulting",
      amount: "300",
    });
    expect(data.subtotal).toBe("300");
    expect(data.total).toBe("300");
    expect(data.currency).toBe("USD");
    expect(data.convertedTotal).toBe("450");
    expect(data.convertedCurrency).toBe("AUD");
  });

  it("exposes itemsNote/bottomNote and per-item isFlatAmount/nullable quantity-unitPrice (M14)", () => {
    const data = documentService.assembleInvoiceDocumentData(
      fakeInvoice({
        itemsNote: "Work done Jun 1 - Jun 30",
        bottomNote: "Includes arrears from May",
        items: [
          {
            id: "item_1",
            invoiceId: "inv_1",
            description: "Retainer",
            isFlatAmount: true,
            isReferralCredit: false,
            quantity: null,
            unitPrice: null,
            amount: new Prisma.Decimal("500"),
            durationText: "Fixed",
            sortOrder: 0,
          },
        ],
      }),
    );

    expect(data.itemsNote).toBe("Work done Jun 1 - Jun 30");
    expect(data.bottomNote).toBe("Includes arrears from May");
    expect(data.items[0]).toMatchObject({
      isFlatAmount: true,
      quantity: null,
      unitPrice: null,
      amount: "500",
      durationText: "Fixed",
    });
  });

  it("computes allItemsFlat: false when the invoice has any Hourly item (M48)", () => {
    const data = documentService.assembleInvoiceDocumentData(fakeInvoice());
    expect(data.allItemsFlat).toBe(false);
  });

  it("computes allItemsFlat: true when every item is Flat-amount (M48)", () => {
    const data = documentService.assembleInvoiceDocumentData(
      fakeInvoice({
        items: [
          {
            id: "item_1",
            invoiceId: "inv_1",
            description: "Retainer",
            isFlatAmount: true,
            isReferralCredit: false,
            quantity: null,
            unitPrice: null,
            amount: new Prisma.Decimal("500"),
            durationText: "Fixed",
            sortOrder: 0,
          },
        ],
      }),
    );
    expect(data.allItemsFlat).toBe(true);
  });

  it("computes allItemsFlat: true for an all-Flat invoice that also has a referral-credit row (M48)", () => {
    const data = documentService.assembleInvoiceDocumentData(
      fakeInvoice({
        items: [
          {
            id: "item_1",
            invoiceId: "inv_1",
            description: "Retainer",
            isFlatAmount: true,
            isReferralCredit: false,
            quantity: null,
            unitPrice: null,
            amount: new Prisma.Decimal("500"),
            durationText: "Fixed",
            sortOrder: 0,
          },
          {
            id: "item_credit",
            invoiceId: "inv_1",
            description: "Referral Credit (Thank you!)",
            isFlatAmount: true,
            isReferralCredit: true,
            quantity: null,
            unitPrice: null,
            amount: new Prisma.Decimal("-50"),
            durationText: null,
            sortOrder: 1,
          },
        ],
      }),
    );
    expect(data.allItemsFlat).toBe(true);
    const creditItem = data.items.find((item) => item.isReferralCredit);
    expect(creditItem?.durationText).toBeNull();
  });

  it("falls back to the project name when serviceDescription is unset (M23)", () => {
    const data = documentService.assembleInvoiceDocumentData(
      fakeInvoice({
        project: {
          id: "proj_1",
          name: "Acme Ongoing Support",
          serviceDescription: null,
        } as InvoiceWithItems["project"],
      }),
    );
    expect(data.serviceDescription).toBe("Acme Ongoing Support");
  });

  it("M35 — always renders a referral-credit row last, regardless of its stored sortOrder", () => {
    const data = documentService.assembleInvoiceDocumentData(
      fakeInvoice({
        items: [
          {
            id: "item_credit",
            invoiceId: "inv_1",
            description: "Referral Credit (Thank you!)",
            isFlatAmount: true,
            isReferralCredit: true,
            quantity: null,
            unitPrice: null,
            amount: new Prisma.Decimal("-150"),
            durationText: null,
            sortOrder: 0,
          },
          {
            id: "item_work",
            invoiceId: "inv_1",
            description: "Consulting",
            isFlatAmount: false,
            isReferralCredit: false,
            quantity: new Prisma.Decimal("2"),
            unitPrice: new Prisma.Decimal("150"),
            amount: new Prisma.Decimal("300"),
            durationText: null,
            sortOrder: 1,
          },
        ],
      }),
    );

    expect(data.items.map((item) => item.description)).toEqual([
      "Consulting",
      "Referral Credit (Thank you!)",
    ]);
  });

  it("returns null itemsNote/bottomNote when neither is set", () => {
    const data = documentService.assembleInvoiceDocumentData(
      fakeInvoice({ itemsNote: null, bottomNote: null }),
    );
    expect(data.itemsNote).toBeNull();
    expect(data.bottomNote).toBeNull();
  });

  it("returns null convertedTotal/convertedCurrency when the invoice has neither", () => {
    const data = documentService.assembleInvoiceDocumentData(
      fakeInvoice({ convertedTotal: null, convertedCurrency: null }),
    );
    expect(data.convertedTotal).toBeNull();
    expect(data.convertedCurrency).toBeNull();
  });

  it("decrypts paymentDetailsSnapshot values for rendering (M17.5) — the raw invoice column stays encrypted", () => {
    const encryptedValue = encryptSecret("Test Bank");
    const invoice = fakeInvoice({
      paymentDetailsSnapshot: [
        { key: "bank_name", label: "Bank Name", value: encryptedValue },
      ],
    });

    const data = documentService.assembleInvoiceDocumentData(invoice);

    expect(data.paymentDetails).toEqual([
      { key: "bank_name", label: "Bank Name", value: "Test Bank" },
    ]);
    expect(encryptedValue).not.toBe("Test Bank");
  });

  it("passes through an empty paymentDetailsSnapshot unchanged (M17.2 — no payment method on file)", () => {
    const data = documentService.assembleInvoiceDocumentData(
      fakeInvoice({ paymentDetailsSnapshot: [] }),
    );
    expect(data.paymentDetails).toEqual([]);
  });

  it("never queries partyRepository or paymentMethodRepository — sources exclusively from the invoice's own snapshot fields", () => {
    const partySpy = vi.spyOn(partyRepository, "findById");
    const paymentMethodSpy = vi.spyOn(paymentMethodRepository, "findById");

    documentService.assembleInvoiceDocumentData(fakeInvoice());

    expect(partySpy).not.toHaveBeenCalled();
    expect(paymentMethodSpy).not.toHaveBeenCalled();

    partySpy.mockRestore();
    paymentMethodSpy.mockRestore();
  });
});
