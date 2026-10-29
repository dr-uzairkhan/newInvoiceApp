# Invoice App

A **single-tenant invoice tracking application** for freelancers and contractors: manage parties, projects, and invoices with a locked snapshot lifecycle, generate pixel-identical Excel and PDF invoice documents, and get an operational dashboard that surfaces what actually needs attention.

> [!NOTE]
> **Authentication is Google OAuth, allowlist-only — there's no self-registration.** Every route requires a signed-in session; a sign-in only succeeds if the email already has a `User` row (added by an existing admin, or by the bootstrap script for the very first one — see [Getting started](#getting-started)). See `Docs/implementation_decisions.md` §8.

![Dashboard](Docs/screenshots/dashboard.png)

<table>
  <tr>
    <td width="50%"><img src="Docs/screenshots/invoices.png" alt="Invoices list with status filters" /></td>
    <td width="50%"><img src="Docs/screenshots/invoice-document.png" alt="Invoice document preview with lifecycle actions" /></td>
  </tr>
</table>

<p align="center">
  <img src="Docs/screenshots/dashboard-mobile.png" alt="Mobile dashboard with bottom tab bar" width="320" />
</p>

_Screenshots show the bundled demo seed data._

## Features

- **Parties** — one unified roster of people/organizations; any party can act as a contractor, a client, or both. Payment methods (bank wire, Zelle, Payoneer, custom) with fully custom ordered field lists, **encrypted at rest**.
- **Projects** — the bridge between a contractor and a client: preferred payment method, invoice-number format (`{abbreviation}`/`{number}`/`{date}`/`{year}`/`{month:MMM}` placeholders, with month- or year-scoped sequences and a recognised history of previous formats), invoice period for due-date defaults, and single- or dual-currency mode.
- **Invoices** — `DRAFT → SENT → PAID` lifecycle (or `→ VOID`), with party/payment details snapshotted and **permanently locked at send time** so historical invoices survive future profile edits. Hourly and flat-amount line items, invoice notes, per-project invoice numbering.
- **Comments** — an operational log per invoice ("client confirmed receipt"), added from the Activity tab or any list row, in any status; never printed on the document.
- **Documents** — an on-screen A4 preview that is pixel-identical to the downloadable **PDF** (Puppeteer) and mirrored in the downloadable **Excel** workbook (ExcelJS). No files stored server-side; generated on demand.
- **Currency** — a project denominates invoices entirely in one currency (`SINGLE` mode: USD/AUD/GBP/NZD/AED/PKR/SAR) or works USD-primary with a manually-entered converted total (`DUAL` mode). Dashboards never blend currencies.
- **Dashboard** — a weekly action planner: one highest-priority action per project (overdue, invoice to prepare, draft to send, upcoming billing, setup gap), grouped by urgency, with same-category invoices folded into one line.
- **Authentication** — Google OAuth via Auth.js, no self-registration; database-backed sessions so revoking access takes effect immediately. Three roles (`ADMIN`/`STANDARD`/`RESTRICTED`), managed at `/settings/users`.
- **MCP server** — `/api/mcp` lets Claude Code (or any Streamable-HTTP MCP client with a bearer token) operate the app: parties, payment methods, projects, reminders, invoices, comments and PDFs, through the same rules as the UI. Scoped personal tokens, per-call audit log. See `Docs/mcp_server.md`.
- **Internal ledger** — projects marked internal issue on-demand invoices from any party and stay off the main dashboard, lists and counts; they have their own section at `/internal`.

## Tech stack

Next.js (App Router) · React · TypeScript · Prisma + PostgreSQL · Tailwind CSS + shadcn-style primitives · Puppeteer (PDF) · ExcelJS (Excel) · Vitest.

## Getting started

**Prerequisites:** Node.js ≥ 24, [pnpm](https://pnpm.io), Docker (for the local Postgres container).

```bash
git clone https://github.com/dr-uzairkhan/newInvoiceApp.git
cd newInvoiceApp
pnpm install                       # also runs prisma generate

docker compose up -d db            # local Postgres on :5432
cp .env.local.example .env.local   # fill in the auth values below before continuing

pnpm prisma migrate dev            # apply migrations
pnpm prisma db seed                # optional: demo data (parties/projects/invoices only)
```

Every route requires a signed-in session — there's no self-registration, so
sign-in only works once your own email has a `User` row. Before running
`pnpm dev`, fill in `.env.local`'s auth section:

1. Create a Google Cloud OAuth client (console.cloud.google.com) — consent
   screen audience "External", authorized redirect URI
   `http://localhost:3001/api/auth/callback/google`. Set `GOOGLE_CLIENT_ID`/
   `GOOGLE_CLIENT_SECRET` from it.
2. Set `AUTH_SECRET` (`openssl rand -base64 32` or `npx auth secret`).
3. Bootstrap yourself as the first admin: `pnpm tsx scripts/bootstrapAdmin.ts you@example.com`
   (matches whatever Google account you'll sign in with).

Then `pnpm dev` → **http://localhost:3001**, sign in with Google.

The app runs on **port 3001** by default (change `dev`/`start` in `package.json` and `NEXT_PUBLIC_APP_URL` in `.env.local` together if you need a different port).

### Optional: AI providers

The app can call Google, Anthropic, or Groq models for the "Improve" buttons beside invoice text fields. Open `/settings`, add an API key for the providers you want, and list the models to try in order. Nothing requires this — every form is fully usable by hand. Keys are encrypted at rest with `SETTINGS_ENCRYPTION_KEY` from `.env.local` — set it to any string before saving keys, and don't change it afterwards (saved keys become undecryptable).

## Scripts

| Command                     | What it does                                          |
| --------------------------- | ----------------------------------------------------- |
| `pnpm dev`                  | Dev server on port 3001                               |
| `pnpm build` / `pnpm start` | Production build / serve                              |
| `pnpm test`                 | Vitest suite (unit + integration — see warning below) |
| `pnpm typecheck`            | `tsc --noEmit`                                        |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                     |

Integration tests run against a **dedicated test database** (`TEST_DATABASE_URL`, defaulting to `newinvoice_test` on the same Docker Postgres server) — created and migrated automatically before each run. They never touch the development database in `DATABASE_URL`.

## Architecture in brief

A modular monolith with strict layering — UI components never touch the database:

```
src/
  app/            # Next.js routes (pages, API routes, server actions entry)
  components/     # React components (layout, per-entity, ui primitives)
  services/       # business logic (lifecycle rules, snapshots, validation)
  repositories/   # thin Prisma wrappers — no business rules
  lib/            # pure helpers (currency, dates, pdf/excel builders, ai providers)
prisma/           # schema, migrations, seed
Docs/             # design & decision documentation
```

Key design decisions — no tax fields, snapshot locking semantics, the currency model, deletion rules, why PDF generation renders the same HTML as the preview — are documented with rationale in [`Docs/implementation_decisions.md`](Docs/implementation_decisions.md), with the full data schema and workflows in [`Docs/product_spec.md`](Docs/product_spec.md). UI conventions live in [`Docs/ui_design_guide.md`](Docs/ui_design_guide.md), and the invoice document's print spec in [`Docs/invoice_design_guidelines.md`](Docs/invoice_design_guidelines.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
