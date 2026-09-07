import { describe, expect, it } from "vitest";
import { invoiceSchema } from "@/lib/validation/invoice";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    invoiceNumber: "TQ-01",
    issueDate: "2026-01-01",
    dueDate: "2026-01-15",
    convertedTotal: "",
    items: [
      {
        description: "Consulting",
        isFlatAmount: false,
        quantity: "1",
        unitPrice: "100",
        amount: "",
        durationText: "",
      },
    ],
    ...overrides,
  };
}

describe("invoiceSchema", () => {
  it("accepts a fully valid draft input", () => {
    expect(invoiceSchema.safeParse(baseInput()).success).toBe(true);
  });

  it("rejects an empty items array — at least one line item is required", () => {
    const result = invoiceSchema.safeParse(baseInput({ items: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects a quantity of 0 or less", () => {
    const result = invoiceSchema.safeParse(
      baseInput({
        items: [
          {
            description: "X",
            isFlatAmount: false,
            quantity: "0",
            unitPrice: "10",
            amount: "",
            durationText: "",
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a negative unit price", () => {
    const result = invoiceSchema.safeParse(
      baseInput({
        items: [
          {
            description: "X",
            isFlatAmount: false,
            quantity: "1",
            unitPrice: "-5",
            amount: "",
            durationText: "",
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a zero unit price (free line items are allowed)", () => {
    const result = invoiceSchema.safeParse(
      baseInput({
        items: [
          {
            description: "Free",
            isFlatAmount: false,
            quantity: "1",
            unitPrice: "0",
            amount: "",
            durationText: "",
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a Flat-mode item with amount but no quantity/unitPrice", () => {
    const result = invoiceSchema.safeParse(
      baseInput({
        items: [
          {
            description: "Retainer",
            isFlatAmount: true,
            quantity: "",
            unitPrice: "",
            amount: "1125",
            durationText: "Fixed",
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a Flat-mode item missing amount", () => {
    const result = invoiceSchema.safeParse(
      baseInput({
        items: [
          {
            description: "Retainer",
            isFlatAmount: true,
            quantity: "",
            unitPrice: "",
            amount: "",
            durationText: "Fixed",
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a Flat-mode item missing durationText (M48)", () => {
    const result = invoiceSchema.safeParse(
      baseInput({
        items: [
          {
            description: "Retainer",
            isFlatAmount: true,
            quantity: "",
            unitPrice: "",
            amount: "1125",
            durationText: "",
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("does not require durationText for an Hourly-mode item (M48)", () => {
    const result = invoiceSchema.safeParse(
      baseInput({
        items: [
          {
            description: "Hourly work",
            isFlatAmount: false,
            quantity: "2",
            unitPrice: "100",
            amount: "",
            durationText: "",
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects an Hourly-mode item missing quantity or unitPrice", () => {
    const missingQuantity = invoiceSchema.safeParse(
      baseInput({
        items: [
          {
            description: "X",
            isFlatAmount: false,
            quantity: "",
            unitPrice: "100",
            amount: "",
            durationText: "",
          },
        ],
      }),
    );
    expect(missingQuantity.success).toBe(false);

    const missingUnitPrice = invoiceSchema.safeParse(
      baseInput({
        items: [
          {
            description: "X",
            isFlatAmount: false,
            quantity: "1",
            unitPrice: "",
            amount: "",
            durationText: "",
          },
        ],
      }),
    );
    expect(missingUnitPrice.success).toBe(false);
  });

  it("accepts a mixed invoice with both an Hourly and a Flat item", () => {
    const result = invoiceSchema.safeParse(
      baseInput({
        items: [
          {
            description: "Hourly work",
            isFlatAmount: false,
            quantity: "2",
            unitPrice: "100",
            amount: "",
            durationText: "",
          },
          {
            description: "Retainer",
            isFlatAmount: true,
            quantity: "",
            unitPrice: "",
            amount: "500",
            durationText: "Fixed",
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a missing invoice number", () => {
    const result = invoiceSchema.safeParse(baseInput({ invoiceNumber: "" }));
    expect(result.success).toBe(false);
  });

  it("does not require convertedTotal even when blank", () => {
    const result = invoiceSchema.safeParse(baseInput({ convertedTotal: "" }));
    expect(result.success).toBe(true);
  });

  it("rejects a non-numeric convertedTotal", () => {
    const result = invoiceSchema.safeParse(
      baseInput({ convertedTotal: "abc" }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a referral-credit item with a positive magnitude, no quantity/unitPrice", () => {
    const result = invoiceSchema.safeParse(
      baseInput({
        items: [
          {
            description: "Consulting",
            isFlatAmount: false,
            quantity: "1",
            unitPrice: "100",
            amount: "",
            durationText: "",
          },
          {
            description: "Referral Credit (Thank you!)",
            isFlatAmount: true,
            isReferralCredit: true,
            quantity: "",
            unitPrice: "",
            amount: "150",
            durationText: "",
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a zero-amount referral-credit item at draft-save time (blocked only at send)", () => {
    const result = invoiceSchema.safeParse(
      baseInput({
        items: [
          {
            description: "Referral Credit (Thank you!)",
            isFlatAmount: true,
            isReferralCredit: true,
            quantity: "",
            unitPrice: "",
            amount: "0",
            durationText: "",
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a negative referral-credit amount — the user only ever types a positive magnitude", () => {
    const result = invoiceSchema.safeParse(
      baseInput({
        items: [
          {
            description: "Referral Credit (Thank you!)",
            isFlatAmount: true,
            isReferralCredit: true,
            quantity: "",
            unitPrice: "",
            amount: "-150",
            durationText: "",
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a second referral-credit item on the same invoice", () => {
    const result = invoiceSchema.safeParse(
      baseInput({
        items: [
          {
            description: "Referral Credit (Thank you!)",
            isFlatAmount: true,
            isReferralCredit: true,
            quantity: "",
            unitPrice: "",
            amount: "100",
            durationText: "",
          },
          {
            description: "Another Referral Credit",
            isFlatAmount: true,
            isReferralCredit: true,
            quantity: "",
            unitPrice: "",
            amount: "50",
            durationText: "",
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a valid periodStart/periodEnd range (M39)", () => {
    const result = invoiceSchema.safeParse(
      baseInput({ periodStart: "2026-01-01", periodEnd: "2026-01-31" }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts both period fields left blank (M39)", () => {
    const result = invoiceSchema.safeParse(
      baseInput({ periodStart: "", periodEnd: "" }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts only one of periodStart/periodEnd set (M39)", () => {
    const result = invoiceSchema.safeParse(
      baseInput({ periodStart: "2026-01-01", periodEnd: "" }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects periodEnd before periodStart (M39)", () => {
    const result = invoiceSchema.safeParse(
      baseInput({ periodStart: "2026-01-31", periodEnd: "2026-01-01" }),
    );
    expect(result.success).toBe(false);
  });
});
