/**
 * M32.1 — manual visual-comparison tool, not automated pixel-diffing (this
 * repo has none). Builds a realistic `[test]`-prefixed invoice via the real
 * services (never raw Prisma writes), renders it two ways — the new
 * `pdf-lib` in-process renderer directly, and the existing browser path via
 * a real HTTP request to the running `GET /api/invoices/[id]/pdf` endpoint
 * (not a hand-rolled parallel Puppeteer call, so it can't silently drift
 * from the real route) — and writes both PDFs to `scripts/output/`
 * (gitignored) for manual side-by-side review. Cleans up its own fixture
 * afterward: invoice → project → parties, cascading the payment method and
 * the test session/user.
 *
 * Usage: run `pnpm dev` in one terminal, then in another:
 *   pnpm tsx scripts/comparePdfRenderers.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { partyService } = await import("@/services/partyService");
  const { projectService } = await import("@/services/projectService");
  const { paymentMethodService } =
    await import("@/services/paymentMethodService");
  const { invoiceService } = await import("@/services/invoiceService");
  const { documentService } = await import("@/services/documentService");
  const { renderInvoicePdf } = await import("@/lib/pdf/renderInvoicePdf");
  const { createTestUserWithSession, deleteTestUser, authCookieHeader } =
    await import("../tests/helpers/authFixtures");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  const contractor = await partyService.create({
    name: "[test] comparePdfRenderers Contractor",
    email: "billing@comparepdfrenderers.example",
    type: "ORGANIZATION",
    street1: "1 Main St",
    street2: "Suite 400",
    city: "Springfield",
    state: "IL",
    postalCode: "62701",
    country: "USA",
  });
  const client = await partyService.create({
    name: "[test] comparePdfRenderers Client",
    email: "ap@comparepdfrenderers.example",
    type: "ORGANIZATION",
    street1: "500 Market Ave",
    street2: "",
    city: "Metropolis",
    state: "NY",
    postalCode: "10001",
    country: "USA",
  });
  const paymentMethod = await paymentMethodService.create(contractor.id, {
    type: "BANK_WIRE",
    label: "Test Account",
    isDefault: true,
    fields: [
      { key: "bank_name", label: "Bank Name", value: "Example Bank" },
      {
        key: "bank_address",
        label: "Bank Address",
        value: "123 Sample Street, Springfield ST 00000",
      },
      {
        key: "routing_number",
        label: "Routing Number (ABA)",
        value: "021000021",
      },
      { key: "account_number", label: "Account No.", value: "00012345" },
    ],
  });
  const project = await projectService.create({
    name: "[test] comparePdfRenderers Project",
    abbreviation: "CPR",
    clientId: client.id,
    contractorId: contractor.id,
    preferredPaymentMethodId: paymentMethod.id,
    invoiceNumberFormat: "{abbreviation}-{number}",
    currencyMode: "SINGLE",
    displayCurrency: "USD",
    referralCreditEnabled: false,
    status: "ACTIVE",
  });

  const invoice = await invoiceService.createDraft(project.id, {
    invoiceNumber: "CPR-01",
    issueDate: "2026-01-01",
    dueDate: "2026-01-15",
    convertedTotal: "",
    itemsNote: "Work done Jan 1 - Jan 15, 2026",
    bottomNote: "Includes arrears from previous invoice",
    items: [
      {
        description: "Consulting services",
        quantity: "10",
        unitPrice: "150.00",
        isFlatAmount: false,
        amount: "",
        durationText: "",
      },
      {
        description: "Project setup (flat fee)",
        quantity: "",
        unitPrice: "",
        isFlatAmount: true,
        amount: "500.00",
        durationText: "Fixed",
      },
    ],
  });
  await invoiceService.transitionStatus(invoice.id, "SENT");

  const { user, sessionToken } = await createTestUserWithSession("ADMIN");

  try {
    const withItems = await invoiceService.getById(invoice.id);
    if (!withItems) throw new Error("invoice vanished after creation");
    const data = documentService.assembleInvoiceDocumentData(withItems);

    const pdfLibBytes = await renderInvoicePdf(data);

    const response = await fetch(`${appUrl}/api/invoices/${invoice.id}/pdf`, {
      headers: { Cookie: authCookieHeader(sessionToken) },
    });
    if (!response.ok) {
      throw new Error(
        `GET /api/invoices/${invoice.id}/pdf returned ${response.status} — is 'pnpm dev' running on ${appUrl}?`,
      );
    }
    const browserBytes = new Uint8Array(await response.arrayBuffer());

    const outputDir = new URL("output/", import.meta.url);
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(new URL("pdf-lib.pdf", outputDir), pdfLibBytes);
    writeFileSync(new URL("browser.pdf", outputDir), browserBytes);

    console.log(
      `[comparePdfRenderers] wrote scripts/output/pdf-lib.pdf (${pdfLibBytes.byteLength} bytes)`,
    );
    console.log(
      `[comparePdfRenderers] wrote scripts/output/browser.pdf (${browserBytes.byteLength} bytes)`,
    );
    console.log("[comparePdfRenderers] open both and compare manually.");
  } finally {
    await deleteTestUser(user.id);
    await invoiceService.delete(invoice.id);
    await projectService.delete(project.id);
    await partyService.delete(contractor.id);
    await partyService.delete(client.id);
  }
}

main().catch((error) => {
  console.error("[comparePdfRenderers] failed:", error);
  process.exit(1);
});
