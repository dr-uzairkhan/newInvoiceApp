"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNavItems, isActiveNavHref } from "./navItems";
import { signOutAction } from "@/actions/auth.actions";
import type { Role } from "@/generated/prisma/client";

/**
 * Desktop nav shell (≥1024px) — M27 v2 redesign,
 * design_handoff_dashboard_v2/README.md §1, Docs/ui_design_guide.md §3.
 * Dark navy surface, replacing the prior white sidebar. Below 1024px this
 * renders nothing — MobileNav.tsx's top bar + bottom tab bar take over
 * entirely rather than this collapsing to a drawer.
 */
export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const navItems = getNavItems(role);

  return (
    <aside className="hidden w-[240px] shrink-0 flex-col bg-nav lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-[22px]">
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-brand text-[13px] font-bold text-white">
          I
        </div>
        <span className="text-sm font-bold text-white">Invoice App</span>
      </div>

      <nav className="flex flex-1 flex-col gap-[3px] px-3 py-1">
        {navItems.map((item) => {
          const isActive = isActiveNavHref(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-[9px] text-[13px] font-semibold transition-colors",
                isActive
                  ? "bg-nav-active text-nav-active-foreground"
                  : "text-nav-muted hover:bg-white/[0.06]",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
                  isActive
                    ? "bg-brand text-white"
                    : "bg-nav-icon text-nav-muted",
                )}
              >
                <item.icon className="h-3 w-3" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-nav-border">
        <div className="flex items-center gap-2.5 px-5 py-3">
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
            Z
          </div>
          <span className="truncate text-xs font-semibold text-white">
            Operational view
          </span>
        </div>
        <form action={signOutAction} className="px-3 pb-3">
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-[9px] text-[13px] font-semibold text-nav-muted transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-nav-icon text-nav-muted">
              <LogOut className="h-3 w-3" />
            </span>
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
