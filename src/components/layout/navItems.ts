import {
  LayoutDashboard,
  Users,
  Briefcase,
  FileText,
  Layers,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/generated/prisma/client";

type NavItem = { href: string; label: string; icon: LucideIcon };

const BASE_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: Briefcase },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/parties", label: "Parties", icon: Users },
  // §33 — the internal ledger's only surface.
  { href: "/internal", label: "Internal", icon: Layers },
];

const SETTINGS_NAV_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: Settings,
};

/**
 * Shared nav item list — Docs/ui_design_guide.md §3 / M27
 * (design_handoff_dashboard_v2/README.md §1). Used by both the desktop
 * Sidebar and the mobile top bar / bottom tab bar so the two chrome
 * variants never drift out of sync. M28 — Settings is `ADMIN`-only (the
 * page itself redirects non-admins away regardless; this just avoids
 * showing a link that would immediately bounce).
 */
export function getNavItems(role: Role): NavItem[] {
  return role === "ADMIN"
    ? [...BASE_NAV_ITEMS, SETTINGS_NAV_ITEM]
    : BASE_NAV_ITEMS;
}

export function isActiveNavHref(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
