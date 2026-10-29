import { z } from "zod";

/** Personal API token creation (`/settings/tokens`) — see `Docs/implementation_decisions.md` §32. */
export const apiTokenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the token a name — e.g. the machine or client it is for")
    .max(80, "Keep the name under 80 characters"),
  scope: z.enum(["READ", "WRITE", "WRITE_DESTRUCTIVE"], {
    message: "Pick a scope",
  }),
  /** Days until expiry; `0` means no expiry. */
  expiresInDays: z.union([
    z.literal(0),
    z.literal(30),
    z.literal(90),
    z.literal(365),
  ]),
});

export type ApiTokenInput = z.infer<typeof apiTokenSchema>;
