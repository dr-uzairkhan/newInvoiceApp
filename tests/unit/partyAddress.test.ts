import { describe, expect, it } from "vitest";
import {
  addressLines,
  defaultAddressOf,
  describeProjectAddress,
  resolveProjectAddress,
} from "@/lib/partyAddress";
import type { PartyAddress } from "@/generated/prisma/client";

function address(overrides: Partial<PartyAddress>): PartyAddress {
  return {
    id: "a",
    partyId: "p",
    label: "Address",
    isDefault: false,
    street1: null,
    street2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const hq = address({
  id: "hq",
  label: "HQ",
  isDefault: true,
  city: "Testville",
});
const branch = address({ id: "branch", label: "Branch", city: "Othertown" });
const clientSite = address({
  id: "site",
  partyId: "c",
  label: "Site",
  isDefault: true,
});

function project(overrides: {
  contractorAddress?: PartyAddress | null;
  clientAddress?: PartyAddress | null;
  contractorAddresses?: PartyAddress[];
  clientAddresses?: PartyAddress[];
}) {
  return {
    contractor: { addresses: overrides.contractorAddresses ?? [hq, branch] },
    client: { addresses: overrides.clientAddresses ?? [clientSite] },
    contractorAddress: overrides.contractorAddress ?? null,
    clientAddress: overrides.clientAddress ?? null,
  };
}

describe("resolveProjectAddress", () => {
  it("prefers the project's explicit pick over the party default", () => {
    const result = resolveProjectAddress(
      project({ contractorAddress: branch }),
      "contractor",
    );
    expect(result).toEqual({ address: branch, source: "selected" });
  });

  it("falls back to the party's default when nothing is picked", () => {
    expect(resolveProjectAddress(project({}), "contractor")).toEqual({
      address: hq,
      source: "default",
    });
    expect(resolveProjectAddress(project({}), "client")).toEqual({
      address: clientSite,
      source: "default",
    });
  });

  it("resolves to none when the party has no default (or no addresses)", () => {
    expect(
      resolveProjectAddress(
        project({ contractorAddresses: [branch] }),
        "contractor",
      ),
    ).toEqual({ address: null, source: "none" });
    expect(
      resolveProjectAddress(project({ clientAddresses: [] }), "client"),
    ).toEqual({ address: null, source: "none" });
  });
});

describe("describeProjectAddress", () => {
  it("labels a fallback as the party default and a pick by its label alone", () => {
    expect(describeProjectAddress(project({}), "contractor")).toBe(
      "HQ (party default)",
    );
    expect(
      describeProjectAddress(
        project({ contractorAddress: branch }),
        "contractor",
      ),
    ).toBe("Branch");
    expect(
      describeProjectAddress(project({ clientAddresses: [] }), "client"),
    ).toBe("None");
  });
});

describe("addressLines / defaultAddressOf", () => {
  it("formats the city line and skips blanks, and tolerates no address at all", () => {
    expect(
      addressLines(
        address({
          street1: "1 Test Lane",
          city: "Testville",
          state: "TS",
          postalCode: "12345",
          country: "Testland",
        }),
      ),
    ).toEqual(["1 Test Lane", "Testville, TS 12345", "Testland"]);
    expect(addressLines(null)).toEqual([]);
  });

  it("finds the default among a party's addresses", () => {
    expect(defaultAddressOf([branch, hq])).toBe(hq);
    expect(defaultAddressOf([branch])).toBeNull();
  });
});
