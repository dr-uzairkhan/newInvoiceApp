import { z } from "zod";
import { addressFieldsSchema } from "@/lib/validation/partyAddress";

/**
 * Docs/mvp_user_stories.md Story 1.1: Name required; Email optional but
 * validated if present; Type is the only classification field (no Role —
 * Docs/implementation_decisions.md §15). Addresses are separate
 * `PartyAddress` rows (§16) — this is everything that lives on `Party`
 * itself, and what an update may change.
 */
export const partyCoreSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || z.string().email().safeParse(value).success,
      {
        message: "Enter a valid email address",
      },
    ),
  type: z.enum(["INDIVIDUAL", "ORGANIZATION"], {
    message: "Select a party type",
  }),
});

export type PartyCoreInput = z.infer<typeof partyCoreSchema>;

/**
 * The create shape: the core fields plus an optional first address, saved
 * as the party's default `PartyAddress` when any of its fields is filled in
 * (labelled `addressLabel`, or "Primary" when that is left blank). Lets a
 * party still be onboarded with its address in one step — on the create
 * page, in the project form's inline "create new party" dialog and over
 * MCP. Further addresses are managed on the party's Addresses tab.
 */
export const partySchema = partyCoreSchema.extend({
  addressLabel: z.string().trim().optional().or(z.literal("")),
  ...addressFieldsSchema.shape,
});

export type PartyInput = z.infer<typeof partySchema>;
