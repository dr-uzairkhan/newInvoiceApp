import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderInvoicePdf } from "@/lib/pdf/renderInvoicePdf";
import type { InvoiceDocumentData } from "@/services/documentService";

function fakeData(
  overrides: Partial<InvoiceDocumentData> = {},
): InvoiceDocumentData {
  return {
    invoiceNumber: "TQ-01",
    status: "SENT",
    issueDate: new Date("2026-01-01"),
    dueDate: new Date("2026-01-15"),
    serviceDescription: "Acme Ongoing Support",
    contractor: {
      name: "Acme Robotics",
      email: "billing@acme.example",
      street1: "1 Main St",
      street2: null,
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
      country: "USA",
    },
    client: {
      name: "Client Co",
      email: null,
      street1: null,
      street2: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
    },
    paymentDetails: [
      { key: "bank_name", label: "Bank Name", value: "Test Bank" },
      {
        key: "routing_number",
        label: "Routing Number (ABA)",
        value: "021000021",
      },
    ],
    items: [
      {
        id: "item_1",
        description: "Consulting",
        isFlatAmount: false,
        isReferralCredit: false,
        quantity: "2",
        unitPrice: "150",
        amount: "300",
        durationText: null,
      },
    ],
    allItemsFlat: false,
    itemsNote: null,
    subtotal: "300",
    total: "300",
    currency: "USD",
    convertedTotal: null,
    convertedCurrency: null,
    bottomNote: null,
    ...overrides,
  };
}

describe("renderInvoicePdf", () => {
  it("produces a non-empty %PDF-prefixed buffer for a DRAFT-shaped invoice without throwing", async () => {
    const buffer = await renderInvoicePdf(fakeData({ status: "DRAFT" }));
    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(Buffer.from(buffer.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });

  it("produces a buffer for a SENT invoice with a converted total without throwing", async () => {
    const buffer = await renderInvoicePdf(
      fakeData({ convertedTotal: "450", convertedCurrency: "AUD" }),
    );
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("renders a flat-amount item's dash cells without throwing when mixed with an Hourly item", async () => {
    const buffer = await renderInvoicePdf(
      fakeData({
        items: [
          {
            id: "item_1",
            description: "Consulting",
            isFlatAmount: false,
            isReferralCredit: false,
            quantity: "2",
            unitPrice: "150",
            amount: "300",
            durationText: null,
          },
          {
            id: "item_2",
            description: "Retainer",
            isFlatAmount: true,
            isReferralCredit: false,
            quantity: null,
            unitPrice: null,
            amount: "500",
            durationText: "Fixed",
          },
        ],
        allItemsFlat: false,
        subtotal: "800",
        total: "800",
      }),
    );
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("renders the single Duration column (M48) without throwing when every item is Flat-amount", async () => {
    const buffer = await renderInvoicePdf(
      fakeData({
        items: [
          {
            id: "item_1",
            description: "Retainer",
            isFlatAmount: true,
            isReferralCredit: false,
            quantity: null,
            unitPrice: null,
            amount: "500",
            durationText: "Fixed",
          },
        ],
        allItemsFlat: true,
        subtotal: "500",
        total: "500",
      }),
    );
    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(Buffer.from(buffer.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });

  it("wraps a long description without throwing", async () => {
    const buffer = await renderInvoicePdf(
      fakeData({
        items: [
          {
            id: "item_1",
            description:
              "A very long line item description intended to exceed the description column's width and force the greedy word-wrap helper to break it across multiple lines within a single table row",
            isFlatAmount: false,
            isReferralCredit: false,
            quantity: "1",
            unitPrice: "300",
            amount: "300",
            durationText: null,
          },
        ],
        itemsNote:
          "An equally long items note that should also wrap across multiple lines below the item table without throwing any errors",
        bottomNote:
          "A long bottom note value that should wrap within the remaining width next to its label without throwing",
      }),
    );
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("round-trips through PDFDocument.load() with a sane page count, and starts a new page for a long item list", async () => {
    const singlePage = await renderInvoicePdf(fakeData());
    const singlePageDoc = await PDFDocument.load(singlePage);
    expect(singlePageDoc.getPageCount()).toBe(1);

    const manyItems = await renderInvoicePdf(
      fakeData({
        items: Array.from({ length: 40 }, (_, i) => ({
          id: `item_${i}`,
          description: `Consulting services rendered during week ${i + 1} of the engagement`,
          isFlatAmount: false,
          isReferralCredit: false,
          quantity: "10",
          unitPrice: "150",
          amount: "1500",
          durationText: null,
        })),
      }),
    );
    const manyItemsDoc = await PDFDocument.load(manyItems);
    expect(manyItemsDoc.getPageCount()).toBeGreaterThan(1);
  });

  it("renders non-$ currency labels (AED/GBP/PKR) without throwing — pdf-lib's standard fonts are WinAnsi-encoded", async () => {
    for (const currency of ["AED", "GBP", "PKR", "NZD", "SAR"]) {
      const buffer = await renderInvoicePdf(fakeData({ currency }));
      expect(buffer.byteLength).toBeGreaterThan(0);
    }
  });
});
