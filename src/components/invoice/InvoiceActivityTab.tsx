import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { InvoiceCommentComposer } from "@/components/invoice/InvoiceCommentComposer";
import { DeleteCommentButton } from "@/components/invoice/DeleteCommentButton";
import type { InvoiceActivityEvent } from "@/lib/invoiceActivity";

const DOT_TONE: Record<InvoiceActivityEvent["tone"], string> = {
  negative: "bg-[var(--status-overdue-text)]",
  positive: "bg-[var(--status-paid-text)]",
  info: "bg-brand",
  neutral: "bg-muted-foreground",
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Invoice detail Activity tab — the derived lifecycle events (see
 * lib/invoiceActivity.ts for what's real vs. deliberately omitted) with the
 * invoice's comments interleaved by time, plus a composer to add one.
 * Comments are the one thing here a user writes; they are never printed on
 * the document (Docs/implementation_decisions.md §31).
 */
export function InvoiceActivityTab({
  invoiceId,
  invoiceNumber,
  events,
}: {
  invoiceId: string;
  invoiceNumber: string;
  events: InvoiceActivityEvent[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[14px] font-bold text-foreground">
          Invoice activity
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Audit trail and comments for {invoiceNumber}.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-0 p-0">
        <div className="border-b border-muted px-5 py-4">
          <InvoiceCommentComposer invoiceId={invoiceId} />
        </div>
        {events.map((event, index) => (
          <div
            key={event.id}
            className={`flex items-start gap-3 px-5 py-3.5 ${index > 0 ? "border-t border-muted" : ""}`}
          >
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT_TONE[event.tone]}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-foreground">
                {event.title}
              </p>
              <p
                className={
                  event.comment
                    ? "text-[12px] whitespace-pre-wrap text-foreground"
                    : "text-[11px] text-muted-foreground"
                }
              >
                {event.detail}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {formatDateTime(event.date)}
              </span>
              {event.comment?.canDelete ? (
                <DeleteCommentButton commentId={event.comment.id} />
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
