-- CreateTable
CREATE TABLE "InvoiceComment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceComment_invoiceId_createdAt_idx" ON "InvoiceComment"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceComment_authorUserId_idx" ON "InvoiceComment"("authorUserId");

-- AddForeignKey
ALTER TABLE "InvoiceComment" ADD CONSTRAINT "InvoiceComment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceComment" ADD CONSTRAINT "InvoiceComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
