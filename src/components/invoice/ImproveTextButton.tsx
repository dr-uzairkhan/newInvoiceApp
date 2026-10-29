"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { improveTextAction } from "@/actions/aiText.actions";
import type { ImproveTextField } from "@/services/aiTextService";

/**
 * Docs/ui_design_guide.md §14 — the only AI affordance in the app: a small
 * label-suffix button that rewrites one text field in place, for review.
 * The previous value is offered back through the toast's Undo. Rendered
 * only when a provider is configured (`aiConfigured` on the form), so the
 * form never suggests a capability that isn't there.
 */
export function ImproveTextButton({
  field,
  getText,
  onApply,
}: {
  field: ImproveTextField;
  /** Read the field's current value at click time (react-hook-form `getValues`). */
  getText: () => string;
  /** Write the new value back (and, in the form, flash the field). Also used by Undo with the original text. */
  onApply: (text: string) => void;
}) {
  const [isPending, setIsPending] = useState(false);

  async function improve() {
    const original = getText().trim();
    if (!original) {
      toast.info("Type something first, then improve it.");
      return;
    }
    setIsPending(true);
    try {
      const result = await improveTextAction(original, field);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onApply(result.data.text);
      toast.success("Text improved — review before saving.", {
        action: { label: "Undo", onClick: () => onApply(original) },
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="h-5 px-1.5 text-[10px] font-semibold normal-case tracking-normal text-brand"
      disabled={isPending}
      onClick={() => void improve()}
      aria-label="Improve this text with AI"
    >
      <Sparkles className="h-3 w-3" />
      {isPending ? "Improving…" : "Improve"}
    </Button>
  );
}
