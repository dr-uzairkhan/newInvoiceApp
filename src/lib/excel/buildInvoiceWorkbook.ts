import ExcelJS from "exceljs";
import { formatCurrency } from "@/lib/currency";
import { formatDisplayDate } from "@/lib/dates";
import { addressLines } from "@/lib/partyAddress";
import type { InvoiceDocumentData } from "@/services/documentService";

/**
 * Excel workbook builder — layout matched against the reference invoice
 * documents described in Docs/implementation_decisions.md §12.1 (no
 * external reference artifact is used at runtime). Column widths, the
 * separator bar, and the BILL TO/DETAILS/PAYMENT structure follow that
 * reference; exact row numbers are NOT hardcoded to match it, since the
 * reference assumed a fixed 1-2 line address and a phone field we don't
 * have — this builder advances a row cursor instead, the same adaptation
 * InvoiceDocument.tsx already made for the on-screen preview.
 *
 * Sources exclusively from `InvoiceDocumentData` (documentService's own
 * output) — never a live Party/PaymentMethod query, so a SENT invoice's
 * locked snapshot is always what gets exported, even after the source
 * party has since been edited.
 */

const RULE_COLOR = "FF596674";
const MUTED_TEXT_COLOR = "FF8A97A8";

function arial(opts: {
  bold?: boolean;
  size?: number;
  color?: string;
  italic?: boolean;
}): Partial<ExcelJS.Font> {
  return {
    name: "Arial",
    size: opts.size ?? 10,
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    color: opts.color ? { argb: opts.color } : undefined,
  };
}

export async function buildInvoiceWorkbook(
  data: InvoiceDocumentData,
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Invoice");

  ws.columns = [
    { width: 15 },
    { width: 26 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 11 },
    { width: 20 },
  ];

  let row = 2;

  // ── Letterhead: contractor identity (left) + invoice #/issue date (right) ──
  ws.getCell(`A${row}`).value = data.contractor.name;
  ws.getCell(`A${row}`).font = arial({ bold: true });
  ws.getCell(`G${row}`).value = `Invoice # ${data.invoiceNumber}`;
  ws.getCell(`G${row}`).font = arial({ bold: true, size: 9 });
  ws.getCell(`G${row}`).alignment = { horizontal: "right" };

  const contractorAddressLines = addressLines(data.contractor);
  contractorAddressLines.forEach((line, index) => {
    row += 1;
    ws.getCell(`A${row}`).value = line;
    ws.getCell(`A${row}`).font = arial({});
    if (index === 0) {
      ws.getCell(`G${row}`).value =
        `Issue date: ${formatDisplayDate(data.issueDate)}`;
      ws.getCell(`G${row}`).font = arial({ bold: true, size: 9 });
      ws.getCell(`G${row}`).alignment = { horizontal: "right" };
    }
  });

  row += 2;

  // ── Separator bar ──
  ws.mergeCells(`A${row}:G${row}`);
  ws.getRow(row).height = 8;
  ws.getCell(`A${row}`).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: RULE_COLOR },
  };
  row += 2;

  // ── "Invoice" title ──
  ws.getCell(`A${row}`).value = "Invoice";
  ws.getCell(`A${row}`).font = arial({ size: 24 });
  ws.getRow(row).height = 30;
  row += 2;

  // ── BILL TO / DETAILS / PAYMENT ──
  ws.mergeCells(`A${row}:B${row}`);
  ws.mergeCells(`C${row}:D${row}`);
  ws.mergeCells(`E${row}:F${row}`);
  ws.getCell(`A${row}`).value = "BILL TO";
  ws.getCell(`C${row}`).value = "DETAILS";
  ws.getCell(`E${row}`).value = "PAYMENT";
  ["A", "C", "E"].forEach((col) => {
    ws.getCell(`${col}${row}`).font = arial({
      bold: true,
      size: 9,
    });
  });
  const summaryHeaderRow = row;
  row += 1;

  ws.mergeCells(`C${summaryHeaderRow + 1}:D${row + 3}`);
  ws.mergeCells(`E${summaryHeaderRow + 1}:F${row + 3}`);
  ws.getCell(`A${row}`).value = data.client.name;
  ws.getCell(`A${row}`).font = arial({ bold: true });
  ws.getCell(`C${row}`).value = data.serviceDescription;
  ws.getCell(`C${row}`).font = arial({});
  ws.getCell(`C${row}`).alignment = { wrapText: true, vertical: "top" };
  ws.getCell(`E${row}`).value = `Due date: ${formatDisplayDate(data.dueDate)}`;
  ws.getCell(`E${row}`).font = arial({});
  ws.getCell(`E${row}`).alignment = { wrapText: true, vertical: "top" };

  const clientAddressLines = addressLines(data.client);
  clientAddressLines.forEach((line) => {
    row += 1;
    ws.mergeCells(`A${row}:B${row}`);
    ws.getCell(`A${row}`).value = line;
    ws.getCell(`A${row}`).font = arial({ size: 9 });
  });

  row = Math.max(row, summaryHeaderRow + 4) + 2;

  // ── Item table ──
  // M48 — when every item is Flat-amount, E:F merge into a single Duration
  // column instead of separate Unit(Hrs)/Rate columns (mirrors
  // InvoiceDocument.tsx's allItemsFlat table-layout switch).
  ws.mergeCells(`A${row}:D${row}`);
  ws.getCell(`A${row}`).value = "ITEM";
  if (data.allItemsFlat) {
    ws.mergeCells(`E${row}:F${row}`);
    ws.getCell(`E${row}`).value = "DURATION";
  } else {
    ws.getCell(`E${row}`).value = "UNIT (HRS)";
    ws.getCell(`F${row}`).value = "RATE";
  }
  ws.getCell(`G${row}`).value = `AMOUNT (${data.currency})`;
  ["A", "E", "F", "G"].forEach((col) => {
    const cell = ws.getCell(`${col}${row}`);
    cell.font = arial({ bold: true, size: 9 });
    if (col !== "A") cell.alignment = { horizontal: "right" };
  });
  row += 1;

  data.items.forEach((item) => {
    ws.mergeCells(`A${row}:D${row}`);
    ws.getCell(`A${row}`).value = item.description;
    ws.getCell(`A${row}`).font = arial({});
    if (data.allItemsFlat) {
      ws.mergeCells(`E${row}:F${row}`);
      ws.getCell(`E${row}`).value = item.durationText ?? "-";
    } else {
      ws.getCell(`E${row}`).value = item.isFlatAmount ? "-" : item.quantity;
      ws.getCell(`F${row}`).value = item.isFlatAmount
        ? "-"
        : formatCurrency(item.unitPrice!, data.currency);
    }
    ws.getCell(`G${row}`).value = formatCurrency(item.amount, data.currency);
    ["A", "B", "C", "D", "E", "F", "G"].forEach((col) => {
      const cell = ws.getCell(`${col}${row}`);
      if (!cell.font) cell.font = arial({});
      if (["E", "F", "G"].includes(col)) {
        cell.alignment = { horizontal: "right" };
      }
    });
    row += 1;
  });

  // ── Items note (M14/M15) — unlabeled italic line describing the items as a whole ──
  if (data.itemsNote) {
    ws.getCell(`A${row}`).value = data.itemsNote;
    ws.getCell(`A${row}`).font = arial({
      size: 8,
      italic: true,
    });
    row += 1;
  }

  // Stronger rule at the end of the whole items block (header + item rows +
  // optional note) — not directly under the header or the last item row,
  // matching reference invoices, which use one rule separating items+note
  // from Subtotal.
  ["A", "B", "C", "D", "E", "F", "G"].forEach((col) => {
    ws.getCell(`${col}${row}`).border = {
      top: { style: "thin", color: { argb: RULE_COLOR } },
    };
  });
  row += 1;

  // ── Totals ──
  ws.getCell(`A${row}`).value = "Subtotal";
  ws.getCell(`A${row}`).font = arial({});
  ws.getCell(`G${row}`).value = formatCurrency(data.subtotal, data.currency);
  ws.getCell(`G${row}`).font = arial({});
  ws.getCell(`G${row}`).alignment = { horizontal: "right" };
  row += 1;

  ws.getCell(`A${row}`).value = "Total Due";
  ws.getCell(`A${row}`).font = arial({ bold: true });
  ws.getCell(`G${row}`).value = formatCurrency(data.total, data.currency);
  ws.getCell(`G${row}`).font = arial({ bold: true });
  ws.getCell(`G${row}`).alignment = { horizontal: "right" };
  row += 1;

  if (data.convertedTotal !== null && data.convertedCurrency !== null) {
    ws.getCell(`A${row}`).value = `Total in ${data.convertedCurrency}`;
    ws.getCell(`A${row}`).font = arial({ size: 9, color: MUTED_TEXT_COLOR });
    ws.getCell(`G${row}`).value = formatCurrency(
      data.convertedTotal,
      data.convertedCurrency,
    );
    ws.getCell(`G${row}`).font = arial({ size: 9, color: MUTED_TEXT_COLOR });
    ws.getCell(`G${row}`).alignment = { horizontal: "right" };
    row += 1;
  }

  row += 1;

  // ── Bottom note (M14/M15) — bold "Note" label, independent of itemsNote above ──
  if (data.bottomNote) {
    ws.getCell(`A${row}`).value = "Note";
    ws.getCell(`A${row}`).font = arial({ bold: true });
    ws.getCell(`B${row}`).value = data.bottomNote;
    ws.getCell(`B${row}`).font = arial({});
    row += 2;
  }

  // ── Payment details ──
  ws.getCell(`A${row}`).value = "Payment to be made to:";
  ws.getCell(`A${row}`).font = arial({ bold: true });
  row += 1;

  if (data.paymentDetails.length === 0) {
    ws.getCell(`A${row}`).value = "No payment method on file";
    ws.getCell(`A${row}`).font = arial({});
    row += 1;
  } else {
    data.paymentDetails.forEach((field) => {
      ws.getCell(`A${row}`).value = field.label;
      ws.getCell(`A${row}`).font = arial({});
      ws.getCell(`B${row}`).value = field.value;
      ws.getCell(`B${row}`).font = arial({});
      row += 1;
    });
  }

  // ── Page setup ──
  ws.pageSetup = {
    orientation: "portrait",
    paperSize: 9, // A4
    scale: 70,
    margins: {
      left: 0.7,
      right: 0.7,
      top: 0.75,
      bottom: 0.75,
      header: 0.3,
      footer: 0.3,
    },
  };
  ws.pageSetup.printArea = `A1:G${row}`;

  return workbook.xlsx.writeBuffer();
}
