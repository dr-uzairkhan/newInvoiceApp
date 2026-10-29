# Invoice Design Guidelines

## 1. Design intent

The invoice must look like a compact, professional, print-first business document—not a modern SaaS dashboard or marketing page.

Use the supplied invoice references as the visual source of truth. Do not reinterpret them into cards, panels, oversized typography, decorative badges, gradients, rounded containers, or large whitespace.

## 2. Page format

- Target: A4 portrait
- Print size: 210 mm × 297 mm
- Primary page container: `width: 210mm; min-height: 297mm`
- Internal horizontal padding: 14–16 mm
- Top padding: 14–18 mm
- Bottom padding: 14–18 mm
- White background
- All invoice information should occupy approximately the upper 45–55% of the page for a normal 1–4 item invoice.
- Do not vertically center content.
- Avoid excessive gaps between sections.

Recommended print CSS:

```css
@page {
  size: A4;
  margin: 0;
}

.invoice-page {
  width: 210mm;
  min-height: 297mm;
  padding: 15mm;
  box-sizing: border-box;
  background: #fff;
  color: #111827;
}
```

## 3. Visual character

- Dense, restrained, formal, and highly legible
- Black text on white — labels, table headers, section headings, payment
  field labels, and notes are all plain black, not muted blue-grey; the
  reference invoices use no secondary text color at all, only the one dark
  slate accent line
- One dark slate accent line
- No shadows
- No rounded cards
- No gradient
- No decorative background blocks
- No large status pill beside the title unless explicitly required
- No oversized logo
- No large empty area between the heading and invoice details

## 4. Colour palette

Use these values unless the invoice owner has a brand colour:

```css
--invoice-text: #111111;
--invoice-secondary: #5f6b78;
--invoice-muted: #8a97a8;
--invoice-rule: #596674;
--invoice-light-rule: #cfd5dc;
--invoice-background: #ffffff;
```

`--invoice-secondary`/`--invoice-muted` are reserved for the one case that's
genuinely subordinate — a DUAL-mode invoice's converted-total row (§11).
Every other text on the document (sender address, summary labels, table
headers, the item-list note, section headings, payment field labels) is
`--invoice-text` — confirmed against a reference invoice's own PDF/XLSX
output, which uses no secondary text colour anywhere except the rule.

Do not apply any brand accent colour to headings, table borders, totals, or body text — the invoice document is deliberately monochrome (and the application renders no logos at all; see `Docs/implementation_decisions.md` §14).

## 5. Typography

Use a neutral sans-serif with metrics close to Arial/Helvetica.

Preferred stack:

```css
font-family: Arial, Helvetica, sans-serif;
```

Do not use a display font.

Suggested sizes:

| Element | Size | Weight | Line height |
|---|---:|---:|---:|
| Sender/company name | 8.5–9.5 pt | 700 | 1.2 |
| Sender address | 8–9 pt | 400 | 1.25 |
| Invoice metadata | 8–9 pt | 600 | 1.25 |
| Main “Invoice” heading | 18–21 pt | 400–500 | 1.1 |
| Section labels | 8–9 pt | 700 | 1.2 |
| Section content | 8.5–9.5 pt | 400 | 1.3 |
| Table headers | 8–9 pt | 700 | 1.2 |
| Table content | 8.5–9.5 pt | 400 | 1.3 |
| Totals | 8.5–10 pt | 400–700 | 1.25 |
| Notes/payment details | 8–9 pt | 400 | 1.3 |

Avoid 14–16 px body text. The references are closer to compact print typography.

## 6. Header layout

Use a two-column header:

- Left: sender name and address
- Right: invoice number and issue date
- Right column text aligned left inside its own block or right-aligned as a block
- Header height should remain compact
- Place a dark slate horizontal rule immediately below the header
- Rule thickness: 1.5–2.5 mm in the rendered A4 document
- Rule should span the full content width

Approximate structure:

```text
Sender/company details                         Invoice #
                                               Issue date
────────────────────────────────────────────────────────
Invoice
```

The main heading should sit 5–8 mm below the rule.

## 7. Logo handling

When a logo is present:

- Place it near the upper-right portion of the title area
- Maximum visual height: approximately 8–10 mm
- Do not allow it to dominate the page
- Keep the logo horizontally aligned with the “Invoice” heading
- Preserve clear space around the logo
- Prefer a transparent SVG or PNG

When there is no logo, do not insert an empty placeholder.

## 8. Summary information row

Use a three-column layout:

1. Bill To
2. Details
3. Payment

Recommended proportions:

```css
grid-template-columns: 1.1fr 0.65fr 0.75fr;
column-gap: 10mm;
```

Section labels must be uppercase, compact, and bold.

Example:

```text
BILL TO                  DETAILS                 PAYMENT
Client name              Software Development    Due date: 16 July 2026
Address                   Services
```

Spacing rules:

- 11–15 mm between the Invoice title and this row
- 3–5 mm between section label and content
- 12–18 mm between this row and the item table
- Do not place each column inside a card
- Optional short top rules above each column may be used, as in one reference

## 9. Item table

The table is the primary visual structure and should be compact.

Recommended columns:

```text
DESCRIPTION / ITEM     QTY or UNIT     RATE     AMOUNT (CURRENCY)
```

Suggested widths:

- Description: 58–66%
- Quantity/unit: 8–12%
- Rate: 12–15%
- Amount: 15–18%

Rules:

- Header labels are bold and compact, plain black (not muted) — see §3/§4
- Numeric columns are right-aligned
- Description is left-aligned
- Exactly one horizontal rule for the whole items block — no rule under the
  header, no rule between/under individual item rows. The rule sits at the
  very end of the block: after the last item row if there's no items note
  (§10), or after the items note if there is one — never directly under the
  header. This matches reference invoices, which use a single rule
  separating items+note from Subtotal, not a framed table.
- Do not use full cell borders
- No zebra striping
- No rounded table container
- Row height: approximately 7–9 mm
- Keep currency formatting consistent

Example CSS:

```css
.invoice-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.invoice-table th {
  padding: 0 0 3mm;
  text-align: left;
}

.invoice-table td {
  padding: 3mm 0;
  vertical-align: top;
}

.invoice-table .number {
  text-align: right;
  white-space: nowrap;
}

/* Placed after the table AND the optional items note (§10) — not under the header. */
.invoice-table-rule {
  width: 100%;
  height: 1px;
  background: #596674;
}
```

### 9.1 Flat-amount items (M14/M15)

A line item may be **Hourly** (Quantity/Rate populated, Amount computed) or **Flat** (a single lump-sum amount, no hours/rate). For a Flat item, render `-` in both the Quantity and Rate cells — never a blank cell, never `0`/`0.00`. This is a per-item toggle; Hourly and Flat items may appear mixed within the same table.

## 10. Notes below the item list

This app's notes are **invoice-level**, not per-line-item — a single note applies to the item list as a whole, not to one specific row. Two lines can appear here, in this order: the billing-period sentence ("Covers services rendered {start} – {end}.", printed automatically from the invoice's structured period dates when both are set) and then the free-text items note. Both use the same treatment:

- Place directly beneath the item table (above Subtotal, above the table's own end-of-block rule per §9), not beneath any individual item
- Use 7.5–8.5 pt
- Plain black, italic — the italic styling alone signals it's a note; do not also apply a muted/secondary colour
- No label/heading — the italic styling alone signals it's a note
- Do not create a separate card or callout

Example:

```text
Software Development Services (Acme - March)          -   -   500
Arrears from previous invoices                          -   -   1000
Work done on Acme portal May - June 2026

Subtotal                                                    1500
```

## 11. Totals

Reference invoices use understated totals rather than oversized summary cards.

- Position totals directly beneath the table
- Align labels toward the left or near the amount column, depending on the selected template
- Align values with the table amount column
- Use a thin separator above the totals area where appropriate
- Subtotal: regular weight
- Final total: bold
- Avoid very large total typography
- Avoid coloured boxes or shaded total panels
- Do not separate totals from the table with large whitespace

For multi-currency invoices:

```text
Total Due                 USD 3,200
Total in AUD              AUD 4,458.00
```

Keep the conversion label and converted amount visually subordinate to the primary amount unless the business requirement says otherwise.

## 12. Bottom note and payment details

Place below the totals with compact spacing, in this order: the bottom note (if present), then payment details.

**Bottom note** — independent of the item-list note in §10 above; either, both, or neither may be present on a given invoice:

- Bold `Note` label, 8.5 pt, followed by the value on the same row (a two-column label/value row, like the payment detail rows below)
- Omit the row entirely when there's no note — never render an empty `Note` label with a blank value

```text
Note      Work done from 22 March 2026, 22 June 2026
```

**Payment details**:

- Section heading: bold, 8–9 pt, plain black, sentence case (not uppercase — e.g. "Payment to be made to:")
- Use a two-column label/value structure, both columns plain black (field labels are not muted/secondary — see §3/§4)
- Labels should be short and aligned
- Avoid large boxes
- Avoid icons
- Keep sensitive account details selectable as text
- Do not truncate account numbers in the PDF unless explicitly required

Example:

```text
Payment to be made to:
Bank Name           Example Bank
Bank Address        123 Sample Street, Springfield ST 00000
Branch Code         000000
Account No.         00012345
Beneficiary Name    Jordan Freelancer
```

## 13. Spacing scale

Use a small print-oriented spacing scale:

```css
--space-1: 1.5mm;
--space-2: 3mm;
--space-3: 5mm;
--space-4: 8mm;
--space-5: 12mm;
--space-6: 16mm;
```

Do not use web-dashboard spacing such as 32–64 px between every section.

## 14. Status display

The references do not require a prominent status badge.

If status must be shown:

- Use small uppercase text near invoice metadata
- Or use a subtle 7–8 pt pill
- Maximum height: 5–6 mm
- Do not place a large green badge beside the Invoice heading
- Hide status entirely on exported invoices when it is an internal workflow field

## 15. Responsive behaviour

The invoice is print-first.

- The A4 layout remains fixed for PDF generation
- On small screens, scale the full page preview rather than reflowing the invoice into cards
- Use an outer preview wrapper for horizontal scrolling
- Do not change table columns or stack the Bill To / Details / Payment row in the exported PDF

## 16. PDF generation requirements

Two interchangeable rendering paths exist (`PDF_ADAPTER`, a runtime toggle — see `Docs/implementation_decisions.md` §12.2), and both must independently satisfy the acceptance criteria in §18 — a change to one is not automatically reflected in the other, since they are two separate implementations of the same spec:

**Browser rendering** (`local`/`serverless`) — renders the same React component used for the on-screen preview:

- Use the same React component for preview and PDF output
- Generate the PDF using browser rendering (Puppeteer)
- Wait for fonts and logo assets before capturing
- Enable print backgrounds
- Use exact A4 dimensions
- Prevent table rows and payment sections from splitting unexpectedly
- Repeat table headers when an invoice spans multiple pages
- Keep totals together

Suggested CSS:

```css
.invoice-table tr,
.invoice-totals,
.payment-details {
  break-inside: avoid;
}

thead {
  display: table-header-group;
}
```

**In-process rendering** (`pdf-lib`, M32.1) — a second, independent implementation drawing directly from `documentService.assembleInvoiceDocumentData`'s output, no browser and no CSS at all:

- Page geometry, spacing scale, colors, and per-element font size/weight are hand-transcribed from this document's §2/§4/§5/§9/§13 into mm-denominated constants (converted to pt at draw time) — any change to those sections must be applied to both `InvoiceDocument.module.css` and `src/lib/pdf/renderInvoicePdf.ts`
- Only standard Helvetica/HelveticaBold/HelveticaOblique (no font embedding); `font-weight: 500` maps to regular; `text-transform: uppercase` is applied via `.toUpperCase()`; letter-spacing is not reproduced (pdf-lib has no per-character tracking control)
- A greedy word-wrap helper stands in for CSS text wrapping (pdf-lib has no built-in text layout)
- "Repeat table headers"/"keep totals together" are satisfied by hand-written cursor logic instead of `break-inside`/`display: table-header-group`: a new page starts and the header row repeats before an item row would overflow; the totals/note/payment section is measured up front and moved to a new page as one atomic block rather than split mid-section

## 17. Implementation constraints for Claude Code

Claude must:

1. Treat the supplied reference images as the visual source of truth.
2. Reproduce their information density, typography scale, section placement, and line treatment.
3. Make no stylistic improvements unless explicitly requested.
4. Avoid default SaaS/dashboard patterns.
5. Use CSS measurements in `mm`, `pt`, or carefully calculated pixels for print-critical elements.
6. Implement shared design tokens rather than scattered values.
7. Preserve the current invoice data model.
8. Keep preview and generated PDF visually identical.
9. Render a sample invoice and compare it against the references after every material layout change.
10. Change one visual category at a time: page geometry, typography, header, summary row, table, totals, payment details.

## 18. Acceptance criteria

The implementation is acceptable when:

- The invoice reads as a compact printed business document at first glance.
- The top header, horizontal rule, Invoice heading, three-column summary, item table, totals, and payment details appear in the same vertical sequence as the references.
- Body text is compact and close to Arial/Helvetica.
- The document does not resemble a SaaS invoice template.
- The main content begins near the top and normal invoices remain concentrated in the upper half of the page.
- Table amounts align vertically.
- Horizontal rules are visually consistent.
- There are no cards, shadows, gradients, oversized status badges, or excessive empty gaps.
- Browser preview and exported PDF match closely.
- A screenshot comparison at the same A4 scale shows only minor differences in text content and branding.
