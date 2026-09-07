import { LockedBanner } from "@/components/invoice/LockedBanner";
import { formatCurrency } from "@/lib/currency";
import { formatDisplayDate } from "@/lib/dates";
import { deriveDisplayStatus } from "@/lib/invoiceStatus";
import { addressLines } from "@/lib/partyAddress";
import type {
  InvoiceDocumentData,
  PartySnapshotData,
} from "@/services/documentService";
import styles from "./InvoiceDocument.module.css";

/**
 * Docs/invoice_design_guidelines.md — print-first A4 invoice document,
 * rendered identically by the in-app preview (/invoices/[id]) and the bare
 * print route (/invoices/[id]/print) that will become the literal PDF page
 * (M9). No cards/shadows/rounded framing in either context, per the
 * guideline — both routes render this exact component with no wrapper
 * styling differences. Data comes exclusively from
 * documentService.assembleInvoiceDocumentData.
 *
 * The status indicator is rendered locally here (not the shared
 * `StatusBadge` component used in the invoice list/page header elsewhere)
 * as a small, subtle marker near the invoice metadata rather than a large
 * pill beside the title, per the guideline's §14 status-display rules.
 */
export function InvoiceDocument({
  data,
  screenOnly = true,
}: {
  data: InvoiceDocumentData;
  /**
   * Controls the locked banner and status tag — chrome that's never part of
   * the actual PDF (see the @media print rule below). Defaults to true for
   * the in-app Preview tab, where seeing them on screen is useful context.
   * The dedicated /print route (both the real PDF-generation source and the
   * "Print view" link's screen-viewed preview) passes false so what's shown
   * there always matches what actually prints, rather than relying solely
   * on @media print to hide them only during an actual print/PDF pass.
   */
  screenOnly?: boolean;
}) {
  const isLocked = data.status !== "DRAFT";
  const hasConvertedTotal =
    data.convertedTotal !== null && data.convertedCurrency !== null;
  const displayStatus = deriveDisplayStatus(data.status, data.dueDate);

  return (
    <div>
      {isLocked && screenOnly ? <LockedBanner /> : null}
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.senderName}>{data.contractor.name}</p>
            {addressLines(data.contractor).map((line) => (
              <p key={line} className={styles.senderAddressLine}>
                {line}
              </p>
            ))}
          </div>
          <div className={styles.metaBlock}>
            <p className={styles.metaLabel}>Invoice #</p>
            <p className={styles.invoiceNumber}>{data.invoiceNumber}</p>
            <p className={styles.metaValue}>
              Issue date: {formatDisplayDate(data.issueDate)}
            </p>
            {screenOnly ? (
              <span className={styles.statusLine}>{displayStatus}</span>
            ) : null}
          </div>
        </header>

        <div className={styles.rule} />

        <h1 className={styles.title}>Invoice</h1>

        <div className={styles.summaryGrid}>
          <div>
            <p className={styles.summaryLabel}>Bill To</p>
            <PartyLines party={data.client} />
          </div>
          <div>
            <p className={styles.summaryLabel}>Details</p>
            <p className={styles.summaryContent}>{data.serviceDescription}</p>
          </div>
          <div>
            <p className={styles.summaryLabel}>Payment</p>
            <p className={styles.summaryContent}>
              Due date: {formatDisplayDate(data.dueDate)}
            </p>
          </div>
        </div>

        <table className={styles.table}>
          {data.allItemsFlat ? (
            <>
              <colgroup>
                <col className={styles.colDescriptionWide} />
                <col className={styles.colDuration} />
                <col className={styles.colAmount} />
              </colgroup>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className={styles.numberCell}>Duration</th>
                  <th className={styles.numberCell}>
                    Amount ({data.currency})
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td className={styles.numberCell}>
                      {item.durationText ?? "-"}
                    </td>
                    <td className={styles.numberCell}>
                      {formatCurrency(item.amount, data.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : (
            <>
              <colgroup>
                <col className={styles.colDescription} />
                <col className={styles.colQty} />
                <col className={styles.colRate} />
                <col className={styles.colAmount} />
              </colgroup>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className={styles.numberCell}>Unit (hrs)</th>
                  <th className={styles.numberCell}>Rate</th>
                  <th className={styles.numberCell}>
                    Amount ({data.currency})
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td className={styles.numberCell}>
                      {item.isFlatAmount ? "-" : item.quantity}
                    </td>
                    <td className={styles.numberCell}>
                      {item.isFlatAmount
                        ? "-"
                        : formatCurrency(item.unitPrice!, data.currency)}
                    </td>
                    <td className={styles.numberCell}>
                      {formatCurrency(item.amount, data.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>

        {data.itemsNote ? (
          <p className={styles.itemsNote}>{data.itemsNote}</p>
        ) : null}

        <div className={styles.itemsBlockRule} />

        <div className={styles.totals}>
          <div className={styles.totalRow}>
            <span>Subtotal</span>
            <span className={styles.numberCell}>
              {formatCurrency(data.subtotal, data.currency)}
            </span>
          </div>
          <div className={`${styles.totalRow} ${styles.totalRowFinal}`}>
            <span>Total Due</span>
            <span className={styles.numberCell}>
              {formatCurrency(data.total, data.currency)}
            </span>
          </div>
          {hasConvertedTotal ? (
            <>
              <div className={styles.convertedRule} />
              <div className={styles.convertedRow}>
                <span>Total in {data.convertedCurrency}</span>
                <span className={styles.numberCell}>
                  {formatCurrency(
                    data.convertedTotal!,
                    data.convertedCurrency!,
                  )}
                </span>
              </div>
            </>
          ) : null}
        </div>

        {data.bottomNote ? (
          <div className={styles.bottomNoteRow}>
            <span className={styles.bottomNoteLabel}>Note</span>
            <span className={styles.bottomNoteValue}>{data.bottomNote}</span>
          </div>
        ) : null}

        <div className={styles.paymentSection}>
          <p className={styles.sectionHeading}>Payment to be made to:</p>
          <div className={styles.paymentGrid}>
            {data.paymentDetails.length > 0 ? (
              data.paymentDetails.map((field) => (
                <div key={field.key} className={styles.paymentRow}>
                  <span className={styles.paymentLabel}>{field.label}</span>
                  <span className={styles.paymentValue}>{field.value}</span>
                </div>
              ))
            ) : (
              <p className={styles.paymentValue}>No payment method on file</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PartyLines({ party }: { party: PartySnapshotData }) {
  return (
    <>
      <p className={styles.summaryContent}>{party.name}</p>
      {party.email ? (
        <p className={styles.summaryContentSecondary}>{party.email}</p>
      ) : null}
      {addressLines(party).map((line) => (
        <p key={line} className={styles.summaryContentSecondary}>
          {line}
        </p>
      ))}
    </>
  );
}
