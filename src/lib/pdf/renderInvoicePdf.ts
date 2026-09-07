import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from "pdf-lib";
import { formatCurrency } from "@/lib/currency";
import { formatDisplayDate } from "@/lib/dates";
import { addressLines } from "@/lib/partyAddress";
import type { InvoiceDocumentData } from "@/services/documentService";

/**
 * M32.1 — in-process PDF renderer, the `PDF_ADAPTER=pdf-lib` alternative to
 * launching headless Chromium (`localAdapter.ts`/`serverlessAdapter.ts` via
 * `renderViaBrowser.ts`). Hand-transcribes `InvoiceDocument.module.css` /
 * `Docs/invoice_design_guidelines.md` §2/§4/§5/§9/§13 geometry and
 * typography into mm-denominated constants (converted to pt at draw time) —
 * this is a second, independent layout implementation of the same document,
 * same structural precedent as `buildInvoiceWorkbook.ts`. Only standard
 * Helvetica/HelveticaBold/HelveticaOblique are used (no font embedding);
 * `font-weight: 500` (the "Invoice" title) maps to regular, and
 * `text-transform: uppercase` is applied via `.toUpperCase()` since pdf-lib
 * has no CSS equivalent. Letter-spacing is not reproduced — pdf-lib's
 * `drawText` has no per-character tracking control, a minor, accepted
 * simplification. Status tag/locked banner are never drawn here, matching
 * the real PDF's `screenOnly=false` behavior (see `InvoiceDocument.tsx`).
 */

const MM = 72 / 25.4;
const PAGE_WIDTH = 210 * MM;
const PAGE_HEIGHT = 297 * MM;
const MARGIN = 15 * MM;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

const SPACE_1 = 1.5 * MM;
const SPACE_2 = 3 * MM;
const SPACE_3 = 5 * MM;
const SPACE_5 = 12 * MM;

const COLOR_TEXT = hexColor("#111111");
const COLOR_SECONDARY = hexColor("#5f6b78");
const COLOR_RULE = hexColor("#596674");
const COLOR_LIGHT_RULE = hexColor("#cfd5dc");

const LABEL_MIN_WIDTH = 30 * MM;

// ── Column geometry (§9 — Description 58%, Qty 10%, Rate 14%, Amount 18%) ──
const COL_DESCRIPTION_W = CONTENT_WIDTH * 0.58;
const COL_QTY_W = CONTENT_WIDTH * 0.1;
const COL_RATE_W = CONTENT_WIDTH * 0.14;
const COL_AMOUNT_W = CONTENT_WIDTH * 0.18;
const COL_DESCRIPTION_X = MARGIN;
const COL_QTY_RIGHT = MARGIN + COL_DESCRIPTION_W + COL_QTY_W;
const COL_RATE_RIGHT = COL_QTY_RIGHT + COL_RATE_W;
const COL_AMOUNT_RIGHT = COL_RATE_RIGHT + COL_AMOUNT_W;

// M48 — single-Duration-column layout used instead of the above when every
// item on the invoice is Flat-amount (mirrors InvoiceDocument.module.css's
// .colDescriptionWide/.colDuration: Description 62%, Duration 20%, Amount 18%).
const COL_FLAT_DESCRIPTION_W = CONTENT_WIDTH * 0.62;
const COL_FLAT_DURATION_W = CONTENT_WIDTH * 0.2;
const COL_FLAT_AMOUNT_W = CONTENT_WIDTH * 0.18;
const COL_FLAT_DURATION_RIGHT =
  MARGIN + COL_FLAT_DESCRIPTION_W + COL_FLAT_DURATION_W;
const COL_FLAT_AMOUNT_RIGHT = COL_FLAT_DURATION_RIGHT + COL_FLAT_AMOUNT_W;

type ColumnLayout = {
  descriptionW: number;
  headerCells: { label: string; rightX: number }[];
};

function buildColumnLayout(
  allItemsFlat: boolean,
  currency: string,
): ColumnLayout {
  if (allItemsFlat) {
    return {
      descriptionW: COL_FLAT_DESCRIPTION_W,
      headerCells: [
        { label: "DURATION", rightX: COL_FLAT_DURATION_RIGHT },
        { label: `AMOUNT (${currency})`, rightX: COL_FLAT_AMOUNT_RIGHT },
      ],
    };
  }
  return {
    descriptionW: COL_DESCRIPTION_W,
    headerCells: [
      { label: "UNIT (HRS)", rightX: COL_QTY_RIGHT },
      { label: "RATE", rightX: COL_RATE_RIGHT },
      { label: `AMOUNT (${currency})`, rightX: COL_AMOUNT_RIGHT },
    ],
  };
}

// ── Summary grid geometry (§8 — 1.1fr / 0.65fr / 0.75fr, 10mm gap) ──
const SUMMARY_GAP = 10 * MM;
const SUMMARY_FR_TOTAL = 1.1 + 0.65 + 0.75;
const SUMMARY_AVAILABLE = CONTENT_WIDTH - 2 * SUMMARY_GAP;
const SUMMARY_COL1_W = (SUMMARY_AVAILABLE * 1.1) / SUMMARY_FR_TOTAL;
const SUMMARY_COL2_W = (SUMMARY_AVAILABLE * 0.65) / SUMMARY_FR_TOTAL;
const SUMMARY_COL3_W = (SUMMARY_AVAILABLE * 0.75) / SUMMARY_FR_TOTAL;
const SUMMARY_COL1_X = MARGIN;
const SUMMARY_COL2_X = SUMMARY_COL1_X + SUMMARY_COL1_W + SUMMARY_GAP;
const SUMMARY_COL3_X = SUMMARY_COL2_X + SUMMARY_COL2_W + SUMMARY_GAP;

// ── Totals block geometry (34% width, flush right) ──
const TOTALS_WIDTH = CONTENT_WIDTH * 0.34;
const TOTALS_RIGHT = MARGIN + CONTENT_WIDTH;
const TOTALS_LEFT = TOTALS_RIGHT - TOTALS_WIDTH;

function hexColor(hex: string): RGB {
  const value = hex.replace("#", "");
  return rgb(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  );
}

/** Greedy word wrap — pdf-lib has no built-in text layout. */
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };

/** Cursor-based single-page-at-a-time writer; `y` is the offset (pt) already advanced past the top margin. */
type Writer = {
  doc: PDFDocument;
  fonts: Fonts;
  page: PDFPage;
  y: number;
};

function addPage(doc: PDFDocument): PDFPage {
  return doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
}

/** Starts a fresh page if `height` would overflow the current one; returns true when it did. */
function ensureSpace(writer: Writer, height: number): boolean {
  const availableHeight = PAGE_HEIGHT - 2 * MARGIN;
  if (writer.y + height > availableHeight) {
    writer.page = addPage(writer.doc);
    writer.y = 0;
    return true;
  }
  return false;
}

function drawLine(
  writer: Writer,
  text: string,
  opts: {
    x?: number;
    rightX?: number;
    size: number;
    font: PDFFont;
    color?: RGB;
  },
): void {
  const width = opts.font.widthOfTextAtSize(text, opts.size);
  const x =
    opts.rightX !== undefined ? opts.rightX - width : (opts.x ?? MARGIN);
  const topOfLine = MARGIN + writer.y;
  const baseline = PAGE_HEIGHT - topOfLine - opts.size * 0.8;
  writer.page.drawText(text, {
    x,
    y: baseline,
    size: opts.size,
    font: opts.font,
    color: opts.color ?? COLOR_TEXT,
  });
}

/** Draws pre-wrapped lines, advancing `writer.y` by `lineHeight` per line. */
function drawWrapped(
  writer: Writer,
  lines: string[],
  opts: {
    x?: number;
    rightX?: number;
    size: number;
    font: PDFFont;
    color?: RGB;
    lineHeight: number;
  },
): void {
  for (const line of lines) {
    drawLine(writer, line, opts);
    writer.y += opts.lineHeight;
  }
}

function drawRule(
  writer: Writer,
  x: number,
  width: number,
  height: number,
  color: RGB,
): void {
  const topOfRule = MARGIN + writer.y;
  writer.page.drawRectangle({
    x,
    y: PAGE_HEIGHT - topOfRule - height,
    width,
    height,
    color,
  });
}

function drawTableHeader(
  writer: Writer,
  layout: ColumnLayout,
  fonts: Fonts,
): void {
  const size = 8.5;
  drawLine(writer, "ITEM", { x: COL_DESCRIPTION_X, size, font: fonts.bold });
  for (const cell of layout.headerCells) {
    drawLine(writer, cell.label, { rightX: cell.rightX, size, font: fonts.bold });
  }
  writer.y += size * 1.2 + SPACE_2;
}

export async function renderInvoicePdf(
  data: InvoiceDocumentData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };

  const writer: Writer = { doc, fonts, page: addPage(doc), y: 0 };

  // ── Header: sender (left) / invoice #, issue date (right) ──
  const senderLines = addressLines(data.contractor);
  const leftHeaderHeight =
    9.5 * 1.2 + SPACE_1 + senderLines.length * (8.5 * 1.25);
  const rightHeaderHeight =
    8 * 1.25 + SPACE_1 + 9 * 1.25 + SPACE_1 + 8.5 * 1.25;
  const headerStartY = writer.y;

  drawLine(writer, data.contractor.name, {
    x: MARGIN,
    size: 9.5,
    font: fonts.bold,
  });
  writer.y += 9.5 * 1.2 + SPACE_1;
  for (const line of senderLines) {
    drawLine(writer, line, { x: MARGIN, size: 8.5, font: fonts.regular });
    writer.y += 8.5 * 1.25;
  }

  writer.y = headerStartY;
  drawLine(writer, "INVOICE #", {
    rightX: TOTALS_RIGHT,
    size: 8,
    font: fonts.bold,
  });
  writer.y += 8 * 1.25 + SPACE_1;
  drawLine(writer, data.invoiceNumber, {
    rightX: TOTALS_RIGHT,
    size: 9,
    font: fonts.bold,
  });
  writer.y += 9 * 1.25 + SPACE_1;
  drawLine(writer, `Issue date: ${formatDisplayDate(data.issueDate)}`, {
    rightX: TOTALS_RIGHT,
    size: 8.5,
    font: fonts.regular,
  });
  writer.y += 8.5 * 1.25;

  writer.y = headerStartY + Math.max(leftHeaderHeight, rightHeaderHeight);

  // ── Rule + title ──
  writer.y += SPACE_3;
  drawRule(writer, MARGIN, CONTENT_WIDTH, 2 * MM, COLOR_RULE);
  writer.y += 2 * MM + SPACE_3;

  drawLine(writer, "Invoice", { x: MARGIN, size: 20, font: fonts.regular });
  writer.y += 20 * 1.1 + SPACE_5;

  // ── Summary grid: Bill To / Details / Payment ──
  const detailsLines = wrapText(
    data.serviceDescription,
    fonts.regular,
    9,
    SUMMARY_COL2_W,
  );
  const paymentSummaryLines = wrapText(
    `Due date: ${formatDisplayDate(data.dueDate)}`,
    fonts.regular,
    9,
    SUMMARY_COL3_W,
  );
  const billToLines: string[] = [data.client.name];
  if (data.client.email) billToLines.push(data.client.email);
  billToLines.push(...addressLines(data.client));

  const summaryStartY = writer.y;
  drawLine(writer, "BILL TO", {
    x: SUMMARY_COL1_X,
    size: 8.5,
    font: fonts.bold,
  });
  let col1Y = writer.y + 8.5 * 1.2 + SPACE_1;
  for (const line of billToLines) {
    writer.y = col1Y;
    drawLine(writer, line, { x: SUMMARY_COL1_X, size: 9, font: fonts.regular });
    col1Y += 9 * 1.3;
  }

  writer.y = summaryStartY;
  drawLine(writer, "DETAILS", {
    x: SUMMARY_COL2_X,
    size: 8.5,
    font: fonts.bold,
  });
  let col2Y = writer.y + 8.5 * 1.2 + SPACE_1;
  for (const line of detailsLines) {
    writer.y = col2Y;
    drawLine(writer, line, { x: SUMMARY_COL2_X, size: 9, font: fonts.regular });
    col2Y += 9 * 1.3;
  }

  writer.y = summaryStartY;
  drawLine(writer, "PAYMENT", {
    x: SUMMARY_COL3_X,
    size: 8.5,
    font: fonts.bold,
  });
  let col3Y = writer.y + 8.5 * 1.2 + SPACE_1;
  for (const line of paymentSummaryLines) {
    writer.y = col3Y;
    drawLine(writer, line, { x: SUMMARY_COL3_X, size: 9, font: fonts.regular });
    col3Y += 9 * 1.3;
  }

  writer.y =
    summaryStartY + Math.max(col1Y, col2Y, col3Y) - summaryStartY + SPACE_5;

  // ── Item table ──
  const columnLayout = buildColumnLayout(data.allItemsFlat, data.currency);
  drawTableHeader(writer, columnLayout, fonts);

  for (const item of data.items) {
    const descLines = wrapText(
      item.description,
      fonts.regular,
      9,
      columnLayout.descriptionW,
    );
    const rowHeight = descLines.length * (9 * 1.3) + 2 * SPACE_1;

    if (ensureSpace(writer, rowHeight)) {
      drawTableHeader(writer, columnLayout, fonts);
    }

    const rowTopY = writer.y + SPACE_1;
    writer.y = rowTopY;
    drawWrapped(writer, descLines, {
      x: COL_DESCRIPTION_X,
      size: 9,
      font: fonts.regular,
      lineHeight: 9 * 1.3,
    });

    writer.y = rowTopY;
    if (data.allItemsFlat) {
      drawLine(writer, item.durationText ?? "-", {
        rightX: COL_FLAT_DURATION_RIGHT,
        size: 9,
        font: fonts.regular,
      });
      drawLine(writer, formatCurrency(item.amount, data.currency), {
        rightX: COL_FLAT_AMOUNT_RIGHT,
        size: 9,
        font: fonts.regular,
      });
    } else {
      drawLine(writer, item.isFlatAmount ? "-" : (item.quantity ?? ""), {
        rightX: COL_QTY_RIGHT,
        size: 9,
        font: fonts.regular,
      });
      drawLine(
        writer,
        item.isFlatAmount
          ? "-"
          : formatCurrency(item.unitPrice!, data.currency),
        { rightX: COL_RATE_RIGHT, size: 9, font: fonts.regular },
      );
      drawLine(writer, formatCurrency(item.amount, data.currency), {
        rightX: COL_AMOUNT_RIGHT,
        size: 9,
        font: fonts.regular,
      });
    }

    writer.y = rowTopY + descLines.length * (9 * 1.3) + SPACE_1;
  }
  writer.y += SPACE_1;

  if (data.itemsNote) {
    const noteLines = wrapText(data.itemsNote, fonts.italic, 8, CONTENT_WIDTH);
    ensureSpace(writer, noteLines.length * (8 * 1.3) + SPACE_2);
    drawWrapped(writer, noteLines, {
      x: MARGIN,
      size: 8,
      font: fonts.italic,
      lineHeight: 8 * 1.3,
    });
    writer.y += SPACE_2;
  }

  ensureSpace(writer, 1 + SPACE_2);
  drawRule(writer, MARGIN, CONTENT_WIDTH, 1, COLOR_RULE);
  writer.y += 1 + SPACE_2;

  // ── Footer block (totals + optional bottom note + payment section) — measured up front so it never splits across a page break ──
  const hasConvertedTotal =
    data.convertedTotal !== null && data.convertedCurrency !== null;
  let totalsHeight = 9 * 1.25 + 10 * 1.25;
  if (hasConvertedTotal) {
    totalsHeight += SPACE_1 + 0.5 + SPACE_1 + 8.5 * 1.25;
  }
  totalsHeight += SPACE_3;

  const bottomNoteLines = data.bottomNote
    ? wrapText(
        data.bottomNote,
        fonts.regular,
        8.5,
        CONTENT_WIDTH - LABEL_MIN_WIDTH - SPACE_2,
      )
    : null;
  const bottomNoteHeight = bottomNoteLines
    ? Math.max(1, bottomNoteLines.length) * (8.5 * 1.3) + SPACE_3
    : 0;

  const paymentValueWidth = CONTENT_WIDTH - LABEL_MIN_WIDTH - SPACE_2;
  const paymentRows: { label: string | null; valueLines: string[] }[] =
    data.paymentDetails.length > 0
      ? data.paymentDetails.map((field) => ({
          label: field.label,
          valueLines: wrapText(
            field.value,
            fonts.regular,
            8.5,
            paymentValueWidth,
          ),
        }))
      : [
          {
            label: null,
            valueLines: wrapText(
              "No payment method on file",
              fonts.regular,
              8.5,
              CONTENT_WIDTH,
            ),
          },
        ];
  const paymentSectionHeight =
    8.5 * 1.2 +
    SPACE_2 +
    paymentRows.reduce(
      (sum, row, index) =>
        sum + row.valueLines.length * (8.5 * 1.3) + (index > 0 ? SPACE_1 : 0),
      0,
    );

  const footerHeight = totalsHeight + bottomNoteHeight + paymentSectionHeight;
  ensureSpace(writer, footerHeight);

  // ── Totals ──
  drawLine(writer, "Subtotal", {
    x: TOTALS_LEFT,
    size: 9,
    font: fonts.regular,
  });
  drawLine(writer, formatCurrency(data.subtotal, data.currency), {
    rightX: TOTALS_RIGHT,
    size: 9,
    font: fonts.regular,
  });
  writer.y += 9 * 1.25;

  drawLine(writer, "Total Due", { x: TOTALS_LEFT, size: 10, font: fonts.bold });
  drawLine(writer, formatCurrency(data.total, data.currency), {
    rightX: TOTALS_RIGHT,
    size: 10,
    font: fonts.bold,
  });
  writer.y += 10 * 1.25;

  if (hasConvertedTotal) {
    writer.y += SPACE_1;
    drawRule(writer, TOTALS_LEFT, TOTALS_WIDTH, 0.5, COLOR_LIGHT_RULE);
    writer.y += 0.5 + SPACE_1;
    drawLine(writer, `Total in ${data.convertedCurrency}`, {
      x: TOTALS_LEFT,
      size: 8.5,
      font: fonts.regular,
      color: COLOR_SECONDARY,
    });
    drawLine(
      writer,
      formatCurrency(data.convertedTotal!, data.convertedCurrency!),
      {
        rightX: TOTALS_RIGHT,
        size: 8.5,
        font: fonts.regular,
        color: COLOR_SECONDARY,
      },
    );
    writer.y += 8.5 * 1.25;
  }
  writer.y += SPACE_3;

  // ── Bottom note ──
  if (bottomNoteLines) {
    const rowTopY = writer.y;
    drawLine(writer, "Note", { x: MARGIN, size: 8.5, font: fonts.bold });
    writer.y = rowTopY;
    drawWrapped(writer, bottomNoteLines, {
      x: MARGIN + LABEL_MIN_WIDTH + SPACE_2,
      size: 8.5,
      font: fonts.regular,
      lineHeight: 8.5 * 1.3,
    });
    writer.y =
      rowTopY + Math.max(1, bottomNoteLines.length) * (8.5 * 1.3) + SPACE_3;
  }

  // ── Payment details ──
  drawLine(writer, "Payment to be made to:", {
    x: MARGIN,
    size: 8.5,
    font: fonts.bold,
  });
  writer.y += 8.5 * 1.2 + SPACE_2;

  paymentRows.forEach((row, index) => {
    if (index > 0) writer.y += SPACE_1;
    const rowTopY = writer.y;
    if (row.label) {
      drawLine(writer, row.label, {
        x: MARGIN,
        size: 8.5,
        font: fonts.regular,
      });
    }
    writer.y = rowTopY;
    drawWrapped(writer, row.valueLines, {
      x: row.label ? MARGIN + LABEL_MIN_WIDTH + SPACE_2 : MARGIN,
      size: 8.5,
      font: fonts.regular,
      lineHeight: 8.5 * 1.3,
    });
    writer.y = rowTopY + row.valueLines.length * (8.5 * 1.3);
  });

  return doc.save();
}
