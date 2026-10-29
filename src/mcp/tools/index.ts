import type { AnyToolDef } from "@/mcp/core";
import { PROJECT_TOOLS } from "@/mcp/tools/projects";
import { PARTY_TOOLS } from "@/mcp/tools/parties";
import { PAYMENT_METHOD_TOOLS } from "@/mcp/tools/paymentMethods";
import { INVOICE_TOOLS } from "@/mcp/tools/invoices";
import { COMMENT_TOOLS } from "@/mcp/tools/comments";
import { ALERT_SCHEDULE_TOOLS } from "@/mcp/tools/alertSchedules";
import { DOCUMENT_TOOLS } from "@/mcp/tools/documents";

/** Every tool the MCP endpoint exposes — `Docs/mcp_server.md` lists them for connecting clients. */
export const ALL_TOOLS: readonly AnyToolDef[] = [
  ...PROJECT_TOOLS,
  ...PARTY_TOOLS,
  ...PAYMENT_METHOD_TOOLS,
  ...INVOICE_TOOLS,
  ...COMMENT_TOOLS,
  ...ALERT_SCHEDULE_TOOLS,
  ...DOCUMENT_TOOLS,
];
