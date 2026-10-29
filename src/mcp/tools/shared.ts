import { z } from "zod";
import { revalidatePath } from "next/cache";
import { ToolInputError } from "@/mcp/core";
import type { PaymentMethod } from "@/generated/prisma/client";
import type { PaymentMethodField } from "@/repositories/paymentMethodRepository";

export const idSchema = z.string().trim().min(1);

/** `confirm: true` is required on every irreversible tool; the handler enforces it via `requireConfirm`. */
export const confirmSchema = z
  .boolean()
  .optional()
  .describe("Must be true to proceed — this action cannot be undone.");

export function notFound(what: string): never {
  throw new ToolInputError(`${what} was not found.`);
}

/**
 * Pages are statically cached per route; a write through MCP must
 * invalidate them like a Server Action would. Outside a request (tests)
 * `revalidatePath` throws, so it is best-effort here.
 */
export function revalidateAfterWrite(): void {
  try {
    revalidatePath("/", "layout");
  } catch {
    /* no request scope (tests) — nothing to invalidate */
  }
}

/** Bank details never leave the app over MCP: keep the label/key, show only the last characters of each value. */
export function maskValue(value: string): string {
  const visible = value.length > 4 ? value.slice(-4) : "";
  return `••••${visible}`;
}

export function maskPaymentMethod(method: PaymentMethod) {
  const fields = method.fields as unknown as PaymentMethodField[];
  return {
    id: method.id,
    partyId: method.partyId,
    type: method.type,
    label: method.label,
    isDefault: method.isDefault,
    fields: fields.map((field) => ({
      key: field.key,
      label: field.label,
      value: maskValue(field.value),
    })),
    createdAt: method.createdAt,
    updatedAt: method.updatedAt,
  };
}

export type { RawContentResult } from "@/mcp/core";
