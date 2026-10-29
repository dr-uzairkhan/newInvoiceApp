# UI Design Guide

The application-chrome design system: tokens, components, page templates, and responsive rules. `Docs/invoice_design_guidelines.md` owns the invoice document itself (§15 below) — everything else in the app is described here directly. `design_handoff_dashboard_v2/README.md` is a historical pixel-level reference for the dark-navy nav shell and card/table visual language it introduced; that same visual language now covers every screen in the app (Parties/Settings included), not only Dashboard/Invoices/Projects, so this guide — not that folder — is the current source of truth for which screens exist and how they're structured.

---

## 1. Overall Visual Direction

**Docketly Indigo** — a Swiss-influenced, high-density operational workspace, not a marketing-style SaaS dashboard:

- Light theme for page content. Cool neutral canvas (`slate-50`) isolating pure white cards.
- A single restrained brand accent (indigo), never decorative.
- Two typefaces carry the hierarchy: geometric sans for UI text, monospace for anything numeric or identifier-shaped.
- Density over whitespace-for-its-own-sake — this is a daily-use admin tool.
- Every card, table, badge, and alert must support a real decision.

**Nav shell exception:** the sidebar/topbar/bottom-tab-bar are deliberately dark navy (`#0f172a`), not white — see §3. This is a nav-chrome-only treatment, not app-wide dark mode; every page's content area stays the light theme described above.

---

## 2. Layout System

- **Dual-frame canvas**: fixed-width dark left sidebar (desktop) + fluid main stage, `max-width: 1200px`, `padding: 40px` desktop / `16px` mobile.
- **Asymmetric grid**: `2fr/1fr` (`.layout-grid`) for primary content + supporting context. Single-column stacks use `.layout-single`.

```
┌──────────────┬────────────────────────────────────────────┐
│              │  page-header (title + primary action)       │
│   sidebar    ├────────────────────────────────────────────┤
│   240px      │  stats row (if applicable)                  │
│   fixed      ├───────────────────────────┬──────────────────┤
│   (dark)     │  primary panel (2fr)      │  context (1fr)   │
│              │  (form / table)           │                  │
└──────────────┴───────────────────────────┴──────────────────┘
```

---

## 3. Navigation Structure

Full spec in `design_handoff_dashboard_v2/README.md` §1 — read that file before touching `Sidebar.tsx`/`MobileNav.tsx`/`AppShell.tsx`. Summary:

- **Desktop (≥1024px)**: `240px` fixed sidebar, **dark navy `#0f172a`**, full height, sticky. Logo row: 30×30px indigo square + white "Invoice App" wordmark. Nav items (Dashboard/Parties/Projects/Invoices/Settings): icon box + label; active = `rgba(99,102,241,0.2)` bg + `#a5b4fc` text; inactive = `#94a3b8` text. Footer: circular indigo avatar + a single "Operational view" line, top border — deliberately not a name/email pair (this is a single-admin app, §8) — followed by a labeled "Sign out" row styled like the nav items above it (icon swatch + text), not an icon-only affordance.
- **Mobile (<1024px)**: the sidebar is **replaced entirely**, never just hidden. A fixed `52px` dark top bar (logo + wordmark only — no hamburger) plus a fixed dark bottom tab bar (5 equal columns, one per nav item, icon above a 10px label, same active/inactive color treatment as desktop). Main content gets top/bottom padding to clear both fixed bars. The top bar's right side carries a small icon-only sign-out button — space-constrained, no text label there.
- Breakpoint: **1024px**.
- **Fired alert indicators**: the Projects list shows a small dot next to the name of any project with a fired, uncleared `ProjectAlertSchedule`; the project's own page lists every schedule with an inline Clear button; a fired "Send Invoice" schedule additionally becomes a dashboard planner action (§16). Clearing from the project page is reflected everywhere at once. There is no global notification surface in the nav shell.

---

## 4. Page Templates

| Template | Used by | Notes |
|---|---|---|
| **Dashboard** | Dashboard | See §16. |
| **Directory** | Parties list, Invoices list | A shared shape: a summary stat row (4 cards, §16's stat-card styling reused), a client-side search box, a server-driven filter chip row (`?type=`/`?status=` — Parties: All/Client/Contractor; Invoices: All/Draft/Sent/Paid/Overdue/Void), and the dark-header grid/mobile-card list itself (§9). Parties additionally offers a client-side **Table/Cards view toggle** (`ViewToggle`/`useViewPreference`, shared components — the choice persists via its own `localStorage` key) with a matching card-grid layout (accent bar / identity row / status-and-amount row / a small facts `<dl>` / footer link); Invoices is table-only. Below `1024px` both render stacked cards instead of a table regardless of the toggle — see §18. Parties' Client/Contractor filter is display-only, derived live from `Project.ContractorId`/`ClientId` — see `Docs/implementation_decisions.md` §15. |
| **Projects list** | Projects list | Diverges from the other two directories (2026-08-28 rework): no stat row. Search, the `?status=` filter chips (All/Active/Needs attention/Archived), and a **three-way Workspace/Cards/Rows view toggle** (its own inline component, not the shared `ViewToggle`; persisted the same `useViewPreference`/`localStorage` way) share one toolbar row — **Workspace** is the default. **Workspace**: a paginated (4 per page), 2-column grid of project cards — accent bar by billing-status tone, name + client·contractor, status pill, a facts `<dl>` (Billing/currency, Next invoice, Payment method — warns if missing), and up to 2 recent invoices or a "Create invoice" link when there are none. **Cards**: the same accent-bar/`<dl>` card shape the other two directories use, with an overdue-count note in the identity row and a labeled "Outstanding invoices" `<dl>` field (sent-invoice count) alongside Last billed/Next billing/Payment setup. **Rows**: the dark-header grid (§9), which also carries manual reorder arrows (`Project.SortOrder`) on the unfiltered Active and All tabs only — computed from a row's position **among ACTIVE projects specifically**, so an ARCHIVED row interleaved on the All tab never renders arrows or counts as a swap target; arrows are hidden entirely under an active search query or on the Needs attention/Archived tabs. |
| **Detail Tabs** | Project detail, Invoice detail (non-`DRAFT` only) | Three URL-driven tabs (`?tab=`, not client-side state, so a reload/share preserves the active tab): Project detail is Overview / Invoices & alerts / Billing setup; Invoice detail is Summary / Preview / Activity. A `DRAFT` invoice has no tabs — it's still the single edit-form page (next row), since there's nothing to preview/review yet. Overview/Summary tabs open on a row of 3–4 small metric cards, followed by a two-column facts panel + a supporting panel (recent activity / amount breakdown). |
| **Form/Detail — entity forms** | Create Party, Add Payment Method, Create/Edit Draft Invoice | Uses the `2fr/1fr` grid with the form in the `2fr` column; the `1fr` column is currently empty (no supporting card), which keeps form width consistent with the Project form. Create Invoice is gated behind a mandatory, searchable project-picker card grid first (§20's standing pattern) — the form itself only appears after a project is chosen, with a compact `ProjectContextBar` (avatar, currency, payment method, live invoice-number preview, a "Change" link back to the picker) standing in for the older two-column project-facts card. Form fields are grouped under 3 numbered section headers (Invoice details / Line items / Notes) — cosmetic grouping only, no change to validation or field behavior. |
| **Form/Detail — Project** | Create/Edit Project | Uses the `2fr/1fr` layout: form left, a supporting-info card right (e.g. existing project list). Contractor/Client pickers each need an inline "+ Create new party" affordance for when the list is empty. On the Project detail page, this same form renders inline as the "Billing setup" tab rather than a separate route. |
| **Internal** | `/internal` | One page, not a dashboard clone (§33): a 3-tile per-currency stat row (outstanding, drafts, paid this month), internal project cards each with a Create invoice action, and the shared invoice directory/table. Internal projects and invoices appear nowhere else; their detail pages are the regular ones trimmed of schedule UI and billing-health cards, with Back defaulting here. |
| **Settings** | AI providers (`/settings`) | A readiness banner ("N providers ready", green/muted by whether ≥1 provider is enabled + has a key + has at least one model) above a stack of exactly 3 fixed, collapsible provider cards (`Docs/implementation_decisions.md` §19 — no add/remove). Each card: a tone-colored avatar monogram, a Default/Fallback-N role badge, up/down reorder arrows, a collapse chevron (defaults expanded), an API key field with a client-side Show/Hide toggle, and a numbered, reorderable model list. |
| **Document Preview** | Invoice detail's Preview tab (or the whole page, for a `DRAFT`) | See §15. Must support both editable (`DRAFT`) and locked (`SENT`/`PAID`/`VOID`) states. |
| **Auth** | Login (`/login`) | Standalone page outside the app shell — no session yet, so no nav chrome. A two-panel split: a dark nav-surface brand panel (logo lockup, "Operational view" tagline) beside a plain light sign-in form (Google OAuth button, generic rejected-sign-in message). Below `1024px` the brand panel is hidden and the form goes full width. |

---

## 5. Typography

| Role | Size | Weight | Tracking | Color |
|---|---|---|---|---|
| Page title (`h1`) | 24px | 800 | -0.02em | text-primary |
| Page subtitle | 13px | 400 | normal | text-secondary |
| Card/section title | 15px | 700 | normal | text-primary |
| Body / table cell | 13px | 400–600 | normal | text-primary / text-secondary |
| Form label | 11px | 700 | 0.05em, uppercase | text-secondary |
| Table header | 11px | 700 | 0.05em, uppercase | text-secondary |
| Stat value | 28px | 700 | normal | text-primary, **mono** |
| Badge/tag text | 10px | 700 | uppercase | per-variant |
| Invoice doc ID | 20px | 800 | normal | brand, mono |
| Invoice grand total | 18px | 800 | normal | text-primary, mono |
| Converted-total figure | 13px | 700 | normal | text-secondary, mono — deliberately smaller/quieter than the primary total so it reads as secondary information, never competing with it. |

Sans = Inter, Mono = JetBrains Mono, loaded via `next/font`.

---

## 6. Spacing Scale

Stage padding 40/16px, card padding 24px (body)/20×24px (header), row-section gap 32px, panel gap 24px, form-field gap 16px, inline-control gap 8–12px.

---

## 7. Color Tokens

| Token | Hex | Tailwind equivalent | Usage |
|---|---|---|---|
| `--color-brand` | `#6366f1` | indigo-500 | Primary actions, active state, invoice ID |
| `--color-brand-hover` | `#4f46e5` | indigo-600 | Primary button hover |
| `--color-brand-light` | `#e0e7ff` | indigo-100 | Active-tag bg, default-method tag, date chips |
| `--bg-main` | `#f8fafc` | slate-50 | App canvas |
| `--bg-card` | `#ffffff` | white | Cards, panels |
| `--text-primary` | `#0f172a` | slate-900 | Headings, primary data |
| `--text-secondary` | `#475569` | slate-600 | Body, labels |
| `--text-muted` | `#94a3b8` | slate-400 | Captions, muted metadata |
| `--border-light` | `#e2e8f0` | slate-200 | Card/table borders |
| `--border-heavy` | `#cbd5e1` | slate-300 | Input borders |

### Status tokens (invoice lifecycle only — see §11)

| Status | Background | Text |
|---|---|---|
| `DRAFT` | `#f1f5f9` | `#475569` |
| `SENT` | `#fffbeb` | `#b45309` |
| `PAID` | `#ecfdf5` | `#047857` |
| `VOID` | `#fff1f2` | `#be123c` |
| `OVERDUE` *(derived)* | `#fef2f2` | `#b91c1c` |

### Relationship tokens (Parties directory only — display-only, not a lifecycle status)

| Relationship | Background | Text |
|---|---|---|
| `Client` | `#eff6ff` | `#1d4ed8` |
| `Contractor` | `#f5f3ff` | `#6d28d9` |
| `Client & Contractor` | `#f0fdfa` | `#0f766e` |
| `Unassigned` | `--muted` | `--muted-foreground` |

### Nav shell + dashboard-alert tokens

| Token | Value | Usage |
|---|---|---|
| Nav-shell dark surface | `#0f172a` | Sidebar/mobile topbar/bottom-tab-bar background, and every top-level list's table header row (Parties/Invoices/Projects) — reuses the `--text-primary` hex, not a new color. |
| Nav active tint | `rgba(99,102,241,0.2)` bg / `#a5b4fc` text | Active nav item on the dark surface only. |

### Semantic (validation/alert) tokens

| Token | Background | Border | Text |
|---|---|---|---|
| `--alert-info-bg` | `#f8fafc` | border-light | text-secondary |
| `--alert-warning-bg` | `#fffbeb` | `#fde68a` | `#92400e` |
| `--alert-error-bg` | `#fef2f2` | `#fecaca` | `#b91c1c` |
| `--alert-success-bg` | `#ecfdf5` | `#a7f3d0` | `#047857` |

---

## 8. Card Style & Buttons

White card, `1px solid border-light`, `10px` radius, `shadow: 0 1px 2px rgba(0,0,0,0.05)`; header `20px 24px` + bottom border; body `24px`.

| Variant | Style | Hover |
|---|---|---|
| `.btn-primary` | Solid brand bg, white text, semibold | brand-hover bg |
| `.btn-secondary` | White bg, border-light, secondary text | bg-main tint |
| `.btn-sm` | `font-size: 11px; padding: 4px 10px;` combine with primary/secondary | same as base |

---

## 9. Table Style

One table treatment for every top-level list (Parties, Projects, Invoices) and every embedded sub-list (e.g. a project's own Invoices & alerts tab reuses the exact same invoice table, just with its Project column hidden): a **dark-header grid table** — header row on the nav-shell dark surface (`#0f172a`, `#94a3b8` uppercase text), body rows as full-row links with a trailing chevron (Parties/Projects) or an explicit "Open invoice →" pill (Invoices — kept as literal visible link text alongside the whole-row click target, since interactive controls can't nest inside one another, and a row that's clickable everywhere still needs one explicit, discoverable "this opens something" affordance). Column specs for Invoices/Projects are in `design_handoff_dashboard_v2/README.md` §3/§4; Parties' own columns are Party (avatar + name + location) / Relationship / Contact / Active projects / Outstanding / Billing health. Below `1024px` every one of these lists renders stacked cards instead of a table (§18) — there is no separate "light table" treatment left anywhere in the app.

**Parties table specifically**: `Party` still has no stored role field (`Docs/implementation_decisions.md` §15) — the Relationship column (Client / Contractor / Client & Contractor) is computed live from which side of `Project.ContractorId`/`ClientId` a party actually appears on, not read off a database column. `Type` (`INDIVIDUAL`/`ORGANIZATION`) isn't shown in this table at all (it's still on the Party form/detail page) — Relationship replaced it as the more useful at-a-glance fact here.

Every list needs a defined empty state (§12) for zero rows.

---

## 10. Form Style

`.form-group` column flex, `6px` gap, `16px` bottom margin; label `11px` bold uppercase; input/select `36px` height, `border-heavy`, `13px`, `8px` radius; focus → brand border **plus a visible focus ring** (`2px` brand at 30% opacity — border-color change alone isn't sufficient for keyboard accessibility). Required fields marked `*`.

**Relational pickers (Contractor, Client, Project, Payment Method)**: standard `.form-select`, each optionally paired with an inline "+ Create new [entity]" link/button directly beneath or beside it when the list might be empty (Project form's Contractor/Client pickers — see §4).

See §13 for the error state.

---

## 11. Status Badges & Tags

Two distinct treatments, same base shape, different palettes. Both are the shadcn `Badge` primitive styled per the palettes below — there is no separate hand-built `Tag` component; "Status Badge" and "Tag" describe two *stylings* of `Badge`, not two components.

### Status Badge — invoice lifecycle only

```
.badge-draft    { background: #f1f5f9; color: #475569; }
.badge-sent     { background: #fffbeb; color: #b45309; }
.badge-paid     { background: #ecfdf5; color: #047857; }
.badge-void     { background: #fff1f2; color: #be123c; }
.badge-overdue  { background: #fef2f2; color: #b91c1c; }  /* derived: status=SENT && dueDate < today */
```

`OVERDUE` is never stored — compute it at render time and swap the badge, never show both.

### Tag — everything else

```
.tag-neutral  { background: #f1f5f9; color: #475569; }  /* e.g. INDIVIDUAL / ORGANIZATION, ARCHIVED */
.tag-brand    { background: var(--color-brand-light); color: var(--color-brand); }  /* e.g. Default payment method, ACTIVE project */
```

---

## 12. Empty States

```
.empty-state       { display:flex; flex-direction:column; align-items:center; text-align:center; padding: 48px 24px; gap: 8px; }
.empty-state-icon  { width:48px; height:48px; border-radius:50%; background: var(--bg-main); display:flex; align-items:center; justify-content:center; color: var(--text-muted); }
.empty-state-title { font-size:13px; font-weight:700; color: var(--text-primary); }
.empty-state-desc  { font-size:11px; color: var(--text-muted); max-width: 280px; }
```

Applies to: "No parties yet" → "Create your first party"; "No payment methods" → "Add a payment method"; "No projects yet" → "Create your first project" (shown at the mandatory project-picker gate on Create Invoice, §4); "No invoices yet" → "Create your first invoice."

---

## 13. Validation States

```
.form-input.is-error, .form-select.is-error { border-color: #dc2626; }
.form-error-text { font-size: 11px; color: #b91c1c; margin-top: 4px; }

.alert           { border-radius: var(--radius-sm); border: 1px solid; padding: 12px 16px; font-size: 11px; line-height: 1.4; }
.alert-info      { background: var(--alert-info-bg); border-color: var(--border-light); color: var(--text-secondary); }
.alert-warning   { background: var(--alert-warning-bg); border-color: #fde68a; color: #92400e; }
.alert-error     { background: var(--alert-error-bg); border-color: #fecaca; color: #b91c1c; }
.alert-success   { background: var(--alert-success-bg); border-color: #a7f3d0; color: #047857; }
```

`alert-warning` for "missing preferred payment method" / "no line items yet"; `alert-error` for the blocked-send validation checklist (due date on/after issue date, converted total required for a `DUAL`-mode project, at least one line item, etc.); `alert-success` for confirmations.

---

## 14. AI Text Help

AI is limited to a small, field-level affordance — an "Improve" button after the label of each line-item description, the items note and the bottom note on the **Invoice** form (never Project), per `Docs/implementation_decisions.md` §19. There is no chat panel and no persistent AI column in any layout.

- **Behavior signal**: when a field is rewritten, it flashes briefly (`brand-light` background, the `highlighted` prop on `FormField`/`LineItemsEditor`) so the admin sees exactly what changed before saving; the form is never submitted on the admin's behalf.
- **Absence is normal, not broken**: with no provider configured the affordance is not rendered at all — no empty state, no `alert-error`; the form never indicates anything is "missing."
- **Settings entry point**: provider/model/key configuration lives only on the `ADMIN`-only `/settings` page — never inline on a form.

---

## 15. Invoice Preview Layout — owned by `Docs/invoice_design_guidelines.md`

The invoice document's layout/typography/color spec lives entirely in **`Docs/invoice_design_guidelines.md`** — read that file, not this section, before touching `InvoiceDocument.tsx` or its CSS module. App-chrome facts that live on this side of the boundary:

- The invoice document is a **fixed A4 page** (`210mm × 297mm`, `15mm` padding) using `mm`/`pt` units throughout via its own CSS module — not the px-based token system in this guide. No bordered/rounded "card" framing in any context.
- The in-app preview at `/invoices/[id]` and the bare `/invoices/[id]/print` route (the exact page the PDF is generated from) render the same component with the same styling — preview and PDF must be visually identical.
- The document's status indicator is a small, subtle marker in its metadata block, rendered locally within the document component — not the shared `StatusBadge` (§11), which is used in lists/page headers only.
- The payment section heading is the literal copy "Payment to be made to:", not "Payment Details".

**Locked state**: when status is `SENT`, `PAID`, or `VOID`, render a read-only banner above the document (hidden in print output):

```
.doc-lock-banner { display:flex; align-items:center; gap:8px; background: var(--bg-main); border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 10px 16px; font-size: 11px; color: var(--text-secondary); margin-bottom: 16px; }
```

Copy: "This invoice is locked. Line items, snapshots, and totals can no longer be edited." No edit controls render at all in this state.

---

## 16. Dashboard Design Rules

Single view, no toggle — the dashboard (bare `/`) is the **Weekly action planner**: one highest-priority action per active project, grouped by urgency. There is no separate List/Health view and no `?view=` param anymore; that duo (originally documented here, and in `design_handoff_dashboard_v2/README.md` §2) was fully replaced 2026-08-28.

- **Header**: today's date as the eyebrow (e.g. "Monday, August 31"), title "This week", subtitle "The next action required for each project, ordered by urgency," and a "+ New Invoice" action button.
- **One action per project**, selected by a fixed precedence: overdue > invoice-to-prepare (a fired `ProjectAlertSchedule`) > stale draft > due soon > payment-method-missing setup gap. When a project has ≥2 items in the same category (e.g. 2 overdue invoices), they don't just show the most urgent one — siblings fold into a single aggregate line ("N invoices overdue") with the combined total and a "View invoices →" link, bailing out to the single-item display if the siblings don't share a currency (§17 — this app never blends currencies in one figure).
- **Filter chip row** above the planner card: Overdue / Today (hidden entirely when its count is 0) / Next 7 days / Later / Unscheduled, each showing a live count, plus a separate "On track" chip for projects with no action due. Clicking a chip filters the card to just that section (or, for "On track", swaps to a flat list of healthy projects); clicking the active chip again returns to showing everything.
- **Planner card**: a header (calendar icon, "Weekly action planner" title, "One highest-priority action per project" subtitle) above urgency-labeled sections, each with a colored strip header (reusing the same status/urgency tone tokens used elsewhere) and rows beneath. Each row: project + client name (links to the project, carrying `returnTo=%2F`), the issue description plus an optional note, the amount (when there is one) and a timing string (bold/red when overdue), and an action button — which may render disabled with an explanatory tooltip (e.g. "Send reminder" — no email/notification-sending infrastructure exists anywhere in this app; a real, acknowledged gap, not a bug).
- **"No action required" panel**: a collapsible section below the planner card (shown whenever at least one project is on-track and no chip filter is active) listing every project with nothing due — the same content the "On track" chip's filtered view shows, just collapsed by default.
- **No recent-activity/lifecycle rows anywhere on this page** — a plain "invoice was sent" or "project was created" event never appears here. This is a deliberate scope cut, not an oversight.
- **"Stale draft" threshold is 1 day**, **"due soon" window is 7 days**, both single named constants (`STALE_DRAFT_DAYS`, `DUE_SOON_WITHIN_DAYS` in `src/lib/dashboardTrend.ts`, also reused by the Invoices list and party billing status) so either is changeable without touching multiple call sites.
- `VOID` invoices are excluded from every dashboard count and total.
- **Currency rule per §17**: every aggregate figure on this page sums same-currency invoices only; a currency mismatch bails out to per-invoice display rather than blending.

The Projects page's own reorder arrows and card/table views are documented in §4's "Projects list" row, not here — they moved off the dashboard entirely as part of this rework.

---

## 17. Currency Display Rules

- Every rendered amount uses the invoice's own denominated currency (`Invoice.Currency` — `Docs/implementation_decisions.md` §17) with an explicit currency indicator — don't assume the reader infers it.
- For a `DUAL`-mode project's invoices, one additional figure appears: the manually-entered, locked `ConvertedTotal` in `ConvertedCurrency` — styled as secondary (§5, §15), never replacing or visually competing with the primary total.
- Never hardcode `$` (or any single symbol) in a shared component — use the actual currency code/symbol for whichever figure is being rendered.
- Dashboard aggregates never blend currencies — see §16.

---

## 18. Responsive Behavior

Breakpoints `640/768/1024/1280px`.

- `<1024px`: the sidebar is replaced by the dark top bar + bottom tab bar (§3).
- `<1024px`: every top-level list — **Parties, Projects, Invoices** — renders stacked cards instead of its table (§4/§9). Smaller embedded tables keep horizontal scroll inside their own `overflow-x-auto` wrapper instead of switching to cards.
- `<768px`: `2fr/1fr` layouts collapse to a single column, the supporting card (where there is one) stacking below the primary panel.
- Invoice document padding `48px → 20px` on small screens (preview context only — print/PDF output is always the fixed A4 geometry, §15).

---

## 19. Tailwind / shadcn Implementation Guidance

```js
theme: {
  extend: {
    colors: {
      brand: { light: '#e0e7ff', DEFAULT: '#6366f1', hover: '#4f46e5' },
      status: {
        draft:   { bg: '#f1f5f9', text: '#475569' },
        sent:    { bg: '#fffbeb', text: '#b45309' },
        paid:    { bg: '#ecfdf5', text: '#047857' },
        void:    { bg: '#fff1f2', text: '#be123c' },
        overdue: { bg: '#fef2f2', text: '#b91c1c' },
      },
    },
    fontFamily: { sans: ['Inter', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
    borderRadius: { sm: '6px', md: '10px', lg: '14px' },
  }
}
```

- `Button`: `variant="default"` → `.btn-primary`; `variant="outline"` → `.btn-secondary`; `size="sm"` → `.btn-sm`.
- `Badge`: two separate variants — `status` (5 fixed) and `tag` (neutral/brand only) — never share a prop enum.
- `Card`: shadcn `<Card>` primitives, override border to `border-slate-200/90`, shadow to the documented `shadow-sm`.
- Load fonts via `next/font/google`.
- Render currency using `Intl.NumberFormat(locale, { style: 'currency', currency })` with the actual currency being displayed — never a hardcoded `$`.
