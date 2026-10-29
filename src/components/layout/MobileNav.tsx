"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNavItems, isActiveNavHref } from "./navItems";
import { signOutAction } from "@/actions/auth.actions";
import type { Role } from "@/generated/prisma/client";

/**
 * Mobile nav shell (<1024px) — M27 v2 redesign,
 * design_handoff_dashboard_v2/README.md §1, Docs/ui_design_guide.md §3.
 * Replaces the sidebar entirely (it never just disappears): a fixed top
 * bar (logo/wordmark only) plus a fixed bottom tab bar, one tab per nav
 * item. AppShell.tsx pads main content to clear both.
 */
export function MobileTopBar() {
  return (
    <div className="fixed inset-x-0 top-0 z-40 flex h-[52px] items-center justify-between gap-2 bg-nav px-4 lg:hidden">
      <div className="flex items-center gap-2">
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-brand text-xs font-bold text-white">
          I
        </div>
        <span className="text-[13px] font-bold text-white">Invoice App</span>
      </div>
      <form action={signOutAction}>
        <button
          type="submit"
          title="Sign out"
          className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-white/[0.08] text-white outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}

/** One literal class per possible nav length so Tailwind's scanner sees them all. */
const TAB_BAR_COLUMNS: Record<number, string> = {
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

export function MobileTabBar({ role }: { role: Role }) {
  const pathname = usePathname();
  const navItems = getNavItems(role);

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 grid bg-nav px-1 pt-1.5 pb-2.5 lg:hidden",
        TAB_BAR_COLUMNS[navItems.length] ?? "grid-cols-5",
      )}
    >
      {navItems.map((item) => {
        const isActive = isActiveNavHref(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-1 py-1"
          >
            <item.icon
              className={cn(
                "h-5 w-5",
                isActive ? "text-nav-active-foreground" : "text-nav-email",
              )}
            />
            <span
              className={cn(
                "text-[10px] font-semibold",
                isActive ? "text-nav-active-foreground" : "text-nav-email",
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
