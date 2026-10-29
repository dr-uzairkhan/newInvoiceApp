-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "previousInvoiceNumberFormats" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- The billing-period sentence the create form used to type into "itemsNote"
-- ("Covers services rendered <Mon D, YYYY> – <Mon D, YYYY>.") is now printed
-- by the document renderers directly from "periodStart"/"periodEnd". Strip the
-- generated sentence where it is the whole note, or its first line, so it is
-- not printed twice — only where both structured dates exist to print from.
UPDATE "Invoice"
SET "itemsNote" = NULL
WHERE "periodStart" IS NOT NULL
  AND "periodEnd" IS NOT NULL
  AND "itemsNote" ~ '^\s*Covers services rendered [A-Z][a-z]{2} [0-9]{1,2}, [0-9]{4} – [A-Z][a-z]{2} [0-9]{1,2}, [0-9]{4}\.\s*$';

UPDATE "Invoice"
SET "itemsNote" = regexp_replace("itemsNote", '^\s*Covers services rendered [A-Z][a-z]{2} [0-9]{1,2}, [0-9]{4} – [A-Z][a-z]{2} [0-9]{1,2}, [0-9]{4}\.[ \t]*\r?\n+', '')
WHERE "periodStart" IS NOT NULL
  AND "periodEnd" IS NOT NULL
  AND "itemsNote" ~ '^\s*Covers services rendered [A-Z][a-z]{2} [0-9]{1,2}, [0-9]{4} – [A-Z][a-z]{2} [0-9]{1,2}, [0-9]{4}\.[ \t]*\r?\n';
