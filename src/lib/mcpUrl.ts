/**
 * The MCP endpoint URL to show an admin, derived from the request they are
 * actually on. `NEXT_PUBLIC_APP_URL` is baked into the bundle at build time
 * (the CI build uses a localhost value), so it can never describe the host
 * the deployed app is served from — the request headers can. Behind the
 * reverse proxy the original host and scheme arrive as `x-forwarded-*`.
 */
export function resolveMcpUrl(headers: {
  get(name: string): string | null;
}): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "";
  if (!host) return "/api/mcp";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.");
  const proto =
    headers.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}/api/mcp`;
}
