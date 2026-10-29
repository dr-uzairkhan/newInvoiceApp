"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addInvoiceCommentAction } from "@/actions/invoiceComment.actions";

/**
 * Add-a-comment box at the top of the invoice Activity tab. Comments are
 * operational notes (never printed on the document) and can be added in
 * any status — see `Docs/implementation_decisions.md` §31.
 */
export function InvoiceCommentComposer({
  invoiceId,
  onAdded,
}: {
  invoiceId: string;
  /** Called after a successful add; defaults to refreshing the route. */
  onAdded?: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setIsPending(true);
    setError(null);
    try {
      const result = await addInvoiceCommentAction(invoiceId, { body });
      if (!result.success) {
        setError(result.fieldErrors?.body?.[0] ?? result.error);
        return;
      }
      setBody("");
      toast.success("Comment added.");
      if (onAdded) onAdded();
      else router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={2}
        placeholder="Add a comment — e.g. client confirmed receipt, payment promised Friday"
        aria-label="New comment"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
      />
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] text-muted-foreground">
          Internal only — never shown on the invoice document.
        </span>
        <Button
          type="button"
          size="sm"
          disabled={isPending || body.trim().length === 0}
          onClick={() => void submit()}
        >
          {isPending ? "Adding…" : "Add comment"}
        </Button>
      </div>
    </div>
  );
}
