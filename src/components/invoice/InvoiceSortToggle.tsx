import Link from "next/link";
import { ArrowDown01, ArrowUp01 } from "lucide-react";
import { withReturnTo } from "@/lib/backNavigation";

/**
 * M44 — the project detail page's Invoices tab sorts by `InvoiceNumber`
 * (not `createdAt`, unlike every other invoice list — see
 * invoiceService.listByProject), defaulting to descending (newest number
 * first). This toggles the direction via a real `?sort=` link, same
 * URL-state idiom as `?tab=`/`?status=` elsewhere,
 * so the chosen direction stays bookmarkable/shareable rather than
 * living in client state.
 */
export function InvoiceSortToggle({
  projectId,
  sort,
  returnTo,
}: {
  projectId: string;
  sort: "asc" | "desc";
  /** Carried through so toggling sort doesn't drop the back-navigation origin — see `withReturnTo`. */
  returnTo?: string;
}) {
  const nextSort = sort === "desc" ? "asc" : "desc";
  const label =
    sort === "desc"
      ? "Sorted newest invoice number first — click for oldest first"
      : "Sorted oldest invoice number first — click for newest first";

  return (
    <Link
      href={withReturnTo(
        `/projects/${projectId}?tab=invoices&sort=${nextSort}`,
        returnTo,
      )}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      {sort === "desc" ? (
        <ArrowDown01 className="h-4 w-4" />
      ) : (
        <ArrowUp01 className="h-4 w-4" />
      )}
    </Link>
  );
}
