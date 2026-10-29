import { isOverdue } from "@/lib/dates";
import type { InvoiceStatus } from "@/generated/prisma/client";

/**
 * Invoice detail Activity tab (ui_redesign_handoff_v3
 * screenshots/09-invoice-detail-activity.jpg) — honestly-derivable events
 * only. `Invoice` has just `createdAt`/`updatedAt`, no per-transition
 * history table: `updatedAt` is only ever the *most recent* write, so for a
 * PAID invoice the exact moment it became SENT is unrecoverable (already
 * overwritten by the PAID transition) and is deliberately not shown — no
 * fabricated multi-step timeline, and no "reminder sent" entries at all
 * (there is no reminder-tracking feature in this app). "Became overdue" is
 * the one entry independently derivable from a stored field (`dueDate`)
 * rather than from `updatedAt`. User comments (`InvoiceComment`, a real
 * table) are the one stored, timestamped record and are merged in here.
 */
export type InvoiceActivityTone = "neutral" | "info" | "positive" | "negative";

export type InvoiceActivityEvent = {
  id: string;
  title: string;
  detail: string;
  date: Date;
  tone: InvoiceActivityTone;
  /** Set for a comment entry: lets the tab render the body verbatim and offer Delete when permitted. */
  comment?: { id: string; canDelete: boolean };
};

/** An `InvoiceComment` as the Activity tab needs it — already reduced to display fields and a permission flag by the page. */
export type InvoiceActivityComment = {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string | null;
  canDelete: boolean;
};

const STATUS_EVENT: Record<
  Exclude<InvoiceStatus, "DRAFT">,
  { title: string; detail: string; tone: InvoiceActivityTone }
> = {
  SENT: {
    title: "Invoice sent",
    detail: "PDF invoice delivered to the client.",
    tone: "info",
  },
  PAID: {
    title: "Invoice marked paid",
    detail: "Payment recorded against this invoice.",
    tone: "positive",
  },
  VOID: {
    title: "Invoice voided",
    detail: "Excluded from every total from this point on.",
    tone: "neutral",
  },
};

export function buildInvoiceActivity(
  invoice: {
    status: InvoiceStatus;
    createdAt: Date;
    updatedAt: Date;
    dueDate: Date;
  },
  comments: InvoiceActivityComment[] = [],
): InvoiceActivityEvent[] {
  const events: InvoiceActivityEvent[] = [
    {
      id: "created",
      title: "Invoice created",
      detail: "Snapshots, line items and totals saved.",
      date: invoice.createdAt,
      tone: "neutral",
    },
  ];

  if (invoice.status !== "DRAFT") {
    const statusEvent = STATUS_EVENT[invoice.status];
    events.push({
      id: "status",
      ...statusEvent,
      date: invoice.updatedAt,
    });
  }

  if (invoice.status === "SENT" && isOverdue(invoice.dueDate)) {
    events.push({
      id: "overdue",
      title: "Invoice became overdue",
      detail: "Payment was not recorded by the due date.",
      date: invoice.dueDate,
      tone: "negative",
    });
  }

  // Comments (Docs/implementation_decisions.md §31) interleave with the
  // derived events by their own timestamps, so "sent → client confirmed →
  // paid" reads as one timeline.
  for (const comment of comments) {
    events.push({
      id: `comment-${comment.id}`,
      title: comment.authorName
        ? `${comment.authorName} commented`
        : "Comment",
      detail: comment.body,
      date: comment.createdAt,
      tone: "info",
      comment: { id: comment.id, canDelete: comment.canDelete },
    });
  }

  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
}
