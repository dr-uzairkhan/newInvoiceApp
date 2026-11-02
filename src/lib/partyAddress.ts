import type { PartyAddress } from "@/generated/prisma/client";

/** The six postal fields — what a `PartyAddress` row and a party snapshot have in common. */
export type AddressFields = Pick<
  PartyAddress,
  "street1" | "street2" | "city" | "state" | "postalCode" | "country"
>;

/**
 * Shared by InvoiceDocument.tsx (on-screen/print), buildInvoiceWorkbook.ts
 * (Excel) and the party/project detail cards so the address-line formatting
 * can't drift between them.
 */
export function addressLines(address: AddressFields | null): string[] {
  if (!address) return [];
  const lines: string[] = [];
  if (address.street1) lines.push(address.street1);
  if (address.street2) lines.push(address.street2);
  const cityState = [address.city, address.state].filter(Boolean).join(", ");
  const cityLine = [cityState, address.postalCode].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);
  if (address.country) lines.push(address.country);
  return lines;
}

/** The party's default address, if it has one (service keeps at most one). */
export function defaultAddressOf(
  addresses: PartyAddress[],
): PartyAddress | null {
  return addresses.find((address) => address.isDefault) ?? null;
}

export type ProjectAddressSide = "contractor" | "client";

type ProjectAddressSource = {
  contractor: { addresses: PartyAddress[] };
  client: { addresses: PartyAddress[] };
  contractorAddress: PartyAddress | null;
  clientAddress: PartyAddress | null;
};

/**
 * Which address a project's invoices show for one side
 * (Docs/implementation_decisions.md §16): the explicitly selected one, else
 * the party's current default, else none. `source` says which rule won so
 * detail cards can label a fallback as such.
 */
export function resolveProjectAddress(
  project: ProjectAddressSource,
  side: ProjectAddressSide,
): { address: PartyAddress | null; source: "selected" | "default" | "none" } {
  const selected =
    side === "contractor" ? project.contractorAddress : project.clientAddress;
  if (selected) return { address: selected, source: "selected" };
  const fallback = defaultAddressOf(project[side].addresses);
  if (fallback) return { address: fallback, source: "default" };
  return { address: null, source: "none" };
}

/** One-line description for detail cards: the label, marked when it's the party's default standing in. */
export function describeProjectAddress(
  project: ProjectAddressSource,
  side: ProjectAddressSide,
): string {
  const { address, source } = resolveProjectAddress(project, side);
  if (!address) return "None";
  return source === "default"
    ? `${address.label} (party default)`
    : address.label;
}
