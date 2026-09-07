import type { InvoiceStatus } from "@/generated/prisma/client";
import type { InvoiceWithItems } from "@/repositories/invoiceRepository";
import type { PaymentMethodField } from "@/repositories/paymentMethodRepository";
import { decryptSecretOrRaw } from "@/lib/crypto/settingsEncryption";

export type PartySnapshotData = {
  name: string;
  email: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

/** `quantity`/`unitPrice` are null exactly when `isFlatAmount` is true (M14). */
export type InvoiceDocumentLineItem = {
  id: string;
  description: string;
  isFlatAmount: boolean;
  /** M35 — always rendered last (see the sort in assembleInvoiceDocumentData below), amount is negative. */
  isReferralCredit: boolean;
  quantity: string | null;
  unitPrice: string | null;
  amount: string;
  /** M48 — non-null only for a genuine Flat-amount item (never the referral-credit row). */
  durationText: string | null;
};

export type InvoiceDocumentData = {
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  serviceDescription: string;
  contractor: PartySnapshotData;
  client: PartySnapshotData;
  paymentDetails: PaymentMethodField[];
  items: InvoiceDocumentLineItem[];
  /** M48 — true when every item is Flat-amount (including the referral-credit row, if any); drives the single-Duration-column table layout shared by the preview, both PDF renderers, and Excel. */
  allItemsFlat: boolean;
  itemsNote: string | null;
  subtotal: string;
  total: string;
  currency: string;
  convertedTotal: string | null;
  convertedCurrency: string | null;
  bottomNote: string | null;
};

/**
 * The single view-model assembler consumed
 * identically by the on-screen preview, the print route, and (M8/M9) the
 * Excel/PDF builders. Sources exclusively from the invoice's own scalar
 * fields and snapshot JSON (never a live Party/PaymentMethod lookup, even
 * for a DRAFT invoice mid-edit) — a pure, synchronous mapper that imports no
 * repository, so there is nothing here that could ever issue a live query.
 * `invoice.items` arrives pre-ordered by `sortOrder` (invoiceRepository.findById's
 * `orderBy`), so no re-sorting is needed here. `paymentDetailsSnapshot.value`
 * is stored encrypted (M17.5 — still-encrypted at
 * SENT, same as the live `PaymentMethod.fields` it was copied from); decrypted
 * here at render time only, via a pure function call, not a live query — this
 * mapper still never imports a repository.
 * `serviceDescription` is a deliberate
 * exception to the "never live" framing above: like `Project.name` before
 * it, it's read straight off the already-loaded `invoice.project` relation,
 * not snapshotted onto Invoice — editing a Project's Service Description
 * retroactively changes the Details text on every invoice under it,
 * including already-SENT ones. Falls back to `Project.name` when unset.
 * `currency` IS snapshotted onto `Invoice`
 * (unlike `serviceDescription`) — every rate/subtotal/total figure this view
 * model exposes is denominated in it, so `InvoiceDocument.tsx`/
 * `buildInvoiceWorkbook.ts` must format every one of those figures with it,
 * never a hardcoded `"USD"`.
 * `items` is stable-sorted so any `isReferralCredit` row renders last
 * regardless of its stored `sortOrder` (M35) — the only re-sorting this
 * mapper ever does, everything else stays in the Prisma-supplied order.
 * `allItemsFlat` (M48) is computed once here, not independently by each
 * renderer, so the preview/PDF/Excel table layout can never diverge.
 */
function assembleInvoiceDocumentData(
  invoice: InvoiceWithItems,
): InvoiceDocumentData {
  const paymentDetails =
    invoice.paymentDetailsSnapshot as unknown as PaymentMethodField[];

  return {
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    serviceDescription:
      invoice.project.serviceDescription ?? invoice.project.name,
    contractor: invoice.fromPartySnapshot as unknown as PartySnapshotData,
    client: invoice.toPartySnapshot as unknown as PartySnapshotData,
    paymentDetails: paymentDetails.map((field) => ({
      ...field,
      value: decryptSecretOrRaw(field.value),
    })),
    items: [...invoice.items]
      .sort((a, b) => Number(a.isReferralCredit) - Number(b.isReferralCredit))
      .map((item) => ({
        id: item.id,
        description: item.description,
        isFlatAmount: item.isFlatAmount,
        isReferralCredit: item.isReferralCredit,
        quantity: item.quantity?.toString() ?? null,
        unitPrice: item.unitPrice?.toString() ?? null,
        amount: item.amount.toString(),
        durationText: item.durationText,
      })),
    allItemsFlat: invoice.items.every((item) => item.isFlatAmount),
    itemsNote: invoice.itemsNote,
    subtotal: invoice.subtotal.toString(),
    total: invoice.total.toString(),
    currency: invoice.currency,
    convertedTotal: invoice.convertedTotal?.toString() ?? null,
    convertedCurrency: invoice.convertedCurrency,
    bottomNote: invoice.bottomNote,
  };
}

export const documentService = {
  assembleInvoiceDocumentData,
};
