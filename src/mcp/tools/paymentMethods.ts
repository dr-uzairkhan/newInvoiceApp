import { z } from "zod";
import { defineTool, requireConfirm } from "@/mcp/core";
import {
  confirmSchema,
  idSchema,
  maskPaymentMethod,
  notFound,
  revalidateAfterWrite,
} from "@/mcp/tools/shared";
import { ROLES } from "@/lib/permissions";
import {
  paymentMethodFieldSchema,
  paymentMethodSchema,
  type PaymentMethodInput,
} from "@/lib/validation/paymentMethod";
import { paymentMethodService } from "@/services/paymentMethodService";
import { partyService } from "@/services/partyService";
import type { PaymentMethod } from "@/generated/prisma/client";
import type { PaymentMethodField } from "@/repositories/paymentMethodRepository";

/** `paymentMethodService.getById` returns decrypted field values — only ever used here to merge an update, never returned to the client. */
function paymentMethodToInput(method: PaymentMethod): PaymentMethodInput {
  return {
    type: method.type,
    label: method.label,
    isDefault: method.isDefault,
    fields: method.fields as unknown as PaymentMethodField[],
  };
}

async function loadPaymentMethod(id: string): Promise<PaymentMethod> {
  const method = await paymentMethodService.getById(id);
  return method ?? notFound(`Payment method ${id}`);
}

const typeSchema = paymentMethodSchema.shape.type;

export const listPaymentMethods = defineTool({
  name: "list_payment_methods",
  title: "List payment methods",
  description:
    "Lists a party's payment methods (bank wire, Zelle, Payoneer or custom) with masked field values. Full details are visible only in the app.",
  inputSchema: { partyId: idSchema },
  scope: "READ",
  annotations: { readOnlyHint: true },
  target: ({ partyId }) => ({ type: "party", id: partyId }),
  handler: async ({ partyId }) => {
    if (!(await partyService.getById(partyId))) notFound(`Party ${partyId}`);
    const methods = await paymentMethodService.listForParty(partyId);
    return { paymentMethods: methods.map(maskPaymentMethod) };
  },
});

export const getPaymentMethod = defineTool({
  name: "get_payment_method",
  title: "Get payment method",
  description: "One payment method with masked field values.",
  inputSchema: { paymentMethodId: idSchema },
  scope: "READ",
  annotations: { readOnlyHint: true },
  target: ({ paymentMethodId }) => ({ type: "paymentMethod", id: paymentMethodId }),
  handler: async ({ paymentMethodId }) => ({
    paymentMethod: maskPaymentMethod(await loadPaymentMethod(paymentMethodId)),
  }),
});

export const createPaymentMethod = defineTool({
  name: "create_payment_method",
  title: "Create payment method",
  description:
    "Adds a payment method to a party. fields is an ordered list of {key, label, value} (e.g. bank name, account number, SWIFT); values are encrypted at rest. Setting isDefault true clears the party's previous default.",
  inputSchema: {
    partyId: idSchema,
    type: typeSchema,
    label: paymentMethodSchema.shape.label,
    isDefault: z.boolean().default(false),
    fields: z.array(paymentMethodFieldSchema).min(1),
  },
  scope: "WRITE",
  roles: ROLES.writePaymentMethods,
  target: ({ partyId }) => ({ type: "party", id: partyId }),
  handler: async ({ partyId, ...rest }) => {
    if (!(await partyService.getById(partyId))) notFound(`Party ${partyId}`);
    const input = paymentMethodSchema.parse(rest);
    const method = await paymentMethodService.create(partyId, input);
    revalidateAfterWrite();
    return { paymentMethod: maskPaymentMethod(method) };
  },
});

export const updatePaymentMethod = defineTool({
  name: "update_payment_method",
  title: "Update payment method",
  description:
    "Updates a payment method. Only the fields you pass change; if you pass fields, the whole list is replaced. Already-sent invoices keep their snapshotted payment details.",
  inputSchema: {
    paymentMethodId: idSchema,
    type: typeSchema.optional(),
    label: paymentMethodSchema.shape.label.optional(),
    isDefault: z.boolean().optional(),
    fields: z.array(paymentMethodFieldSchema).min(1).optional(),
  },
  scope: "WRITE",
  roles: ROLES.writePaymentMethods,
  target: ({ paymentMethodId }) => ({ type: "paymentMethod", id: paymentMethodId }),
  handler: async ({ paymentMethodId, ...patch }) => {
    const existing = await loadPaymentMethod(paymentMethodId);
    const merged = { ...paymentMethodToInput(existing) };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
    }
    const method = await paymentMethodService.update(
      paymentMethodId,
      existing.partyId,
      paymentMethodSchema.parse(merged),
    );
    revalidateAfterWrite();
    return { paymentMethod: maskPaymentMethod(method) };
  },
});

export const setDefaultPaymentMethod = defineTool({
  name: "set_default_payment_method",
  title: "Set default payment method",
  description: "Makes this payment method the party's default (clearing the previous default).",
  inputSchema: { paymentMethodId: idSchema },
  scope: "WRITE",
  roles: ROLES.writePaymentMethods,
  annotations: { idempotentHint: true },
  target: ({ paymentMethodId }) => ({ type: "paymentMethod", id: paymentMethodId }),
  handler: async ({ paymentMethodId }) => {
    const existing = await loadPaymentMethod(paymentMethodId);
    const method = await paymentMethodService.update(
      paymentMethodId,
      existing.partyId,
      { ...paymentMethodToInput(existing), isDefault: true },
    );
    revalidateAfterWrite();
    return { paymentMethod: maskPaymentMethod(method) };
  },
});

export const deletePaymentMethod = defineTool({
  name: "delete_payment_method",
  title: "Delete payment method",
  description:
    "Permanently deletes a payment method. Refused while any project uses it as its preferred method. Irreversible — requires confirm: true.",
  inputSchema: { paymentMethodId: idSchema, confirm: confirmSchema },
  scope: "WRITE_DESTRUCTIVE",
  roles: ROLES.writePaymentMethods,
  annotations: { destructiveHint: true },
  target: ({ paymentMethodId }) => ({ type: "paymentMethod", id: paymentMethodId }),
  handler: async ({ paymentMethodId, confirm }) => {
    requireConfirm(confirm, "Deleting a payment method");
    await loadPaymentMethod(paymentMethodId);
    await paymentMethodService.delete(paymentMethodId);
    revalidateAfterWrite();
    return { deleted: true, paymentMethodId };
  },
});

export const PAYMENT_METHOD_TOOLS = [
  listPaymentMethods,
  getPaymentMethod,
  createPaymentMethod,
  updatePaymentMethod,
  setDefaultPaymentMethod,
  deletePaymentMethod,
];
