import Link from "next/link";
import { cn } from "@/lib/utils";
import { withReturnTo } from "@/lib/backNavigation";

export type ProjectDetailTab = "overview" | "invoices" | "setup";

const TABS: { value: ProjectDetailTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "invoices", label: "Invoices & alerts" },
  { value: "setup", label: "Billing setup" },
];

/**
 * Project detail tabs (ui_redesign_handoff_v3 screenshots/10-12) — real
 * navigable Links driven by `?tab=`, matching this app's existing
 * `?edit=1`/`?status=` search-param idiom rather than client-side tab
 * state, so each tab only fetches what it needs server-side and stays
 * bookmarkable/shareable.
 */
export function ProjectDetailTabs({
  projectId,
  active,
  invoicesCount,
  returnTo,
  internal = false,
}: {
  projectId: string;
  active: ProjectDetailTab;
  invoicesCount: number;
  /** §33 — an internal project has no reminder schedules, so its middle tab is just "Invoices". */
  internal?: boolean;
  /** Carried through to each tab link so switching tabs doesn't drop the back-navigation origin — see `withReturnTo`. */
  returnTo?: string;
}) {
  return (
    <nav
      aria-label="Project sections"
      className="mb-6 flex gap-6 border-b border-border"
    >
      {TABS.map((tab) => {
        const isActive = tab.value === active;
        const href = withReturnTo(
          tab.value === "overview"
            ? `/projects/${projectId}`
            : `/projects/${projectId}?tab=${tab.value}`,
          returnTo,
        );
        return (
          <Link
            key={tab.value}
            href={href}
            className={cn(
              "relative -mb-px flex items-center gap-1.5 border-b-2 pb-3 text-[13px] font-semibold",
              isActive
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.value === "invoices" && internal ? "Invoices" : tab.label}
            {tab.value === "invoices" && invoicesCount > 0 ? (
              <span className="rounded-full bg-brand-light px-1.5 py-0.5 text-[10px] font-bold text-brand">
                {invoicesCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
