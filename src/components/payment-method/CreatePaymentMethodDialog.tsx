"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PaymentMethodForm } from "@/components/payment-method/PaymentMethodForm";
import type { PaymentMethod } from "@/generated/prisma/client";

/**
 * M17.4 — lets an admin add a contractor's first
 * payment method without leaving the Project page. Embeds the full
 * PaymentMethodForm (identical fields to the standalone
 * /parties/[id]/payment-methods/new page) in embedded mode.
 * Only rendered while `open`, so each opening starts from a fresh, blank
 * form. Contractor-only by construction — this dialog is only ever wired up
 * from ProjectForm's Contractor field, never Client (
 * M20 confirmed client parties never reference a payment method).
 */
export function CreatePaymentMethodDialog({
  open,
  onOpenChange,
  partyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partyId: string;
  onCreated: (paymentMethod: PaymentMethod) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Payment Method</DialogTitle>
          <DialogDescription>
            Add a payment method for this contractor without leaving this page.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PaymentMethodForm
            mode="create"
            partyId={partyId}
            embedded
            onCreated={(paymentMethod) => {
              onCreated(paymentMethod);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
