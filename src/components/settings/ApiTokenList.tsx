"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatDisplayDate } from "@/lib/dates";
import { revokeApiTokenAction } from "@/actions/apiToken.actions";
import type { ApiTokenScope } from "@/generated/prisma/client";

export type ApiTokenRowData = {
  id: string;
  name: string;
  tokenPrefix: string;
  scope: ApiTokenScope;
  ownerLabel: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  /** Computed server-side so the list never reads the clock during render. */
  expired: boolean;
};

export const SCOPE_LABELS: Record<ApiTokenScope, string> = {
  READ: "Read only",
  WRITE: "Read + write",
  WRITE_DESTRUCTIVE: "Read + write + delete/void",
};

function RevokeButton({ token }: { token: ApiTokenRowData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Revoke
      </Button>
      <ConfirmDialog
        hideTrigger
        open={open}
        onOpenChange={setOpen}
        title={`Revoke “${token.name}”`}
        description="Any client using this token stops working immediately. The token's past calls stay in the audit log."
        confirmLabel="Revoke token"
        onConfirm={async () => {
          const result = await revokeApiTokenAction(token.id);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success("Token revoked.");
          router.refresh();
        }}
      />
    </>
  );
}

export function ApiTokenList({ tokens }: { tokens: ApiTokenRowData[] }) {
  if (tokens.length === 0) {
    return (
      <EmptyState
        title="No API tokens yet"
        description="Create one to connect an MCP client. You will see the token exactly once."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {tokens.map((token) => {
        const inactive = token.revokedAt !== null || token.expired;
        return (
          <Card key={token.id} className={inactive ? "opacity-70" : undefined}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-bold text-foreground">
                    {token.name}
                  </span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {token.tokenPrefix}…
                  </code>
                  <Badge variant="secondary">{SCOPE_LABELS[token.scope]}</Badge>
                  {token.revokedAt ? (
                    <Badge variant="secondary">Revoked</Badge>
                  ) : token.expired ? (
                    <Badge variant="secondary">Expired</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Acts as {token.ownerLabel} · created{" "}
                  {formatDisplayDate(token.createdAt)} · last used{" "}
                  {token.lastUsedAt ? formatDisplayDate(token.lastUsedAt) : "never"} ·{" "}
                  {token.expiresAt
                    ? `expires ${formatDisplayDate(token.expiresAt)}`
                    : "no expiry"}
                </p>
              </div>
              {inactive ? null : <RevokeButton token={token} />}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
