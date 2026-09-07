# Invoice Application Architecture & Specification

The logical data schema and operational workflows for the application. See `Docs/implementation_decisions.md` for the rationale behind each decision.

This is a database-agnostic logical schema and set of operational workflows for a **single-tenant** invoice tracking application. `Identifier`, `Text`, `Decimal`, `List`, `Boolean`, `Timestamp`, and `Date` map to whatever the target database/ORM framework calls them.

## 1. Logical Data Schema

### 1.1 Entity: Party

Represents any legal individual or organization — the billing entity (contractor) and the paying entity (client) share this single format. **There is no stored role field.** The same `Party` record may be freely used as a `Project`'s contractor, its client, or both — nothing on `Party` itself distinguishes how it's used.

Address is inlined directly onto `Party` — each party has at most one address, so there is no separate `Address` entity.

| Field | Type | Description |
|---|---|---|
| `Id` | Identifier, Primary Key | Unique system identifier. |
| `Name` | Text | Legal entity name or individual's full name. |
| `Email` | Text, Optional | Primary email address, validated if present. |
| `Type` | Enum / Text | `INDIVIDUAL` or `ORGANIZATION`. This is the only classification field on `Party` — it is unrelated to how the party is used in a `Project`. |
| `Street1` | Text, Optional | Primary street details. |
| `Street2` | Text, Optional | Unit/suite/secondary street details. |
| `City` | Text, Optional | City or township. |
| `State` | Text, Optional | State, province, or region. |
| `PostalCode` | Text, Optional | Postal or ZIP code. |
| `Country` | Text, Optional | Country name or standard code. |
| `CreatedAt` | Timestamp | Record initialization date. |

**Deletion**: a `Party` may be deleted only if it is not currently referenced by any `Project` as `ContractorId` or `ClientId` (see §7).

### 1.2 Entity: PaymentMethod

Defines how a contractor can receive funds, using an ordered list of custom label-value objects rather than fixed bank-field schemas.

| Field | Type | Description |
|---|---|---|
| `Id` | Identifier, Primary Key | Unique configuration identifier. |
| `PartyId` | Identifier, Foreign Key | The contractor `Party.Id` who owns this payment method. |
| `Type` | Text | `BANK_WIRE`, `ZELLE`, `PAYONEER`, or `CUSTOM`. |
| `Label` | Text | Internal nickname, e.g. `Chase Checking Account`. |
| `IsDefault` | Boolean | Global fallback option for the contractor. |
| `Fields` | List of Objects | Ordered `{ key, label, value }` objects — see §2 for examples. |

**Invariant**: the application enforces at most one `IsDefault` `PaymentMethod` per `Party` — setting a new default un-sets any prior one.

**Deletion**: a `PaymentMethod` may be deleted only if it is not currently set as any `Project`'s `PreferredPaymentMethodId` (see §7). No historical `Invoice` ever blocks deletion, since payment details are captured into a detached `PaymentDetailsSnapshot`, never referenced live.

### 1.3 Entity: Project

The bridge between a contractor and a client, and the home for per-engagement configuration.

| Field | Type | Description |
|---|---|---|
| `Id` | Identifier, Primary Key | Unique project identifier. |
| `Name` | Text | Operational name of the engagement. |
| `Abbreviation` | Text, Optional | Short code (e.g. `TQ`) sourcing the `{abbreviation}` placeholder in `InvoiceNumberFormat`. If left blank, auto-derived from the initials of `Name`. |
| `ServiceDescription` | Text, Optional | Customer-facing text shown in the invoice document's "Details" summary column. If left blank, falls back to `Name`. Live-joined at invoice render time, never snapshotted onto `Invoice` — editing it retroactively changes the Details text on every invoice under the project, including already-SENT ones. |
| `ClientId` | Identifier, Foreign Key → `Party.Id` | The paying party. Any party may fill this role. |
| `ContractorId` | Identifier, Foreign Key → `Party.Id` | The billing party. Any party may fill this role — including the same party used as `ClientId` on a different project. |
| `PreferredPaymentMethodId` | Identifier, Foreign Key, Optional → `PaymentMethod.Id` | Must belong to `ContractorId`. Defaults the payout channel for child invoices. |
| `InvoiceNumberFormat` | Text / Configuration | Template for auto-generating invoice numbers, e.g. `{abbreviation}-{number}-{date}` or `TQ-{year_short}/G/{number}`. Recognized placeholders: `{abbreviation}` (resolves from `Project.Abbreviation` above), `{number}` (the project's own auto-incrementing sequence, zero-padded to 2 digits), `{date}` / `{date:MM-DD-YYYY}` / `{date:DD-MM-YYYY}` / `{date:MM/DD/YYYY}` / `{date:DD/MM/YYYY}` (today's date, `MM-DD-YYYY` by default), `{year}` (current 4-digit year), `{year_short}` (current year, last 2 digits only — `26` not `2026`), `{month}` and `{day}` (current month/day, zero-padded 2 digits). Any other `{...}` text is not recognized and passes through as a literal string. |
| `DisplayCurrency` | Enum: `USD`, `AUD`, `GBP`, `NZD`, `AED`, `PKR`, `SAR` | Default `USD`. Its meaning depends on `CurrencyMode` — see §5 (Currency Model). |
| `CurrencyMode` | Enum: `SINGLE`, `DUAL` | Default `SINGLE`. Whether `DisplayCurrency` denominates the whole invoice (`SINGLE`) or only adds a converted-total figure alongside USD core amounts (`DUAL`) — see §5. |
| `InvoicePeriodType` | Enum, Optional: `WEEKLY`, `SEMI_MONTHLY`, `MONTHLY` | Drives the invoice create form's default due-date computation (+7 days, +15 days, or calendar-month arithmetic clamped to the target month's last day). Pure UI convenience — no server-side enforcement; unset means no auto-computed due date. |
| `ReferralCreditEnabled` | Boolean, default `false` | Whether the invoice form shows an "Add Referral Credit" button for this project — see §1.5's `IsReferralCredit`. |
| `ReferralCreditLabel` | Text, Optional | Overrides the referral-credit line item's default description ("Referral Credit (Thank you!)"). Only meaningful when `ReferralCreditEnabled` is true; freely editable per-invoice afterward, same fallback shape as `ServiceDescription`. |
| `Status` | Text | `ACTIVE` or `ARCHIVED`. |
| `SortOrder` | Integer | Manual global display order for the Projects page's card/table views. Reordered via up/down arrows on the Projects page's Rows view (unfiltered Active and All status tabs only), which swap `SortOrder` with the nearest `ACTIVE` project rather than renumbering the whole list. A new project appends to the end. Global, not per-user. |
| `CreatedByUserId` | Identifier, Foreign Key, Optional → `User.Id` | Which user created this project — set once at creation, never updated. `null` for projects created before M28 (auth). Removing that `User` sets this to `null` too (`SetNull`), never blocked or cascaded. |

**Deletion**: a `Project` may be deleted only if it has zero `Invoice` rows (see §7).

### 1.4 Entity: Invoice

The immutable master ledger entry for a requested payment. Stores flat historical copies of related entity attributes so historical records survive future profile edits.

| Field | Type | Description |
|---|---|---|
| `Id` | Identifier, Primary Key | Unique ledger identifier. |
| `ProjectId` | Identifier, Foreign Key | Parent `Project.Id`. |
| `InvoiceNumber` | Text | Auto-generated from the project's `InvoiceNumberFormat`; editable while `DRAFT`. Unique **within its project** — enforced as a composite unique constraint on `(ProjectId, InvoiceNumber)`, not globally unique. |
| `Status` | Text | `DRAFT`, `SENT`, `PAID`, or `VOID` — see §6 for the transition rules. |
| `IssueDate` | Date | Date the invoice becomes active. |
| `DueDate` | Date | Payment deadline. Must be on/after `IssueDate`. |
| `PeriodStart` | Date, Optional | Start of the billing period this invoice covers — distinct from `IssueDate`/`DueDate`, which are about payment timing, not the work period. Independently optional of `PeriodEnd` at the schema level; app validation requires `PeriodEnd >= PeriodStart` when both are set. `null` for a non-period-based invoice (e.g. a flat one-off fee). |
| `PeriodEnd` | Date, Optional | End of the billing period this invoice covers. See `PeriodStart`. |
| `Subtotal` | Decimal | Sum of all `InvoiceItem.Amount` values, denominated in `Currency`. |
| `Total` | Decimal | Always equal to `Subtotal` — **there is no tax in MVP**, so no `Subtotal + Tax` computation exists anywhere. |
| `Currency` | Enum (same values as `DisplayCurrency`) | The currency `Subtotal`/`Total`/item rates are actually denominated in: always `USD` for a `DUAL`-mode project, the project's `DisplayCurrency` for a `SINGLE`-mode one. Derived, not user-edited; locked at `SENT` (§6). |
| `ConvertedTotal` | Decimal, Optional | Manually entered by the admin when the parent project is `DUAL` currency mode (§5); always `null` for `SINGLE`-mode projects. Not calculated by the system (no exchange-rate lookup in MVP). Snapshotted/locked at the same moment as the rest of the invoice (§6). |
| `ConvertedCurrency` | Text, Optional | A copy of the project's `DisplayCurrency` at the time the invoice was created/finalized — snapshotted so a later change to the project's setting doesn't retroactively relabel a historical invoice's converted amount. |
| `FromPartySnapshot` | Object | Copy of the Contractor's Name, Email, and address fields at snapshot time. |
| `ToPartySnapshot` | Object | Copy of the Client's Name, Email, and address fields at snapshot time. |
| `PaymentDetailsSnapshot` | List of Objects | Copy of the chosen `PaymentMethod.Fields` array. There is **no** `PaymentMethodId` foreign key on `Invoice` — the snapshot alone is sufficient; it exists for historical record-keeping, not detailed audit trails. |
| `ItemsNote` | Text, Optional | Free-text note describing the line items as a whole, rendered unlabeled/italic below them on the document. Plain admin-authored content, not a snapshot of live external data — ordinary `DRAFT`-editable/locked-once-`SENT` field like `InvoiceNumber`. |
| `BottomNote` | Text, Optional | A separate, independently-optional free-text note rendered near the bottom of the document (bold label + value), below the totals. Same editability rule as `ItemsNote` — the two are unrelated fields, not a repeat of one value. |
| `CreatedByUserId` | Identifier, Foreign Key, Optional → `User.Id` | Which user created this invoice — set once at creation, never updated. `null` for invoices created before M28 (auth). Removing that `User` sets this to `null` too (`SetNull`), never blocked or cascaded. |

There is no `Tax` field. `Currency` records what the core amounts are denominated in — it is derived from the project's currency mode (§5), never a free per-invoice selection.

### 1.5 Entity: InvoiceItem

| Field | Type | Description |
|---|---|---|
| `Id` | Identifier, Primary Key | Unique item identifier. |
| `InvoiceId` | Identifier, Foreign Key | Parent `Invoice.Id`. |
| `Description` | Text | Required. Statement of the task/service/product. |
| `IsFlatAmount` | Boolean, default `false` | Per-item toggle between Hourly (`false`) and Flat (`true`) pricing mode, mixable within one invoice — see below. |
| `IsReferralCredit` | Boolean, default `false` | Marks at most one item per invoice (app-enforced, not a DB constraint) as a referral-credit deduction. Implies the same null-`Quantity`/`UnitPrice`, direct-`Amount` shape as `IsFlatAmount` (also set true alongside it). The admin only ever types a positive magnitude — negated server-side before storage, so `Amount` is the one negative figure on the invoice. Always rendered last in the document regardless of `SortOrder`. |
| `Quantity` | Decimal, Optional | Required and must be greater than `0` when `IsFlatAmount` is `false` (Hourly); always `null` when `IsFlatAmount` is `true` (Flat). |
| `UnitPrice` | Decimal, Optional | Required and must be `>= 0` when `IsFlatAmount` is `false`; always `null` when `IsFlatAmount` is `true`. Denominated in the invoice's `Currency`. |
| `Amount` | Decimal | For an Hourly item: `Quantity * UnitPrice`, calculated by the backend — never trusted from the frontend. For a Flat item: entered directly by the admin and trusted as submitted — the one narrow, deliberate exception to "amount is always backend-calculated" (there is nothing to compute it from). For a referral-credit item: the admin's submitted positive magnitude, negated. |
| `DurationText` | Text, Optional | Free-text label (e.g. "Fixed", "50%", "2 weeks") shown in place of the Unit(Hrs)/Rate columns for a Flat item. Required (non-empty) when `IsFlatAmount` is `true` and `IsReferralCredit` is `false`; always `null` for an Hourly item and for the referral-credit item. See `Docs/implementation_decisions.md` §10 for the invoice-wide Duration-column layout rule. |
| `SortOrder` | Integer | Preserves line-item display order; the underlying relational store has no inherent row order for a "list" of items. A referral-credit item ignores this at render time (see `IsReferralCredit`). |

### 1.6 Entity: ProjectAlertSchedule

A day-of-month reminder for a `Project`, purely calendar-driven and in-app only (no email/push, no scheduler) — see `Docs/implementation_decisions.md` §24.

| Field | Type | Description |
|---|---|---|
| `Id` | Identifier, Primary Key | Unique schedule identifier. |
| `ProjectId` | Identifier, Foreign Key | Parent `Project.Id`. |
| `DayOfMonth` | Integer (1–31) | The trigger day. Clamped to the target month's actual last day when it doesn't exist (e.g. `31` fires on Feb 28/29). |
| `Recurring` | Boolean, default `true` | `true`: once cleared, the alert automatically re-fires on the same day next month. `false`: once cleared, the alert is permanently done and never fires again. |
| `Label` | Text, Optional | Free-text description shown when the alert fires (e.g. `Send invoice`). Falls back to a generic "Day N reminder" when unset. A schedule counts as an invoicing reminder for billing-status/next-invoice-date purposes only if this is exactly `Send Invoice` (case-insensitive) — any other value (or none) is treated as a general-purpose reminder unrelated to invoicing. |
| `ClearedAt` | Timestamp, Optional | Set when an admin dismisses the alert's current occurrence. Interpreted together with `Recurring` and `DayOfMonth` — never read as a standalone "is cleared" flag. |

**Firing**: an alert is "fired" once the current date reaches `DayOfMonth` for the current month, and it hasn't already been cleared for that occurrence — *and* the schedule existed before that occurrence's date arrived. A schedule created after its `DayOfMonth` has already passed for the current month (e.g. creating a "7th of the month" alert on the 30th) does not retroactively fire; it waits for the day's next real occurrence. This only suppresses the creation month's own occurrence — from the next calendar month onward, firing works normally. A fired alert surfaces in three places: the global nav bell (visible from every page, with a badge count), a small indicator next to the project's name on the Projects list, and the project's own detail page. Clearing is a single action shared by all three — an alert cleared from any one of them is reflected on the others immediately.

**Deletion**: freely deletable by the admin at any time (no live reference ever blocks it); cascades automatically when the parent `Project` is deleted.

### 1.7 Entity: User

Google-OAuth-only, no self-registration — see `Docs/implementation_decisions.md` §8.

| Field | Type | Description |
|---|---|---|
| `Id` | Identifier, Primary Key | Unique user identifier. |
| `Email` | Text, Unique | The allowlist key — a Google sign-in only succeeds if this email already has a `User` row. |
| `Name` | Text, Optional | Synced from the signed-in Google account's profile on every login, not fixed at creation. |
| `Image` | Text, Optional | Profile photo URL, synced the same way as `Name`. |
| `Role` | Enum: `ADMIN` \| `STANDARD` \| `RESTRICTED`, default `RESTRICTED` | `ADMIN`: full access, including `/settings`. `STANDARD`: full access except `/settings`. `RESTRICTED`: full Invoice access, but cannot create/edit/delete Project/Party/PaymentMethod, and cannot access `/settings`. |

**Sessions**: database-backed — an `Account`/`Session`/`VerificationToken` set of tables owned outright by the Auth.js Prisma adapter (standard shape, not hand-designed business entities). Deleting a `User` row cascades to their sessions, so removing or demoting someone's access takes effect immediately rather than waiting out a token's expiry.

**Bootstrapping the first admin**: a committed, parameterized script (`scripts/bootstrapAdmin.ts <email>`), never a hardcoded email in tracked source — works identically for a self-hosted fork.

## 2. Structural Examples for Dynamic Payment Fields

Unchanged from the original spec:

```json
[
  { "key": "bank_name", "label": "Bank Name", "value": "Deutsche Bank" },
  { "key": "iban", "label": "IBAN", "value": "DE89 3704 0044 0532 0130 00" },
  { "key": "bic_swift", "label": "BIC / SWIFT Code", "value": "DEUTDEDDXXX" },
  { "key": "beneficiary", "label": "Beneficiary Corporate Account", "value": "Acme Global Solutions GmbH" }
]
```

```json
[
  { "key": "bank_name", "label": "Financial Institution", "value": "JPMorgan Chase Bank" },
  { "key": "routing_number", "label": "Routing Number (ABA)", "value": "021000021" },
  { "key": "account_number", "label": "Account Number", "value": "9876543210" }
]
```

```json
[
  { "key": "zelle_tag", "label": "Zelle Registered Email", "value": "payments@freelancer.io" }
]
```

## 3. Core Prerequisites for Invoice Creation

| Prerequisite | Description |
|---|---|
| Contractor Presence | An existing `Party` record — any party, regardless of how it's used elsewhere. |
| Client Presence | An existing `Party` record — any party, including one also used as a contractor on another project. |
| Active Payout Profile | At least one `PaymentMethod` row assigned to the Contractor's `PartyId`. |
| Assigned Project | A `Project` record explicitly binding `ContractorId` to `ClientId`. |
| Routed Payment Path | The `Project`'s `PreferredPaymentMethodId` is set, or the admin selects an alternative active `PaymentMethod` belonging to the contractor during invoice compilation. |

## 4. Operational Workflows

```text
[Workflow 1: Onboard Parties]
       ↓
[Workflow 2: Configure Contractor Payments]
       ↓
[Workflow 3: Setup Project & Preferences]
       ↓
[Workflow 4: Invoice Creation]
```

### Workflow 1: Onboarding Parties

**Inputs**: Name, `Type` (`INDIVIDUAL`/`ORGANIZATION`), optional Email, optional address fields (Street/City/State/ZIP/Country — one address, inlined). No role is collected — none exists.

**Execution**: creates a new `Party` row with the address fields inlined directly on it. No dependent `Address` row is created.

### Workflow 2: Configuring Contractor Payment Methods

Unchanged from the original spec: select a contractor, pick a template (`BANK_WIRE`/`ZELLE`/etc.), fill in the dynamic fields, optionally override field labels, save as an ordered `{key, label, value}` array on a new `PaymentMethod` row.

### Workflow 3: Creating the Project & Establishing Preferences

**Inputs**: Project Name, Client (picked from the full party list), Contractor (picked from the full party list — the same list, no role filtering), optional Preferred Payment Method (must belong to the selected contractor), `InvoiceNumberFormat`, `DisplayCurrency`.

**UI requirement**: both the Client and Contractor pickers must offer an inline "**+ Create new party**" escape hatch for when the needed party doesn't exist yet, rather than forcing the admin to abandon the project form.

**Verification**: the chosen `PreferredPaymentMethodId` must belong to the specified `ContractorId`.

### Workflow 4: Invoice Creation & Snapshot Isolation

**Entry point**: selecting "Create Invoice" always first shows a picker of existing `Project`s — an invoice cannot be started without picking one. There is no path to the invoice form that skips this.

**Inputs after project selection** (contractor, client, preferred payment method, and invoice-number format are all pre-filled from the project and not re-entered): auto-generated invoice number (editable while `DRAFT`; if the project's last SENT/PAID invoice's number doesn't structurally fit the project's current `InvoiceNumberFormat` — the format changed, or that invoice was numbered by hand — a small warning names the mismatched number below the field, though the suggestion itself is still generated from the current format), Issue Date, Due Date, an optional `PeriodStart`/`PeriodEnd` (defaults: `PeriodStart` chains off the project's last SENT/PAID invoice's `PeriodEnd` + 1 day, or blank for a project's first invoice; `PeriodEnd` defaults to Issue Date, both freely overridable), an array of line items (Description, Quantity, UnitPrice), and — only if the project's `DisplayCurrency` is not `USD` — a manually-entered `ConvertedTotal`. Once both period fields are set, `ItemsNote` is pre-filled with a plain-English sentence describing them (create mode only, and only until manually edited) — there is no separate "billing period" field on the invoice document itself, this is the only surface that renders it.

**Assembly**:
1. **Context Lookup** — resolve the parent project's contractor/client/payment-method configuration.
2. **Calculation** — `Amount = Quantity × UnitPrice` per line, summed into `Subtotal`; `Total = Subtotal` (no tax).
3. **Snapshot Compression** — while `DRAFT`, snapshot fields are (re)computed from current live data on every save; there is no separate "refresh" action. At the moment the admin finalizes the invoice (`DRAFT → SENT`), the snapshot — including `ConvertedTotal`/`ConvertedCurrency` if applicable — is permanently locked.
4. **Atomic Ledger Commit** — the `Invoice` and its `InvoiceItem` rows are created in a single Prisma transaction.

**Post-save**: creating or saving a DRAFT lands on that invoice's read-only preview (Summary / Invoice preview / Activity tabs — the same view every non-DRAFT invoice always shows) rather than staying on the form; an explicit Edit action returns to the form, and Cancel from either the form or the preview discards nothing already saved. A DRAFT is the only status ever reachable from the form.

## 5. Currency Model

A project operates in one of two currency modes (`Project.CurrencyMode`):

- **`SINGLE`** (default): the whole invoice — item rates, subtotal, total — is denominated in the project's one `DisplayCurrency` (which may itself be USD). No secondary/converted figure appears anywhere.
- **`DUAL`**: every core amount is USD, and the project's `DisplayCurrency` (never USD in this mode) only adds a manually-entered `ConvertedTotal` on each invoice, displayed alongside — never replacing — the USD figures.

Shared rules:

- `Project.DisplayCurrency` is one of `USD`/`AUD`/`GBP`/`NZD`/`AED`/`PKR`/`SAR`, default `USD`.
- Each invoice stores the currency its core amounts are actually denominated in (`Invoice.Currency`, derived from the project's mode at creation and locked at `SENT` like every other snapshot-timed field).
- No automatic exchange-rate lookup exists — the admin types any converted figure directly. Automatic rate-fetching is an explicit future enhancement.
- The dashboard's primary aggregates use USD-denominated invoices only; non-USD `SINGLE`-mode invoices are never blended into a USD sum — each non-USD currency present gets its own per-currency breakdown line instead. `ConvertedTotal` is a per-invoice display annotation and is never summed or aggregated.

## 6. Invoice Status Transition Rules

```
DRAFT → SENT
DRAFT → VOID
SENT  → PAID
SENT  → VOID
```

`PAID` and `VOID` are both terminal. There is no transition back to `DRAFT` from any state, and no `PAID → VOID` path — once paid, an invoice can never be voided.

Editing rules: `DRAFT` fully editable. `SENT` cannot have line items, snapshots, or totals edited. `PAID` and `VOID` are read-only. `VOID` invoices remain visible for history/audit but never participate in totals or dashboard calculations.

## 7. Deletion Policy

Deletion is governed entirely by **live** foreign-key references — never by historical snapshot data, since invoices only ever hold detached copies of party/payment-method information:

- `Project`: deletable only with zero `Invoice` rows. No cascading delete — the admin must delete dependent invoices first.
- `Party`: deletable only while not set as any `Project`'s `ContractorId`/`ClientId`.
- `PaymentMethod`: deletable only while not set as any `Project`'s `PreferredPaymentMethodId`.
- `Invoice` *(resolved during blueprint planning — see `Docs/implementation_decisions.md` §22, not explicit in the original spec)*: deletable in **any** status, with an admin confirmation prompt; `InvoiceItem` rows cascade. This is the mechanism that makes the `Project` deletion rule above actually satisfiable.
- `ProjectAlertSchedule`: deletable freely by the admin at any time — nothing ever references it live. Cascades automatically when the parent `Project` is deleted.

## 8. AI-Assisted Data Entry

A chat-style assistant is available on the **Party**, **Payment Method**, and **Invoice** creation forms (not Project). It only ever populates visible form fields for human review — it never creates or saves a record directly, and every form remains fully usable by hand with the assistant entirely absent. No form requires it to resolve free text against existing database records. The underlying model/provider (Google Gemini, Anthropic Claude, or Groq) and API key are user-configurable, with a configurable fallback sequence if the primary model is unavailable. Full detail in `Docs/implementation_decisions.md` §19.

## 9. Project Technical Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js / React | UI, forms, dashboard, invoice screens. |
| Backend / Server Logic | Next.js Server Actions or API Routes | Business operations. |
| ORM / Database Access | Prisma | Schema, migrations, typed DB client. |
| Database | PostgreSQL | All structured/relational/snapshot data. |
| Production hosting | DigitalOcean droplet — see `Docs/implementation_decisions.md` §21. |

## 10. Authentication Scope

Google OAuth only (via Auth.js), no self-registration — a sign-in only succeeds if the email already has a `User` row (§1.7), created by an existing admin or the bootstrap script. Database-backed sessions, not JWT, so revoking access takes effect immediately rather than waiting out a token's expiry. Three roles (`ADMIN`/`STANDARD`/`RESTRICTED`) replace the single-admin-identity model originally planned — see `Docs/implementation_decisions.md` §8 for the full rationale.

## 11. Modular Monolith Architecture

Unchanged from the original spec — single Next.js codebase, layered into Frontend UI / Business Logic / Data Access / Prisma / PostgreSQL, no separate backend service unless a future requirement demands it.

```text
src/
  app/            dashboard/ projects/ parties/ invoices/
  components/     party/ project/ invoice/ payment-method/
  services/       partyService.ts paymentMethodService.ts projectService.ts invoiceService.ts
  repositories/   partyRepository.ts paymentMethodRepository.ts projectRepository.ts invoiceRepository.ts
  lib/            prisma.ts

prisma/
  schema.prisma
  migrations/
```

## 12. Document Generation Requirements

Both Excel and PDF generation must use only the saved invoice record and its snapshot fields — never live party/payment-method data once an invoice exists.

- **Excel**: generated in TypeScript (`exceljs`), using `generate_invoice.py`'s layout as a formatting reference only (not reused as code). See `Docs/implementation_decisions.md` §12.1.
- **PDF**: generated via `puppeteer` rendering the same HTML invoice preview template, with browser-launch isolated behind a deployment-swappable adapter. See §12.2.
- Both must render USD amounts and, when applicable, the invoice's locked `ConvertedTotal`/`ConvertedCurrency` — never a hardcoded `$`/currency assumption.
- No Excel-to-PDF conversion. No permanent file storage — generated on demand.

## 13. Implementation Boundary

The first version remains a single-tenant modular monolith. Do not introduce, beyond what's specified here: tenant tables, organization workspaces, multi-tenant row isolation, multi-organization membership, per-tenant billing, separate backend microservices, tax fields/calculation, logo support, party role classification, multi-address support, live exchange-rate fetching, or AI entity-resolution/fuzzy-matching against the database. All of these were explicitly considered and cut for MVP — see `Docs/implementation_decisions.md` for each.
