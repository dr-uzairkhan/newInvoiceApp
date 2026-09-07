import { describe, expect, it } from "vitest";
import {
  partySuggestionSchema,
  paymentMethodSuggestionSchema,
  invoiceSuggestionSchema,
  invoiceAssistResponseSchema,
} from "@/lib/validation/aiSuggestions";

describe("aiSuggestions schemas", () => {
  it("accepts an empty object (assistant confident about nothing)", () => {
    expect(partySuggestionSchema.safeParse({}).success).toBe(true);
    expect(paymentMethodSuggestionSchema.safeParse({}).success).toBe(true);
    expect(invoiceSuggestionSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a partial party suggestion missing required-on-submit fields", () => {
    const result = partySuggestionSchema.safeParse({ name: "Acme Robotics" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid party type even when partial", () => {
    const result = partySuggestionSchema.safeParse({ type: "NOT_A_TYPE" });
    expect(result.success).toBe(false);
  });

  it("requires every key of a fields[] entry when fields is present", () => {
    const missingValue = paymentMethodSuggestionSchema.safeParse({
      fields: [{ key: "iban", label: "IBAN" }],
    });
    expect(missingValue.success).toBe(false);

    const complete = paymentMethodSuggestionSchema.safeParse({
      fields: [{ key: "iban", label: "IBAN", value: "DE1234" }],
    });
    expect(complete.success).toBe(true);
  });

  it("requires every key of an items[] entry when items is present — invoiceItemSchema isn't itself partialed", () => {
    const missingUnitPrice = invoiceSuggestionSchema.safeParse({
      items: [
        {
          description: "Consulting",
          isFlatAmount: false,
          quantity: "3",
          unitPrice: "",
          amount: "",
          durationText: "",
        },
      ],
    });
    expect(missingUnitPrice.success).toBe(false);

    const complete = invoiceSuggestionSchema.safeParse({
      items: [
        {
          description: "Consulting",
          isFlatAmount: false,
          quantity: "3",
          unitPrice: "150",
          amount: "",
          durationText: "",
        },
      ],
    });
    expect(complete.success).toBe(true);
  });

  it("accepts a Flat-mode item suggestion (amount, no quantity/unitPrice, non-empty durationText)", () => {
    const result = invoiceSuggestionSchema.safeParse({
      items: [
        {
          description: "Retainer",
          isFlatAmount: true,
          quantity: "",
          unitPrice: "",
          amount: "500",
          durationText: "Fixed",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a Flat-mode item suggestion missing durationText (M48)", () => {
    const result = invoiceSuggestionSchema.safeParse({
      items: [
        {
          description: "Retainer",
          isFlatAmount: true,
          quantity: "",
          unitPrice: "",
          amount: "500",
          durationText: "",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("invoiceAssistResponseSchema", () => {
  it("accepts a suggestion-shaped response", () => {
    const result = invoiceAssistResponseSchema.safeParse({
      responseType: "suggestion",
      suggestion: { itemsNote: "July work" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a clarification-shaped response", () => {
    const result = invoiceAssistResponseSchema.safeParse({
      responseType: "clarification",
      question: "What's the rate for the third line item?",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a clarification with an empty question", () => {
    const result = invoiceAssistResponseSchema.safeParse({
      responseType: "clarification",
      question: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a suggestion whose nested items entry is invalid, same as invoiceSuggestionSchema alone", () => {
    const result = invoiceAssistResponseSchema.safeParse({
      responseType: "suggestion",
      suggestion: {
        items: [
          {
            description: "Consulting",
            isFlatAmount: false,
            quantity: "3",
            unitPrice: "",
            amount: "",
            durationText: "",
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized responseType", () => {
    const result = invoiceAssistResponseSchema.safeParse({
      responseType: "something-else",
    });
    expect(result.success).toBe(false);
  });
});
