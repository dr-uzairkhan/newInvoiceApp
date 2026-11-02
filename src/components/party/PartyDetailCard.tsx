import Link from "next/link";
import { Pencil } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DetailField } from "@/components/shared/DetailField";
import { addressLines, defaultAddressOf } from "@/lib/partyAddress";
import { withReturnTo } from "@/lib/backNavigation";
import type { Party, PartyAddress } from "@/generated/prisma/client";

const TYPE_LABELS: Record<Party["type"], string> = {
  INDIVIDUAL: "Individual",
  ORGANIZATION: "Organization",
};

/**
 * Read-only view of a Party — the default landing state at /parties/[id],
 * per M10.5. Mirrors every field PartyForm edits, plus the party's default
 * address (the full list lives on the Addresses tab).
 */
export function PartyDetailCard({
  party,
  addresses,
  editHref,
  returnTo,
}: {
  party: Party;
  addresses: PartyAddress[];
  editHref: string;
  returnTo?: string;
}) {
  const defaultAddress = defaultAddressOf(addresses);
  const lines = addressLines(defaultAddress);
  const otherCount = addresses.length - (defaultAddress ? 1 : 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[15px] font-bold text-foreground">
          Details
        </CardTitle>
        <CardAction>
          <Button
            variant="outline"
            className="h-8 px-3 text-[12px]"
            nativeButton={false}
            render={<Link href={editHref} />}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DetailField label="Name" value={party.name} />
        <DetailField label="Type" value={TYPE_LABELS[party.type]} />
        <DetailField label="Email" value={party.email ?? "—"} />
        <DetailField
          label={
            defaultAddress
              ? `Default Address · ${defaultAddress.label}`
              : "Default Address"
          }
          value={
            <span className="flex flex-col">
              {lines.length > 0 ? (
                lines.map((line, index) => <span key={index}>{line}</span>)
              ) : (
                <span>—</span>
              )}
              <Link
                href={withReturnTo(
                  `/parties/${party.id}?tab=addresses`,
                  returnTo,
                )}
                className="mt-1 text-[11px] font-bold text-brand hover:underline"
              >
                {otherCount > 0
                  ? `Manage addresses (${otherCount} more)`
                  : "Manage addresses"}
              </Link>
            </span>
          }
        />
      </CardContent>
    </Card>
  );
}
