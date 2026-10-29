"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { SCOPE_LABELS } from "@/components/settings/ApiTokenList";
import { createApiTokenAction } from "@/actions/apiToken.actions";
import type { ApiTokenInput } from "@/lib/validation/apiToken";

const EXPIRY_OPTIONS: { value: ApiTokenInput["expiresInDays"]; label: string }[] = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
  { value: 0, label: "No expiry" },
];

/**
 * Creates a personal API token and shows the plaintext exactly once, with
 * the one-line command that connects Claude Code to this app's MCP
 * endpoint. Closing the dialog is the last time the token is visible.
 */
export function CreateApiTokenDialog({ mcpUrl }: { mcpUrl: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiTokenInput["scope"]>("WRITE");
  const [expiresInDays, setExpiresInDays] =
    useState<ApiTokenInput["expiresInDays"]>(90);
  const [isPending, setIsPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [plaintext, setPlaintext] = useState<string | null>(null);

  function reset() {
    setName("");
    setScope("WRITE");
    setExpiresInDays(90);
    setFieldErrors({});
    setPlaintext(null);
  }

  async function submit() {
    setIsPending(true);
    setFieldErrors({});
    try {
      const result = await createApiTokenAction({ name, scope, expiresInDays });
      if (!result.success) {
        setFieldErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) toast.error(result.error);
        return;
      }
      setPlaintext(result.data.plaintext);
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  const command = plaintext
    ? `claude mcp add --transport http newinvoice ${mcpUrl} --header "Authorization: Bearer ${plaintext}"`
    : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button />}>Create token</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{plaintext ? "Token created" : "Create API token"}</DialogTitle>
          <DialogDescription>
            {plaintext
              ? "Copy it now — it will not be shown again. Anyone holding it can act as you within its scope."
              : "The token acts as your account, limited to the scope you choose. Every call it makes is written to the audit log."}
          </DialogDescription>
        </DialogHeader>

        {plaintext ? (
          <div className="flex flex-col gap-3">
            <code className="block rounded-md bg-muted px-3 py-2 font-mono text-[12px] break-all select-all">
              {plaintext}
            </code>
            <p className="text-[11px] font-bold tracking-[0.05em] text-muted-foreground uppercase">
              Connect Claude Code
            </p>
            <code className="block rounded-md bg-muted px-3 py-2 font-mono text-[11px] break-all select-all">
              {command}
            </code>
            <div className="flex justify-end">
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            noValidate
          >
            <FormField
              label="Name"
              htmlFor="apiTokenName"
              required
              error={fieldErrors.name?.[0]}
            >
              <Input
                id="apiTokenName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Claude Code on my laptop"
                autoFocus
              />
            </FormField>
            <FormField label="Scope" htmlFor="apiTokenScope" required error={fieldErrors.scope?.[0]}>
              <select
                id="apiTokenScope"
                value={scope}
                onChange={(event) =>
                  setScope(event.target.value as ApiTokenInput["scope"])
                }
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-[13px]"
              >
                {(Object.keys(SCOPE_LABELS) as ApiTokenInput["scope"][]).map(
                  (value) => (
                    <option key={value} value={value}>
                      {SCOPE_LABELS[value]}
                    </option>
                  ),
                )}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Delete and void also require an explicit confirm flag on every
                call, whatever the scope.
              </p>
            </FormField>
            <FormField label="Expires" htmlFor="apiTokenExpiry" required>
              <select
                id="apiTokenExpiry"
                value={expiresInDays}
                onChange={(event) =>
                  setExpiresInDays(
                    Number(event.target.value) as ApiTokenInput["expiresInDays"],
                  )
                }
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-[13px]"
              >
                {EXPIRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || name.trim().length === 0}>
                {isPending ? "Creating…" : "Create token"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
