"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { deleteInvoiceCommentAction } from "@/actions/invoiceComment.actions";

/** Rendered only when the server already decided the viewer may delete (author or ADMIN); the action re-checks regardless. */
export function DeleteCommentButton({ commentId }: { commentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleDelete() {
    const result = await deleteInvoiceCommentAction(commentId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Comment deleted.");
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Delete comment"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
      <ConfirmDialog
        hideTrigger
        open={open}
        onOpenChange={setOpen}
        title="Delete comment"
        description="This removes the comment from the invoice's activity log. This cannot be undone."
        confirmLabel="Delete comment"
        onConfirm={handleDelete}
      />
    </>
  );
}
