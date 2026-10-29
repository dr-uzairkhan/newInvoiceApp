import { describe, expect, it } from "vitest";
import { resolveMcpUrl } from "@/lib/mcpUrl";

function headersOf(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

describe("resolveMcpUrl", () => {
  it("uses the forwarded host and scheme behind the reverse proxy", () => {
    expect(
      resolveMcpUrl(
        headersOf({
          host: "127.0.0.1:3000",
          "x-forwarded-host": "invoices.example.com",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://invoices.example.com/api/mcp");
  });

  it("defaults to https for a public host and http for a local one", () => {
    expect(resolveMcpUrl(headersOf({ host: "invoices.example.com" }))).toBe(
      "https://invoices.example.com/api/mcp",
    );
    expect(resolveMcpUrl(headersOf({ host: "localhost:3001" }))).toBe(
      "http://localhost:3001/api/mcp",
    );
    expect(resolveMcpUrl(headersOf({ host: "127.0.0.1:3002" }))).toBe(
      "http://127.0.0.1:3002/api/mcp",
    );
  });

  it("falls back to a relative path with no host at all", () => {
    expect(resolveMcpUrl(headersOf({}))).toBe("/api/mcp");
  });
});
