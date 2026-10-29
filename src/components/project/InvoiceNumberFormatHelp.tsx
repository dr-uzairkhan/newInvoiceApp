"use client";

import { CircleHelp } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  applyInvoiceNumberTokens,
  getInvoiceNumberTokenReference,
} from "@/lib/invoiceNumberFormat";

/**
 * Click-to-insert token reference for the Invoice Number Format field —
 * the field itself gives no indication of what it accepts, so this is the
 * only place a user can discover/build a valid format string. Each row
 * appends its token to the current value; the preview at the bottom
 * resolves the live value against today's date (standing in for the issue
 * date a real invoice would use) and a sample
 * abbreviation/sequence, updating as the user builds the format up.
 */
export function InvoiceNumberFormatHelp({
  value,
  abbreviation,
  onInsertToken,
}: {
  value: string;
  /** Live-typed project abbreviation, if any — falls back to a sample when empty. */
  abbreviation: string;
  onInsertToken: (token: string) => void;
}) {
  // Tokens resolve against UTC calendar fields (they are issue-date based),
  // so build "today" from the local calendar date to keep the sample honest.
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );
  const tokens = getInvoiceNumberTokenReference(today);
  const preview = applyInvoiceNumberTokens(value, {
    abbreviation: abbreviation.trim() || "ACM",
    number: "01",
    date: today,
  });

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label="What tokens can I use in the invoice number format?"
        className="text-muted-foreground hover:text-foreground"
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-96">
        <p className="mb-2 text-[12px] font-bold text-foreground">
          Format tokens
        </p>
        <div className="flex flex-col gap-1.5">
          {tokens.map((entry) => (
            <button
              key={entry.token}
              type="button"
              onClick={() => onInsertToken(entry.token)}
              className="flex items-start gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted/60"
            >
              <code className="w-36 shrink-0 whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {entry.token}
              </code>
              <span className="text-[11px] text-muted-foreground">
                {entry.description}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
          <span className="text-[10px] font-bold tracking-[0.05em] text-muted-foreground uppercase">
            Preview
          </span>
          <span className="font-mono text-[13px] font-bold text-brand">
            {preview || "—"}
          </span>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Click a token to add it. Other characters are kept literally.
        </p>
      </PopoverContent>
    </Popover>
  );
}
