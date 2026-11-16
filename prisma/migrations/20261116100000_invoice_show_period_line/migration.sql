-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "showPeriodLine" BOOLEAN NOT NULL DEFAULT false;

-- Invoices that already print the period sentence (both structured dates set)
-- keep printing it, so no issued document changes shape. New invoices default
-- to off.
UPDATE "Invoice"
SET "showPeriodLine" = true
WHERE "periodStart" IS NOT NULL
  AND "periodEnd" IS NOT NULL;
