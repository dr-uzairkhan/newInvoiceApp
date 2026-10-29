import { describe, expect, it } from "vitest";
import {
  extractSequence,
  fitsAnyFormat,
  fitsFormat,
  generateInvoiceNumber,
  nextSequence,
  type ExistingInvoiceNumber,
} from "@/services/invoiceNumberService";

/** Existing invoices as the sequence computation sees them — issue dates default to the same month unless a test says otherwise. */
function existing(
  numbers: string[],
  issueDate = new Date("2026-07-01T00:00:00.000Z"),
): ExistingInvoiceNumber[] {
  return numbers.map((invoiceNumber) => ({ invoiceNumber, issueDate }));
}

const JULY_9 = new Date("2026-07-09T00:00:00.000Z");
const JAN_5 = new Date("2026-01-05T00:00:00.000Z");

describe("invoiceNumberService.generateInvoiceNumber", () => {
  it("substitutes {abbreviation}, {number}, and {date} in order", () => {
    const result = generateInvoiceNumber({
      project: {
        abbreviation: "TQ",
        name: "Torque Gears",
        invoiceNumberFormat: "{abbreviation}-{number}-{date}",
      },
      existingInvoices: [],
      issueDate: JULY_9,
    });

    expect(result).toBe("TQ-01-07-09-2026");
  });

  it("substitutes tokens in a different literal arrangement", () => {
    const result = generateInvoiceNumber({
      project: {
        abbreviation: "TQ",
        name: "Torque Gears",
        invoiceNumberFormat: "{abbreviation}-{date}/{number}",
      },
      existingInvoices: [],
      issueDate: JULY_9,
    });

    expect(result).toBe("TQ-07-09-2026/01");
  });

  it("falls back to auto-derived initials when Project.abbreviation is blank", () => {
    const result = generateInvoiceNumber({
      project: {
        abbreviation: null,
        name: "Torque Gears",
        invoiceNumberFormat: "{abbreviation}-{number}",
      },
      existingInvoices: [],
    });

    expect(result).toBe("TG-01");
  });

  it("defaults {date} to MM-DD-YYYY", () => {
    const result = generateInvoiceNumber({
      project: {
        abbreviation: "TQ",
        name: "Torque",
        invoiceNumberFormat: "{date}",
      },
      existingInvoices: [],
      issueDate: JAN_5,
    });

    expect(result).toBe("01-05-2026");
  });

  it("substitutes {year} as a standalone 4-digit token, independent of {date}", () => {
    const result = generateInvoiceNumber({
      project: {
        abbreviation: "TQ",
        name: "Torque",
        invoiceNumberFormat: "{abbreviation}-{year}-{number}",
      },
      existingInvoices: [],
      issueDate: JULY_9,
    });

    expect(result).toBe("TQ-2026-01");
  });

  it("substitutes {year_short} as the last 2 digits of the year", () => {
    const result = generateInvoiceNumber({
      project: {
        abbreviation: "TQ",
        name: "Torque",
        invoiceNumberFormat: "{abbreviation}-{year_short}/G/{number}",
      },
      existingInvoices: [],
      issueDate: JULY_9,
    });

    expect(result).toBe("TQ-26/G/01");
  });

  it("substitutes {month} and {day} as zero-padded 2-digit values", () => {
    const result = generateInvoiceNumber({
      project: {
        abbreviation: "TQ",
        name: "Torque",
        invoiceNumberFormat: "{abbreviation}-{month}-{day}-{number}",
      },
      existingInvoices: [],
      issueDate: JAN_5,
    });

    expect(result).toBe("TQ-01-05-01");
  });

  it("substitutes month names in the three supported shapes", () => {
    const project = { abbreviation: "AB", name: "Alpha Beta" };
    const october = new Date("2026-10-29T00:00:00.000Z");

    expect(
      generateInvoiceNumber({
        project: {
          ...project,
          invoiceNumberFormat: "{abbreviation}-{year}/{month:MMM}{number:month}",
        },
        existingInvoices: [],
        issueDate: october,
      }),
    ).toBe("AB-2026/OCT01");
    expect(
      generateInvoiceNumber({
        project: { ...project, invoiceNumberFormat: "{month:Mmm}-{number}" },
        existingInvoices: [],
        issueDate: october,
      }),
    ).toBe("Oct-01");
    expect(
      generateInvoiceNumber({
        project: { ...project, invoiceNumberFormat: "{month:MMMM}-{number}" },
        existingInvoices: [],
        issueDate: october,
      }),
    ).toBe("OCTOBER-01");
  });

  it("uses the three-letter standard abbreviation for September (SEP, never Sept)", () => {
    expect(
      generateInvoiceNumber({
        project: {
          abbreviation: "AB",
          name: "Alpha Beta",
          invoiceNumberFormat: "{month:MMM}{number:month}",
        },
        existingInvoices: [],
        issueDate: new Date("2026-09-15T00:00:00.000Z"),
      }),
    ).toBe("SEP01");
  });

  it("resolves date tokens from the issue date's UTC calendar fields, not the wall clock", () => {
    // 23:30 UTC on the 31st: a local-time implementation in a UTC+5 zone
    // would have read this as the 1st of the next month.
    const lateOnThe31st = new Date("2026-07-31T23:30:00.000Z");
    expect(
      generateInvoiceNumber({
        project: {
          abbreviation: "TQ",
          name: "Torque",
          invoiceNumberFormat: "{month}-{day}-{number}",
        },
        existingInvoices: [],
        issueDate: lateOnThe31st,
      }),
    ).toBe("07-31-01");
  });

  it("honors an explicit {date:DD-MM-YYYY} qualifier", () => {
    const result = generateInvoiceNumber({
      project: {
        abbreviation: "TQ",
        name: "Torque",
        invoiceNumberFormat: "{date:DD-MM-YYYY}",
      },
      existingInvoices: [],
      issueDate: JAN_5,
    });

    expect(result).toBe("05-01-2026");
  });

  it("honors an explicit {date:MM/DD/YYYY} qualifier", () => {
    const result = generateInvoiceNumber({
      project: {
        abbreviation: "TQ",
        name: "Torque",
        invoiceNumberFormat: "{date:MM/DD/YYYY}",
      },
      existingInvoices: [],
      issueDate: JAN_5,
    });

    expect(result).toBe("01/05/2026");
  });

  it("honors an explicit {date:DD/MM/YYYY} qualifier", () => {
    const result = generateInvoiceNumber({
      project: {
        abbreviation: "TQ",
        name: "Torque",
        invoiceNumberFormat: "{date:DD/MM/YYYY}",
      },
      existingInvoices: [],
      issueDate: JAN_5,
    });

    expect(result).toBe("05/01/2026");
  });

  it("zero-pads the sequence number to 2 digits by default", () => {
    const result = generateInvoiceNumber({
      project: {
        abbreviation: "TQ",
        name: "Torque",
        invoiceNumberFormat: "{abbreviation}-{number}",
      },
      existingInvoices: existing(["TQ-01", "TQ-02"]),
    });

    expect(result).toBe("TQ-03");
  });

  it("grows beyond 2 digits without truncation once the sequence reaches 100", () => {
    const result = generateInvoiceNumber({
      project: {
        abbreviation: "TQ",
        name: "Torque",
        invoiceNumberFormat: "{abbreviation}-{number}",
      },
      existingInvoices: existing(["TQ-99"]),
    });

    expect(result).toBe("TQ-100");
  });
});

describe("invoiceNumberService.nextSequence", () => {
  const FORMAT = "{abbreviation}-{number}";

  it("computes max(existing) + 1, not a count — a gap from a deleted invoice never causes a collision", () => {
    // Invoice "TQ-02" was deleted; only 01 and 05 remain. A count-based
    // approach would wrongly produce 3 here.
    expect(nextSequence(existing(["TQ-01", "TQ-05"]), FORMAT, JULY_9)).toBe(6);
  });

  it("starts at 1 when there are no existing invoice numbers", () => {
    expect(nextSequence([], FORMAT, JULY_9)).toBe(1);
  });

  it("ignores invoice numbers that don't parse against the format (e.g. manually edited, or a previous format)", () => {
    expect(
      nextSequence(
        existing(["TQ-01", "a completely custom string", "OLD-2025/41"]),
        FORMAT,
        JULY_9,
      ),
    ).toBe(2);
  });

  it("treats {year} as a wildcard when extracting the sequence, same as {date}", () => {
    expect(
      nextSequence(
        existing(["TQ-2026-01", "TQ-2026-02"]),
        "{abbreviation}-{year}-{number}",
        JULY_9,
      ),
    ).toBe(3);
  });

  it("treats {year_short}/{month}/{day} as wildcards when extracting the sequence", () => {
    expect(
      nextSequence(
        existing(["TQ-26/G/01", "TQ-26/G/02"]),
        "{abbreviation}-{year_short}/G/{number}",
        JULY_9,
      ),
    ).toBe(3);

    expect(
      nextSequence(
        existing(["TQ-01-05-01", "TQ-02-14-02"]),
        "{abbreviation}-{month}-{day}-{number}",
        JULY_9,
      ),
    ).toBe(3);
  });

  it("{number:month} counts only invoices issued in the same calendar month — by their issue dates, not by parsing month text", () => {
    const format = "{abbreviation}/{month:MMM}{number:month}";
    const rows: ExistingInvoiceNumber[] = [
      { invoiceNumber: "TQ/SEP01", issueDate: new Date("2026-09-03T00:00:00.000Z") },
      { invoiceNumber: "TQ/SEP02", issueDate: new Date("2026-09-20T00:00:00.000Z") },
      { invoiceNumber: "TQ/OCT01", issueDate: new Date("2026-10-02T00:00:00.000Z") },
      // Same month name, previous year — must not be counted for Oct 2026.
      { invoiceNumber: "TQ/OCT07", issueDate: new Date("2025-10-15T00:00:00.000Z") },
    ];

    expect(
      nextSequence(rows, format, new Date("2026-10-29T00:00:00.000Z")),
    ).toBe(2);
    expect(
      nextSequence(rows, format, new Date("2026-11-01T00:00:00.000Z")),
    ).toBe(1);
    expect(
      nextSequence(rows, format, new Date("2026-09-30T00:00:00.000Z")),
    ).toBe(3);
  });

  it("{number:year} counts only invoices issued in the same calendar year", () => {
    const format = "{abbreviation}-{year}-{number:year}";
    const rows: ExistingInvoiceNumber[] = [
      { invoiceNumber: "TQ-2025-11", issueDate: new Date("2025-12-20T00:00:00.000Z") },
      { invoiceNumber: "TQ-2026-01", issueDate: new Date("2026-01-10T00:00:00.000Z") },
    ];

    expect(
      nextSequence(rows, format, new Date("2026-06-01T00:00:00.000Z")),
    ).toBe(2);
    expect(
      nextSequence(rows, format, new Date("2027-01-01T00:00:00.000Z")),
    ).toBe(1);
  });

  it("plain {number} ignores issue dates entirely", () => {
    const rows: ExistingInvoiceNumber[] = [
      { invoiceNumber: "TQ-01", issueDate: new Date("2024-01-01T00:00:00.000Z") },
      { invoiceNumber: "TQ-02", issueDate: new Date("2026-10-01T00:00:00.000Z") },
    ];
    expect(nextSequence(rows, FORMAT, new Date("2026-10-29T00:00:00.000Z"))).toBe(3);
  });
});

describe("invoiceNumberService.fitsFormat / fitsAnyFormat / extractSequence", () => {
  it("recognises a number structurally generated from the format, with any {number} scope", () => {
    expect(fitsFormat("TQ-05", "{abbreviation}-{number}")).toBe(true);
    expect(fitsFormat("AB-2026/OCT01", "{abbreviation}-{year}/{month:MMM}{number:month}")).toBe(true);
    expect(fitsFormat("AB-2026/OCT01", "{abbreviation}-{number}")).toBe(false);
  });

  it("recognises a number against any of a project's current or previous formats", () => {
    const formats = [
      "{abbreviation}-{year}-{number}",
      "X-YZ-{date:DD/MM/YYYY}/{number}",
    ];
    expect(fitsAnyFormat("AB-2026-03", formats)).toBe(true);
    expect(fitsAnyFormat("X-YZ-21/07/2026/18", formats)).toBe(true);
    expect(fitsAnyFormat("something else", formats)).toBe(false);
    expect(fitsAnyFormat("AB-2026-03", [])).toBe(false);
  });

  it("extractSequence returns null for a number that does not fit, or a format without {number}", () => {
    expect(extractSequence("TQ-07", "{abbreviation}-{number}")).toBe(7);
    expect(extractSequence("LEGACY", "{abbreviation}-{number}")).toBeNull();
    expect(extractSequence("07-09-2026", "{date}")).toBeNull();
  });
});
