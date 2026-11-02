"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { PartyAddressDialog } from "@/components/party-address/PartyAddressDialog";
import { deletePartyAddressAction } from "@/actions/partyAddress.actions";
import { addressLines } from "@/lib/partyAddress";
import { withReturnTo } from "@/lib/backNavigation";
import type { PartyAddress } from "@/generated/prisma/client";
import type { ProjectRef } from "@/services/projectService";

/**
 * Party detail page's Addresses tab — the address counterpart of
 * PaymentMethodList. Add/edit happen in a dialog on this page (an address
 * is small enough not to need routes of its own); `deletableIds` is
 * precomputed server-side from each address's live project references.
 */
export function PartyAddressList({
  partyId,
  addresses,
  deletableIds,
  projectRefsByAddressId,
  returnTo,
}: {
  partyId: string;
  addresses: PartyAddress[];
  deletableIds: Set<string>;
  /** Which ACTIVE project(s) show each address (either side); each tag links to the project. */
  projectRefsByAddressId: Record<string, ProjectRef[]>;
  /** The party page's own incoming returnTo — nested into each "used by" link so the chain survives the hop. */
  returnTo?: string;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PartyAddress | null>(null);
  const tabReturnTo = withReturnTo(`/parties/${partyId}?tab=addresses`, returnTo);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(address: PartyAddress) {
    setEditing(address);
    setDialogOpen(true);
  }

  const dialog = (
    <PartyAddressDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      partyId={partyId}
      address={editing}
      onSaved={() => router.refresh()}
    />
  );

  if (addresses.length === 0) {
    return (
      <>
        <EmptyState
          title="No addresses yet"
          description="Add an address so it can appear on this party's invoices."
          action={<Button onClick={openCreate}>Add Address</Button>}
        />
        {dialog}
      </>
    );
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button
          variant="outline"
          className="h-8 px-3 text-[12px]"
          onClick={openCreate}
        >
          Add Address
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {addresses.map((address) => {
          const lines = addressLines(address);
          const usedByProjects = projectRefsByAddressId[address.id] ?? [];
          return (
            <Card key={address.id}>
              <CardContent className="flex items-start justify-between gap-4 pt-6">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-foreground">
                      {address.label}
                    </span>
                    {address.isDefault ? (
                      <Badge className="uppercase">Default</Badge>
                    ) : null}
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    {lines.join(" · ")}
                  </p>
                  {usedByProjects.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        Used by:
                      </span>
                      {usedByProjects.map((project) => (
                        <Badge
                          key={project.id}
                          variant="outline"
                          className="border-transparent bg-[var(--status-paid-bg)] font-normal normal-case text-[var(--status-paid-text)] transition-colors hover:bg-[#047857] hover:text-white"
                          render={
                            <Link
                              href={withReturnTo(
                                `/projects/${project.id}`,
                                tabReturnTo,
                              )}
                            />
                          }
                        >
                          {project.name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    className="h-8 px-3 text-[12px]"
                    onClick={() => openEdit(address)}
                  >
                    Edit
                  </Button>
                  <ConfirmDialog
                    triggerLabel="Delete"
                    triggerVariant="destructive"
                    disabled={!deletableIds.has(address.id)}
                    disabledReason="This address is selected on a project. Change that project's address first."
                    title={`Delete ${address.label}?`}
                    description="This cannot be undone. Sent invoices keep the address they were sent with."
                    confirmLabel="Delete"
                    onConfirm={async () => {
                      const result = await deletePartyAddressAction(
                        address.id,
                        partyId,
                      );
                      if (!result.success) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success("Address deleted");
                      router.refresh();
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {dialog}
    </>
  );
}
