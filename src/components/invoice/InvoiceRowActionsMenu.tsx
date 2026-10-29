"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { TRANSITIONS } from "@/components/invoice/StatusActionBar";
import { InvoiceCommentDialog } from "@/components/invoice/InvoiceCommentDialog";
import {
  transitionInvoiceStatusAction,
  deleteInvoiceAction,
} from "@/actions/invoice.actions";
import type { InvoiceStatus } from "@/generated/prisma/client";

/**
 * Row-level quick actions for an invoice list (InvoiceTable.tsx) — the same
 * status transitions and delete action StatusActionBar.tsx offers on the
 * invoice detail page, reachable without leaving the list. Deliberately
 * skips the detail page's payment-method warning on the Sent transition
 * (that requires the project's preferred-payment-method flag, which isn't
 * part of InvoiceTableRow) — the confirmation dialog still requires an
 * explicit second click either way. "Add comment" (§31) is available in
 * every status, since comments sit outside the invoice lifecycle.
 */
export function InvoiceRowActionsMenu({
  invoiceId,
  invoiceNumber,
  status,
  latestComment,
}: {
  invoiceId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  latestComment: string | null;
}) {
  const router = useRouter();
  const [pendingTarget, setPendingTarget] = useState<InvoiceStatus | null>(
    null,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [commenting, setCommenting] = useState(false);

  async function handleTransition(target: InvoiceStatus) {
    const result = await transitionInvoiceStatusAction(invoiceId, target);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Invoice marked as ${target.toLowerCase()}.`);
    router.refresh();
  }

  async function handleDelete() {
    const result = await deleteInvoiceAction(invoiceId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Invoice deleted.");
    router.refresh();
  }

  const transitions = TRANSITIONS[status];

  return (
    <>
      {/* relative z-10: lifts the trigger above InvoiceTable's row-covering
          absolutely-positioned RowOpenLink overlay — same treatment as the
          client/project name links in that same row. */}
      <div className="relative z-10">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Invoice actions"
              />
            }
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setCommenting(true)}>
              Add comment
            </DropdownMenuItem>
            {transitions.map((transition) => (
              <DropdownMenuItem
                key={transition.target}
                onClick={() => setPendingTarget(transition.target)}
              >
                {transition.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {transitions.map((transition) => (
        <ConfirmDialog
          key={transition.target}
          hideTrigger
          open={pendingTarget === transition.target}
          onOpenChange={(open) => {
            if (!open) setPendingTarget(null);
          }}
          title={transition.label}
          description={transition.description}
          confirmLabel={transition.label}
          onConfirm={() => handleTransition(transition.target)}
        />
      ))}
      <InvoiceCommentDialog
        open={commenting}
        onOpenChange={setCommenting}
        invoiceId={invoiceId}
        invoiceNumber={invoiceNumber}
        latestComment={latestComment}
      />
      <ConfirmDialog
        hideTrigger
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete Invoice"
        description="This permanently deletes the invoice and its line items. This cannot be undone."
        confirmLabel="Delete Invoice"
        onConfirm={handleDelete}
      />
    </>
  );
}
