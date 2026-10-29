import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { ApiTokenList } from "@/components/settings/ApiTokenList";
import { CreateApiTokenDialog } from "@/components/settings/CreateApiTokenDialog";
import { headers } from "next/headers";
import { apiTokenService } from "@/services/apiTokenService";
import { resolveMcpUrl } from "@/lib/mcpUrl";

/**
 * Personal API tokens for the MCP endpoint (`Docs/implementation_decisions.md`
 * §32). Admin-only like the rest of `/settings` (gated one level up). The
 * plaintext token is shown once, in the create dialog, and never again.
 */
export default async function ApiTokensSettingsPage() {
  const tokens = await apiTokenService.list();
  // From the request the admin is actually on, never NEXT_PUBLIC_APP_URL
  // (baked in at build time with CI's localhost value) — see src/lib/mcpUrl.ts.
  const mcpUrl = resolveMcpUrl(await headers());

  return (
    <>
      <PageHeader
        eyebrow="Application settings"
        title="API tokens"
        subtitle="Personal tokens that let an MCP client such as Claude Code operate this app as you. Each token has a scope; every call is logged."
        action={<CreateApiTokenDialog mcpUrl={mcpUrl} />}
      />
      <SettingsTabs active="tokens" />
      <ApiTokenList
        tokens={tokens.map((token) => ({
          id: token.id,
          name: token.name,
          tokenPrefix: token.tokenPrefix,
          scope: token.scope,
          ownerLabel: token.user.name ?? token.user.email,
          createdAt: token.createdAt,
          lastUsedAt: token.lastUsedAt,
          expiresAt: token.expiresAt,
          revokedAt: token.revokedAt,
          expired: apiTokenService.isExpired(token),
        }))}
      />
    </>
  );
}
