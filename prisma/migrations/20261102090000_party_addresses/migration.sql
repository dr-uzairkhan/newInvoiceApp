-- Party addresses move out of the six inlined Party columns into their own
-- table so a party can hold several, and each project picks which one its
-- invoices show (Docs/implementation_decisions.md §16).
--
-- Order matters: the new table and Project columns are created first, every
-- existing address is copied over and wired to its projects, and only then
-- are the old Party columns dropped — so no address data is lost.

-- CreateTable
CREATE TABLE "PartyAddress" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "street1" TEXT,
    "street2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartyAddress_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "clientAddressId" TEXT,
ADD COLUMN     "contractorAddressId" TEXT;

-- Backfill: one "Primary" default address per party that had any address
-- data. Parties with every address field blank get no row (they had no
-- address before either).
INSERT INTO "PartyAddress" ("id", "partyId", "label", "isDefault", "street1", "street2", "city", "state", "postalCode", "country", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", 'Primary', true, p."street1", p."street2", p."city", p."state", p."postalCode", p."country", p."createdAt", CURRENT_TIMESTAMP
FROM "Party" p
WHERE p."street1" IS NOT NULL
   OR p."street2" IS NOT NULL
   OR p."city" IS NOT NULL
   OR p."state" IS NOT NULL
   OR p."postalCode" IS NOT NULL
   OR p."country" IS NOT NULL;

-- Backfill: every existing project keeps showing exactly the address it
-- showed before — pinned explicitly rather than left to the default
-- fallback, so a later change of a party's default never silently moves it.
UPDATE "Project" pr
SET "contractorAddressId" = a."id"
FROM "PartyAddress" a
WHERE a."partyId" = pr."contractorId";

UPDATE "Project" pr
SET "clientAddressId" = a."id"
FROM "PartyAddress" a
WHERE a."partyId" = pr."clientId";

-- CreateIndex
CREATE INDEX "PartyAddress_partyId_idx" ON "PartyAddress"("partyId");

-- CreateIndex
CREATE INDEX "Project_contractorAddressId_idx" ON "Project"("contractorAddressId");

-- CreateIndex
CREATE INDEX "Project_clientAddressId_idx" ON "Project"("clientAddressId");

-- AddForeignKey
ALTER TABLE "PartyAddress" ADD CONSTRAINT "PartyAddress_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_contractorAddressId_fkey" FOREIGN KEY ("contractorAddressId") REFERENCES "PartyAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientAddressId_fkey" FOREIGN KEY ("clientAddressId") REFERENCES "PartyAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: the inlined columns are now fully copied into PartyAddress.
ALTER TABLE "Party" DROP COLUMN "city",
DROP COLUMN "country",
DROP COLUMN "postalCode",
DROP COLUMN "state",
DROP COLUMN "street1",
DROP COLUMN "street2";
