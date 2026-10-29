import { NextResponse } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { apiTokenService } from "@/services/apiTokenService";
import { registerTools } from "@/mcp/core";
import { ALL_TOOLS } from "@/mcp/tools";
import { consumeRateLimit } from "@/mcp/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The MCP endpoint (`Docs/implementation_decisions.md` §32): Streamable
 * HTTP, stateless — every request authenticates a personal API token,
 * builds a fresh `McpServer` bound to that principal, and hands the
 * request to the SDK's web-standard transport. Stateless means no
 * session table, no SSE resumption and nothing to clean up on the single
 * droplet process; the cost is a per-request server construction, which
 * is a few microseconds of object setup. Hosting it here, as the third
 * Route Handler in the app, means it ships inside the existing standalone
 * artifact and systemd service with no sidecar.
 */
async function handle(request: Request): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  const principal = match ? await apiTokenService.authenticate(match[1]) : null;
  if (!principal) {
    return NextResponse.json(
      { error: "Unauthorized. Send a valid personal API token as a Bearer token." },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="mcp"' } },
    );
  }

  const limit = consumeRateLimit(principal.tokenId);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests for this token. Slow down and retry." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const server = new McpServer({ name: "newinvoice", version: "1.0.0" });
  registerTools(server, ALL_TOOLS, { principal });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handle(request);
}
