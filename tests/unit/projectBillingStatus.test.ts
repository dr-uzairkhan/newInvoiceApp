import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import {
  buildLastCoveredPeriodByProjectId,
  buildLastInvoiceByProjectId,
  buildProjectBillingRows,
} from "@/lib/projectBillingStatus";
import type { InvoiceListItem } from "@/repositories/invoiceRepository";
import type { ProjectWithRelations } from "@/repositories/projectRepository";
import type { AlertScheduleWithProject } from "@/repositories/projectAlertScheduleRepository";

const NOW = new Date("2026-01-20T00:00:00.000Z");

function invoice(overrides: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: "invoice-1",
    invoiceNumber: "TP-01",
    issueDate: new Date("2026-01-01"),
    dueDate: new Date("2026-01-15"),
    status: "SENT",
    currency: "USD",
    subtotal: new Prisma.Decimal(100),
    total: new Prisma.Decimal(100),
    convertedTotal: null,
    convertedCurrency: null,
    fromPartySnapshot: {},
    toPartySnapshot: {},
    paymentDetailsSnapshot: [],
    itemsNote: null,
    bottomNote: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    projectId: "project-1",
    project: {
      id: "project-1",
      name: "Test Project",
      client: { id: "client-1", name: "Test Client" },
    },
    ...overrides,
  } as InvoiceListItem;
}

function project(
  overrides: Partial<ProjectWithRelations>,
): ProjectWithRelations {
  return {
    id: "project-1",
    name: "Test Project",
    invoicePeriodType: null,
    displayCurrency: "USD",
    client: { id: "client-1", name: "Test Client" },
    createdAt: new Date("2026-01-01"),
    ...overrides,
  } as ProjectWithRelations;
}

function alertSchedule(
  overrides: Partial<AlertScheduleWithProject>,
): AlertScheduleWithProject {
  return {
    id: "schedule-1",
    projectId: "project-1",
    dayOfMonth: 25,
    recurring: true,
    label: "Send Invoice",
    clearedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    project: { id: "project-1", name: "Test Project" },
    ...overrides,
  } as AlertScheduleWithProject;
}

describe("buildLastInvoiceByProjectId", () => {
  it("keeps the most recently issued invoice per project", () => {
    const map = buildLastInvoiceByProjectId([
      invoice({
        id: "a",
        issueDate: new Date("2026-01-01"),
        total: new Prisma.Decimal(100),
      }),
      invoice({
        id: "b",
        issueDate: new Date("2026-01-15"),
        total: new Prisma.Decimal(200),
      }),
    ]);
    expect(map.get("project-1")?.total).toBe("200");
  });
});

describe("buildLastCoveredPeriodByProjectId (M39)", () => {
  it("returns the most recently issued SENT/PAID invoice's period", () => {
    const map = buildLastCoveredPeriodByProjectId([
      invoice({
        id: "a",
        status: "SENT",
        issueDate: new Date("2026-01-01"),
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-01-31"),
      }),
      invoice({
        id: "b",
        status: "SENT",
        issueDate: new Date("2026-02-01"),
        periodStart: new Date("2026-02-01"),
        periodEnd: new Date("2026-02-28"),
      }),
    ]);
    expect(map.get("project-1")?.start.toISOString().slice(0, 10)).toBe(
      "2026-02-01",
    );
    expect(map.get("project-1")?.end.toISOString().slice(0, 10)).toBe(
      "2026-02-28",
    );
  });

  it("ignores DRAFT/VOID invoices even if more recently issued", () => {
    const map = buildLastCoveredPeriodByProjectId([
      invoice({
        id: "a",
        status: "SENT",
        issueDate: new Date("2026-01-01"),
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-01-31"),
      }),
      invoice({
        id: "b",
        status: "DRAFT",
        issueDate: new Date("2026-02-01"),
        periodStart: new Date("2026-02-01"),
        periodEnd: new Date("2026-02-28"),
      }),
    ]);
    expect(map.get("project-1")?.end.toISOString().slice(0, 10)).toBe(
      "2026-01-31",
    );
  });

  it("counts PAID the same as SENT", () => {
    const map = buildLastCoveredPeriodByProjectId([
      invoice({
        id: "a",
        status: "PAID",
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-01-31"),
      }),
    ]);
    expect(map.has("project-1")).toBe(true);
  });

  it("skips an invoice missing either period bound", () => {
    const map = buildLastCoveredPeriodByProjectId([
      invoice({ id: "a", status: "SENT", periodStart: null, periodEnd: null }),
    ]);
    expect(map.has("project-1")).toBe(false);
  });
});

describe("buildProjectBillingRows", () => {
  it("marks a project with an overdue invoice as overdue, days computed from dueDate", () => {
    const overdueInvoice = invoice({
      id: "od-1",
      dueDate: new Date("2026-01-10"),
    });
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [overdueInvoice],
      overdueInvoices: [overdueInvoice],
      staleDrafts: [],
      firedAlertSchedules: [],
      now: NOW,
    });

    expect(rows[0].statusTone).toBe("overdue");
    expect(rows[0].statusLabel).toBe("10 days overdue");
    expect(rows[0].overdueCount).toBe(1);
  });

  it("counts every overdue invoice for a project, not just the oldest", () => {
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [],
      overdueInvoices: [
        invoice({ id: "od-1", dueDate: new Date("2026-01-10") }),
        invoice({ id: "od-2", dueDate: new Date("2026-01-15") }),
      ],
      staleDrafts: [],
      firedAlertSchedules: [],
      now: NOW,
    });

    expect(rows[0].overdueCount).toBe(2);
    expect(rows[0].statusLabel).toBe("10 days overdue");
  });

  it("counts DRAFT invoices for the project separately from SENT/overdue", () => {
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [
        invoice({ id: "draft-1", status: "DRAFT" }),
        invoice({ id: "draft-2", status: "DRAFT" }),
        invoice({ id: "sent-1", status: "SENT" }),
      ],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [],
      now: NOW,
    });

    expect(rows[0].draftCount).toBe(2);
    expect(rows[0].exposureCount).toBe(1);
  });

  it("prioritizes overdue over a fired schedule or a stale draft", () => {
    const overdueInvoice = invoice({
      id: "od-1",
      dueDate: new Date("2026-01-10"),
    });
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [overdueInvoice],
      overdueInvoices: [overdueInvoice],
      staleDrafts: [invoice({ id: "draft-1", status: "DRAFT" })],
      firedAlertSchedules: [alertSchedule({})],
      now: NOW,
    });

    expect(rows[0].statusTone).toBe("overdue");
  });

  it("ignores a fired schedule not labeled Send Invoice — no prepare tone, no next-invoice-date (M39)", () => {
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [
        alertSchedule({ dayOfMonth: 25, label: "Pick up dry cleaning" }),
      ],
      now: NOW,
    });

    expect(rows[0].statusTone).toBe("positive");
    expect(rows[0].nextInvoiceDate).toBeNull();
  });

  it("ignores a live schedule not labeled Send Invoice for the next-invoice-date estimate (M39)", () => {
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [],
      liveAlertSchedules: [
        alertSchedule({ dayOfMonth: 27, label: "Pick up dry cleaning" }),
      ],
      now: NOW,
    });

    expect(rows[0].nextInvoiceDate).toBeNull();
  });

  it("falls back to On track (positive) when nothing needs attention", () => {
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [],
      now: NOW,
    });

    expect(rows[0]).toMatchObject({
      statusTone: "positive",
      statusLabel: "On track",
    });
  });

  it("labels a project with no invoicePeriodType as Milestone", () => {
    const rows = buildProjectBillingRows({
      activeProjects: [project({ invoicePeriodType: null })],
      allInvoices: [],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [],
      now: NOW,
    });

    expect(rows[0].billingLabel).toBe("Milestone");
  });

  it("computes next invoice date from invoicePeriodType off the last invoice when no schedule is fired", () => {
    const rows = buildProjectBillingRows({
      activeProjects: [project({ invoicePeriodType: "MONTHLY" })],
      allInvoices: [invoice({ id: "a", issueDate: new Date("2026-01-05") })],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [],
      now: NOW,
    });

    expect(rows[0].nextInvoiceDate?.toISOString().slice(0, 10)).toBe(
      "2026-02-05",
    );
  });

  it("prefers a fired alert schedule's resolved day over the invoicePeriodType calc", () => {
    const rows = buildProjectBillingRows({
      activeProjects: [project({ invoicePeriodType: "MONTHLY" })],
      allInvoices: [invoice({ id: "a", issueDate: new Date("2026-01-05") })],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [alertSchedule({ dayOfMonth: 25 })],
      now: NOW,
    });

    expect(rows[0].nextInvoiceDate?.toISOString().slice(0, 10)).toBe(
      "2026-01-25",
    );
  });

  it("uses a live (not-yet-fired) schedule's next occurrence over the invoicePeriodType calc", () => {
    const rows = buildProjectBillingRows({
      activeProjects: [project({ invoicePeriodType: "MONTHLY" })],
      allInvoices: [invoice({ id: "a", issueDate: new Date("2026-01-05") })],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [],
      liveAlertSchedules: [alertSchedule({ dayOfMonth: 27, recurring: true })],
      now: NOW,
    });

    expect(rows[0].nextInvoiceDate?.toISOString().slice(0, 10)).toBe(
      "2026-01-27",
    );
  });

  it("picks the earliest occurrence across multiple live schedules on the same project", () => {
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [],
      liveAlertSchedules: [
        alertSchedule({ id: "s-1", dayOfMonth: 27, recurring: true }),
        alertSchedule({ id: "s-2", dayOfMonth: 22, recurring: true }),
      ],
      now: NOW,
    });

    expect(rows[0].nextInvoiceDate?.toISOString().slice(0, 10)).toBe(
      "2026-01-22",
    );
  });

  it("still prefers a fired schedule's resolved day over a live schedule's next occurrence", () => {
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [alertSchedule({ id: "fired-1", dayOfMonth: 15 })],
      liveAlertSchedules: [
        alertSchedule({ id: "fired-1", dayOfMonth: 15 }),
        alertSchedule({ id: "s-2", dayOfMonth: 27, recurring: true }),
      ],
      now: NOW,
    });

    expect(rows[0].nextInvoiceDate?.toISOString().slice(0, 10)).toBe(
      "2026-01-15",
    );
  });

  it("returns null next invoice date when there's no schedule and no invoicePeriodType", () => {
    const rows = buildProjectBillingRows({
      activeProjects: [project({ invoicePeriodType: null })],
      allInvoices: [invoice({ id: "a" })],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [],
      now: NOW,
    });

    expect(rows[0].nextInvoiceDate).toBeNull();
  });

  it("surfaces the last covered period on the row when set (M39)", () => {
    const sent = invoice({
      id: "a",
      status: "SENT",
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-01-31"),
    });
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [sent],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [],
      now: NOW,
    });

    expect(rows[0].lastCoveredPeriod?.start.toISOString().slice(0, 10)).toBe(
      "2026-01-01",
    );
    expect(rows[0].lastCoveredPeriod?.end.toISOString().slice(0, 10)).toBe(
      "2026-01-31",
    );
  });

  it("leaves lastCoveredPeriod null when no invoice has one set", () => {
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [invoice({ id: "a" })],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [],
      now: NOW,
    });

    expect(rows[0].lastCoveredPeriod).toBeNull();
  });

  it("sums only SENT invoices for exposure", () => {
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [
        invoice({
          id: "sent-1",
          status: "SENT",
          total: new Prisma.Decimal(300),
        }),
        invoice({
          id: "draft-1",
          status: "DRAFT",
          total: new Prisma.Decimal(999),
        }),
      ],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [],
      now: NOW,
    });

    expect(rows[0].exposureTotal).toBe("300");
  });

  it("marks a project with no preferred payment method as setupIncomplete when nothing more urgent applies", () => {
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [],
      missingPaymentMethodProjects: [project({})],
      now: NOW,
    });

    expect(rows[0].statusTone).toBe("setupIncomplete");
    expect(rows[0].statusLabel).toBe("Setup incomplete");
  });

  it("marks a project with a due-soon outstanding invoice as upcoming when nothing more urgent applies", () => {
    const dueSoonInvoice = invoice({ id: "due-soon-1", status: "SENT" });
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [dueSoonInvoice],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [],
      dueSoonInvoices: [dueSoonInvoice],
      now: NOW,
    });

    expect(rows[0].statusTone).toBe("upcoming");
    expect(rows[0].statusLabel).toBe("Payment due soon");
  });

  it("prioritizes overdue/prepare/draft over setupIncomplete and upcoming", () => {
    const overdueInvoice = invoice({
      id: "od-1",
      dueDate: new Date("2026-01-10"),
    });
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [overdueInvoice],
      overdueInvoices: [overdueInvoice],
      staleDrafts: [],
      firedAlertSchedules: [],
      missingPaymentMethodProjects: [project({})],
      dueSoonInvoices: [overdueInvoice],
      now: NOW,
    });

    expect(rows[0].statusTone).toBe("overdue");
  });

  it("prioritizes setupIncomplete over upcoming", () => {
    const dueSoonInvoice = invoice({ id: "due-soon-1", status: "SENT" });
    const rows = buildProjectBillingRows({
      activeProjects: [project({})],
      allInvoices: [dueSoonInvoice],
      overdueInvoices: [],
      staleDrafts: [],
      firedAlertSchedules: [],
      missingPaymentMethodProjects: [project({})],
      dueSoonInvoices: [dueSoonInvoice],
      now: NOW,
    });

    expect(rows[0].statusTone).toBe("setupIncomplete");
  });
});
