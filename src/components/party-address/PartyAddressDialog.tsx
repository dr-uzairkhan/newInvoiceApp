"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PartyAddressForm } from "@/components/party-address/PartyAddressForm";
import type { PartyAddress } from "@/generated/prisma/client";

/**
 * Add or edit one of a party's addresses in place — on the party's
 * Addresses tab, and as the project form's "+ Add address" escape hatch
 * (the same role CreatePaymentMethodDialog plays for payment methods).
 * Only rendered while `open`, so each opening starts from a fresh form.
 */
export function PartyAddressDialog({
  open,
  onOpenChange,
  partyId,
  address,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partyId: string;
  /** The row being edited; omit to create a new address. */
  address?: PartyAddress | null;
  onSaved: (address: PartyAddress) => void;
}) {
  const mode = address ? "edit" : "create";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add Address" : "Edit Address"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add another address for this party. Projects can pick which one their invoices show."
              : "Changes apply to future invoices and unsent drafts only — sent invoices keep the address they were sent with."}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PartyAddressForm
            mode={mode}
            partyId={partyId}
            addressId={address?.id}
            defaultValues={
              address
                ? {
                    label: address.label,
                    isDefault: address.isDefault,
                    street1: address.street1 ?? "",
                    street2: address.street2 ?? "",
                    city: address.city ?? "",
                    state: address.state ?? "",
                    postalCode: address.postalCode ?? "",
                    country: address.country ?? "",
                  }
                : undefined
            }
            onSaved={(saved) => {
              onSaved(saved);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
