import { describe, expect, it } from "vitest";
import {
  applyInvoiceNumberTokens,
  getInvoiceNumberTokenReference,
  getNumberScope,
} from "@/lib/invoiceNumberFormat";

describe("applyInvoiceNumberTokens", () => {
  const date = new Date("2026-08-31T12:00:00Z");

  it("substitutes every supported token", () => {
    const result = applyInvoiceNumberTokens(
      "{abbreviation}-{number}-{year}-{year_short}-{month}-{day}",
      { abbreviation: "ACM", number: "03", date },
    );
    expect(result).toBe("ACM-03-2026-26-08-31");
  });

  it("substitutes scoped {number} tokens exactly like a bare {number}", () => {
    expect(
      applyInvoiceNumberTokens("{number}|{number:month}|{number:year}", {
        abbreviation: "ACM",
        number: "03",
        date,
      }),
    ).toBe("03|03|03");
  });

  it("substitutes month-name tokens in the three shapes", () => {
    expect(
      applyInvoiceNumberTokens("{month:MMM}/{month:Mmm}/{month:MMMM}", {
        abbreviation: "ACM",
        number: "03",
        date,
      }),
    ).toBe("AUG/Aug/AUGUST");
  });

  it("defaults {date} to MM-DD-YYYY", () => {
    const result = applyInvoiceNumberTokens("{date}", {
      abbreviation: "ACM",
      number: "03",
      date,
    });
    expect(result).toBe("08-31-2026");
  });

  it("supports every explicit {date:...} shape", () => {
    const values = { abbreviation: "ACM", number: "03", date };
    expect(applyInvoiceNumberTokens("{date:MM-DD-YYYY}", values)).toBe(
      "08-31-2026",
    );
    expect(applyInvoiceNumberTokens("{date:DD-MM-YYYY}", values)).toBe(
      "31-08-2026",
    );
    expect(applyInvoiceNumberTokens("{date:MM/DD/YYYY}", values)).toBe(
      "08/31/2026",
    );
    expect(applyInvoiceNumberTokens("{date:DD/MM/YYYY}", values)).toBe(
      "31/08/2026",
    );
  });

  it("resolves date fields in UTC, so a late-evening UTC timestamp keeps its calendar day", () => {
    const lateEvening = new Date("2026-12-31T23:59:00Z");
    expect(
      applyInvoiceNumberTokens("{year}-{month}-{day}", {
        abbreviation: "ACM",
        number: "01",
        date: lateEvening,
      }),
    ).toBe("2026-12-31");
  });

  it("keeps non-token characters literal", () => {
    const result = applyInvoiceNumberTokens("INV/{abbreviation}/{number}", {
      abbreviation: "ACM",
      number: "03",
      date,
    });
    expect(result).toBe("INV/ACM/03");
  });

  it("returns the format unchanged when it has no recognized tokens", () => {
    expect(
      applyInvoiceNumberTokens("plain-text {unknown}", {
        abbreviation: "ACM",
        number: "03",
        date,
      }),
    ).toBe("plain-text {unknown}");
  });
});

describe("getNumberScope", () => {
  it("reads the {number} token's reset scope, defaulting to project-wide", () => {
    expect(getNumberScope("{abbreviation}-{number}")).toBe("project");
    expect(getNumberScope("{abbreviation}-{number:month}")).toBe("month");
    expect(getNumberScope("{abbreviation}-{year}-{number:year}")).toBe("year");
    expect(getNumberScope("{date}")).toBe("project");
  });
});

describe("getInvoiceNumberTokenReference", () => {
  const date = new Date("2026-08-31T12:00:00Z");

  it("lists exactly the tokens applyInvoiceNumberTokens recognizes", () => {
    const reference = getInvoiceNumberTokenReference(date);
    const tokens = reference.map((entry) => entry.token);
    expect(tokens).toEqual([
      "{abbreviation}",
      "{number}",
      "{number:month}",
      "{number:year}",
      "{year}",
      "{year_short}",
      "{month}",
      "{month:MMM}",
      "{month:Mmm}",
      "{month:MMMM}",
      "{day}",
      "{date}",
      "{date:MM-DD-YYYY}",
      "{date:DD-MM-YYYY}",
      "{date:MM/DD/YYYY}",
      "{date:DD/MM/YYYY}",
    ]);
    // Every listed token must be consumed by the substitution (none left literal).
    for (const token of tokens) {
      expect(
        applyInvoiceNumberTokens(token, { abbreviation: "A", number: "1", date }),
      ).not.toBe(token);
    }
  });

  it("resolves each sample against the given date, matching applyInvoiceNumberTokens directly", () => {
    const reference = getInvoiceNumberTokenReference(date);
    for (const entry of reference) {
      if (entry.token === "{abbreviation}" || entry.token.startsWith("{number")) {
        continue; // Illustrative, not date-derived.
      }
      const resolved = applyInvoiceNumberTokens(entry.token, {
        abbreviation: "ACM",
        number: "01",
        date,
      });
      expect(entry.sample).toBe(resolved);
    }
  });

  it("defaults to today when no date is passed", () => {
    expect(() => getInvoiceNumberTokenReference()).not.toThrow();
  });
});
