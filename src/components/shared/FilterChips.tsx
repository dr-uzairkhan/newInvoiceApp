import Link from "next/link";
import { cn } from "@/lib/utils";

export type FilterChipOption<T extends string> = { value: T; label: string };

/**
 * Status/type filter chip row — M27 v2 redesign,
 * design_handoff_dashboard_v2/README.md §3/§4, Docs/ui_design_guide.md §4.
 * Plain `Link`s (not a stateful tab primitive) so the active chip reflects
 * real page navigation via a `?status=` search param, same reasoning as the
 * pre-existing invoice status tabs this replaces. Shared by
 * InvoiceStatusFilter and ProjectStatusFilter so the two chip rows can't
 * visually drift apart.
 */
export function FilterChips<T extends string>({
  options,
  active,
  hrefFor,
}: {
  options: readonly FilterChipOption<T>[];
  /**
   * `string`, not `T` — a caller may have a wider filter-value type than
   * this particular chip row covers (e.g. a page whose other
   * controls add filter values with no matching chip here); passing one through should just leave every chip unhighlighted,
   * not fail to typecheck.
   */
  active: string;
  hrefFor: (value: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Link
          key={option.value}
          href={hrefFor(option.value)}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors",
            active === option.value
              ? "border-brand bg-brand-light text-brand"
              : "border-border bg-card text-[var(--text-secondary)] hover:bg-muted/40",
          )}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}
