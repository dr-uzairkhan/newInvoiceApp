"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PartyForm } from "@/components/party/PartyForm";
import type { Party } from "@/generated/prisma/client";

/**
 * M17.3 — the inline "create new party" escape
 * hatch embeds the full PartyForm (identical fields to the standalone
 * /parties/new page, including address) in embedded mode, so
 * a party created here is never structurally incomplete and the Project
 * form underneath is never navigated away from or lost. Only rendered while
 * `open`, so each opening starts from a fresh, blank form.
 */
function CreatePartyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (party: Party) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Party</DialogTitle>
          <DialogDescription>
            Add this party&apos;s full details without leaving this page.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PartyForm
            mode="create"
            embedded
            onCreated={(party) => {
              onCreated(party);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function PartyPickerWithCreateEscape({
  label,
  parties,
  value,
  onChange,
  onPartyCreated,
  error,
  placeholder = "Select a party",
}: {
  label: string;
  parties: Party[];
  value: string;
  onChange: (partyId: string) => void;
  onPartyCreated: (party: Party) => void;
  error?: string;
  placeholder?: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="mb-4 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-[0.05em] text-muted-foreground uppercase">
          {label}
          <span className="ml-0.5 text-destructive">*</span>
        </span>
        <button
          type="button"
          className="flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-3 w-3" />
          Create new party
        </button>
      </div>
      <Select
        value={value}
        onValueChange={(newValue) => onChange(newValue ?? "")}
      >
        <SelectTrigger className="w-full">
          <SelectValue
            placeholder={placeholder}
            renderValue={(value) =>
              parties.find((party) => party.id === value)?.name
            }
          />
        </SelectTrigger>
        <SelectContent>
          {parties.map((party) => (
            <SelectItem key={party.id} value={party.id}>
              {party.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}

      <CreatePartyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(party) => {
          onPartyCreated(party);
          onChange(party.id);
          setDialogOpen(false);
        }}
      />
    </div>
  );
}
