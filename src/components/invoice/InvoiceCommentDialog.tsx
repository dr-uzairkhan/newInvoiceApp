"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InvoiceCommentComposer } from "@/components/invoice/InvoiceCommentComposer";

/**
 * "Add comment" from an invoice row's actions menu — the same composer the
 * Activity tab uses, in a dialog so a note can be left without opening the
 * invoice. Shows the newest existing comment for context.
 */
export function InvoiceCommentDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  latestComment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
  latestComment: string | null;
}) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Comment on {invoiceNumber}</DialogTitle>
          <DialogDescription>
            {latestComment
              ? `Latest: “${latestComment}”`
              : "No comments yet on this invoice."}
          </DialogDescription>
        </DialogHeader>
        <InvoiceCommentComposer
          invoiceId={invoiceId}
          onAdded={() => {
            onOpenChange(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
