import { z, ZodError, type ZodRawShape, type ZodTypeAny } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ApiTokenScope, Role } from "@/generated/prisma/client";
import { ALL_ROLES, hasRole } from "@/lib/permissions";
import { scopeAllows, type Principal } from "@/services/apiTokenService";
import { mcpAuditLogRepository } from "@/repositories/mcpAuditLogRepository";
import {
  ProjectNotFoundError,
  InvoiceNotFoundError,
  InvoiceNotDraftError,
  DuplicateInvoiceNumberError,
  InvalidTransitionError,
  InvoiceSendValidationError,
} from "@/services/invoiceService";
import {
  ProjectDeletionBlockedError,
  PreferredPaymentMethodMismatchError,
} from "@/services/projectService";
import { PartyDeletionBlockedError } from "@/services/partyService";
import { PaymentMethodDeletionBlockedError } from "@/services/paymentMethodService";
import {
  InvoiceCommentNotFoundError,
  InvoiceCommentDeleteForbiddenError,
} from "@/services/invoiceCommentService";

/**
 * MCP tool layer (`Docs/implementation_decisions.md` §32). Every tool is a
 * `ToolDef`: a zod input shape, the minimum token scope, the roles allowed
 * to attempt it (the same `ROLES` table the Server Actions use), and a
 * handler that calls the *services* — never Prisma — so every business
 * rule the app enforces (sent-invoice lock, transition matrix, send
 * validation, deletion blocks, last-admin guard …) applies to an MCP call
 * exactly as it does to a click in the UI. `registerTools` wraps each
 * handler with the scope/role check, maps named service errors to a
 * readable tool error instead of an exception, and writes one audit row
 * per call.
 */

/** A tool error the model should read and act on (shown as `isError`). */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export type ToolContext = {
  principal: Principal;
};

export type ToolTarget = { type: string; id?: string | null };

export type ToolDef<Shape extends ZodRawShape> = {
  name: string;
  title: string;
  description: string;
  inputSchema: Shape;
  /** Minimum token scope: READ for lists/gets, WRITE for create/update/transition, WRITE_DESTRUCTIVE for delete/void. */
  scope: ApiTokenScope;
  /** Roles allowed to attempt the call; defaults to every role. */
  roles?: readonly Role[];
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
  /** What the audit row points at, derived from the validated arguments. (Method syntax on purpose: it keeps every concrete `ToolDef<Shape>` assignable to `AnyToolDef` for the registry.) */
  target?(args: z.infer<z.ZodObject<Shape>>): ToolTarget;
  handler(args: z.infer<z.ZodObject<Shape>>, ctx: ToolContext): Promise<unknown>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDef = ToolDef<any>;

/** Marker a handler can return to send non-text content (e.g. a PDF blob) instead of serialised JSON. */
export type RawContentResult = { rawContent: CallToolResult["content"] };

export function isRawContentResult(value: unknown): value is RawContentResult {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as RawContentResult).rawContent)
  );
}

/** Identity helper that keeps `Shape` inferred at the definition site. */
export function defineTool<Shape extends ZodRawShape>(
  def: ToolDef<Shape>,
): ToolDef<Shape> {
  return def;
}

/**
 * Plain-JSON view of a service result: Prisma `Decimal` → string (it
 * already serialises that way), `Date` → ISO string, `undefined` dropped.
 */
export function serialize<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      item !== null &&
      typeof item === "object" &&
      !(item instanceof Date) &&
      typeof (item as { toFixed?: unknown }).toFixed === "function"
        ? String(item)
        : item,
    ),
  );
}

/** The one place a destructive call's `confirm` flag is checked. */
export function requireConfirm(confirm: boolean | undefined, what: string): void {
  if (confirm !== true) {
    throw new ToolInputError(
      `${what} is irreversible. Call again with confirm: true to proceed.`,
    );
  }
}

/** Named service errors → messages a model can act on. Anything else is logged and hidden. */
export function describeKnownError(error: unknown): string | null {
  if (
    error instanceof ToolInputError ||
    error instanceof ProjectNotFoundError ||
    error instanceof InvoiceNotFoundError ||
    error instanceof InvoiceNotDraftError ||
    error instanceof DuplicateInvoiceNumberError ||
    error instanceof InvalidTransitionError ||
    error instanceof InvoiceSendValidationError ||
    error instanceof ProjectDeletionBlockedError ||
    error instanceof PreferredPaymentMethodMismatchError ||
    error instanceof PartyDeletionBlockedError ||
    error instanceof PaymentMethodDeletionBlockedError ||
    error instanceof InvoiceCommentNotFoundError ||
    error instanceof InvoiceCommentDeleteForbiddenError
  ) {
    return error.message;
  }
  if (error instanceof ZodError) {
    const flattened = error.flatten();
    const fieldMessages = Object.entries(flattened.fieldErrors)
      .map(([field, messages]) => `${field}: ${(messages ?? []).join("; ")}`)
      .concat(flattened.formErrors);
    return `Invalid input — ${fieldMessages.join(" | ")}`;
  }
  return null;
}

function textResult(payload: unknown, isError = false): CallToolResult {
  const text =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
    ...(typeof payload === "object" && payload !== null && !isError
      ? { structuredContent: payload as Record<string, unknown> }
      : {}),
  };
}

/**
 * Executes a tool exactly as the MCP server would — scope/role gate, run,
 * error mapping, audit — but without the transport. Exported so tests can
 * exercise the rule enforcement directly.
 */
export async function executeTool(
  def: AnyToolDef,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<CallToolResult> {
  const { principal } = ctx;
  const schema = z.object(def.inputSchema as ZodRawShape);
  let target: ToolTarget | null = null;

  const audit = async (
    outcome: "ok" | "denied" | "error",
    detail: string | null,
  ) => {
    try {
      await mcpAuditLogRepository.create({
        tokenId: principal.tokenId,
        userId: principal.userId,
        tool: def.name,
        targetType: target?.type ?? null,
        targetId: target?.id ?? null,
        outcome,
        detail: detail ? detail.slice(0, 500) : null,
      });
    } catch (error) {
      console.error("mcp: failed to write audit row", error);
    }
  };

  if (!scopeAllows(principal.scope, def.scope)) {
    const message = `This token's scope (${principal.scope}) does not allow ${def.name}; it needs ${def.scope}.`;
    await audit("denied", message);
    return textResult(message, true);
  }
  if (!hasRole(principal.role, def.roles ?? ALL_ROLES)) {
    const message = `Your role (${principal.role}) is not allowed to call ${def.name}.`;
    await audit("denied", message);
    return textResult(message, true);
  }

  try {
    const parsed = schema.parse(rawArgs ?? {});
    target = def.target ? def.target(parsed) : null;
    const result = await def.handler(parsed, ctx);
    await audit("ok", null);
    if (isRawContentResult(result)) return { content: result.rawContent };
    return textResult(serialize(result) ?? { ok: true });
  } catch (error) {
    const known = describeKnownError(error);
    if (known) {
      await audit("error", known);
      return textResult(known, true);
    }
    console.error(`mcp: unexpected error in ${def.name}`, error);
    await audit("error", "unexpected error");
    return textResult(
      "Something went wrong on the server. The call was not completed.",
      true,
    );
  }
}

/** Registers every tool on an `McpServer` bound to one principal (one server per request, stateless). */
export function registerTools(
  server: McpServer,
  defs: readonly AnyToolDef[],
  ctx: ToolContext,
): void {
  for (const def of defs) {
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: describeForClient(def),
        inputSchema: def.inputSchema as Record<string, ZodTypeAny>,
        annotations: {
          readOnlyHint: def.scope === "READ",
          destructiveHint: def.scope === "WRITE_DESTRUCTIVE",
          ...def.annotations,
        },
      },
      (args) => executeTool(def, args, ctx),
    );
  }
}

function describeForClient(def: AnyToolDef): string {
  const roles = def.roles ?? ALL_ROLES;
  const roleNote =
    roles.length === ALL_ROLES.length ? "" : ` Roles: ${roles.join(", ")}.`;
  return `${def.description} Requires token scope ${def.scope}.${roleNote}`;
}
