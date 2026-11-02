import Link from "next/link";
import { cn } from "@/lib/utils";
import { withReturnTo } from "@/lib/backNavigation";

export type PartyDetailTab =
  "overview" | "addresses" | "payment-methods" | "invoices";

const TABS: { value: PartyDetailTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "addresses", label: "Addresses" },
  { value: "payment-methods", label: "Payment Methods" },
  { value: "invoices", label: "Invoices" },
];

/**
 * Party detail tabs (M36) — real navigable Links driven by `?tab=`, matching
 * ProjectDetailTabs.tsx's exact idiom rather than client-side tab state, so
 * each tab only fetches what it needs server-side and stays
 * bookmarkable/shareable.
 */
export function PartyDetailTabs({
  partyId,
  active,
  addressesCount,
  paymentMethodsCount,
  invoicesCount,
  returnTo,
}: {
  partyId: string;
  active: PartyDetailTab;
  addressesCount: number;
  paymentMethodsCount: number;
  invoicesCount: number;
  /** Carried through to each tab link so switching tabs doesn't drop the back-navigation origin — see `withReturnTo`. */
  returnTo?: string;
}) {
  return (
    <nav
      aria-label="Party sections"
      className="mb-6 flex gap-6 border-b border-border"
    >
      {TABS.map((tab) => {
        const isActive = tab.value === active;
        const href = withReturnTo(
          tab.value === "overview"
            ? `/parties/${partyId}`
            : `/parties/${partyId}?tab=${tab.value}`,
          returnTo,
        );
        const count =
          tab.value === "addresses"
            ? addressesCount
            : tab.value === "payment-methods"
              ? paymentMethodsCount
              : tab.value === "invoices"
                ? invoicesCount
                : null;
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
            {tab.label}
            {count !== null && count > 0 ? (
              <span className="rounded-full bg-brand-light px-1.5 py-0.5 text-[10px] font-bold text-brand">
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
