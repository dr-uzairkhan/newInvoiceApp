"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Plus,
  X,
} from "lucide-react";
import {
  aiProviderSettingSchema,
  type AiProviderSettingInput,
} from "@/lib/validation/aiProviderSettings";
import {
  updateProviderSettingAction,
  moveProviderAction,
} from "@/actions/aiProviderSettings.actions";
import type { ProviderSettingDisplay } from "@/services/aiProviderSettingsService";
import type { AiProviderName } from "@/lib/ai-providers/types";
import { PROVIDER_LABELS } from "@/lib/aiProviderLabels";
import { FormField } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Redesign v3 milestone 7 (ui_redesign_handoff_v3
 * screenshots/13-settings-providers.jpg, /14-settings-provider-collapsed.jpg)
 * — the avatar monogram/tone colors are one-off decorative accents, same
 * arbitrary-hex-class precedent as ProjectTable.tsx/PartyTable.tsx's avatars,
 * not part of the shared design-token system.
 */
const PROVIDER_META: Record<
  AiProviderName,
  { short: string; className: string }
> = {
  google: { short: "G", className: "bg-[#e7f0ff] text-[#356ac3]" },
  groq: { short: "GQ", className: "bg-[#ffede2] text-[#c66030]" },
  anthropic: { short: "AI", className: "bg-[#f4e9e2] text-[#8a5943]" },
};

/**
 * M16 — one card per fixed provider (Docs/implementation_decisions.md §19:
 * "no dynamic provider list") — restyled to the v3 prototype's collapsible
 * card, all underlying form/action wiring unchanged. `apiKey` always starts
 * blank (write-only, see aiProviderSettingsService) — leaving it blank on
 * submit keeps whatever key is already saved; `maskedKeyHint` is the only
 * trace of the real value that ever reaches the client, and the Show/Hide
 * toggle below only ever reveals what's currently typed into that blank
 * field, never a decrypted stored value.
 */
export function ProviderSettingsCard({
  setting,
  isFirst,
  isLast,
}: {
  setting: ProviderSettingDisplay;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMoving, startMoveTransition] = useTransition();
  const [expanded, setExpanded] = useState(true);
  const [showKey, setShowKey] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AiProviderSettingInput>({
    resolver: zodResolver(aiProviderSettingSchema),
    defaultValues: {
      apiKey: "",
      models: setting.models.map((value) => ({ value })),
      enabled: setting.enabled,
    },
  });

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "models",
  });

  const onSubmit = handleSubmit(async (values) => {
    setIsSubmitting(true);
    try {
      const result = await updateProviderSettingAction(
        setting.provider,
        values,
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${PROVIDER_LABELS[setting.provider]} settings saved`);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  });

  function handleMove(direction: "up" | "down") {
    startMoveTransition(async () => {
      await moveProviderAction(setting.provider, direction);
      router.refresh();
    });
  }

  const meta = PROVIDER_META[setting.provider];
  const label = PROVIDER_LABELS[setting.provider];
  const roleLabel = isFirst ? "Default" : `Fallback ${setting.order}`;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card",
        !setting.enabled && "opacity-70",
      )}
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
              meta.className,
            )}
          >
            {meta.short}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-bold text-foreground">
              {label}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {setting.hasKey
                ? `${setting.models.length} ${setting.models.length === 1 ? "model" : "models"} configured`
                : "Not configured"}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-md px-2 py-1 text-[10px] font-bold whitespace-nowrap uppercase",
            isFirst
              ? "bg-brand-light text-brand"
              : "bg-muted text-muted-foreground",
          )}
        >
          {roleLabel}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            className="h-7 w-7 p-0"
            disabled={isFirst || isMoving}
            onClick={() => handleMove("up")}
            aria-label={`Move ${label} up`}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-7 w-7 p-0"
            disabled={isLast || isMoving}
            onClick={() => handleMove("down")}
            aria-label={`Move ${label} down`}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setExpanded(!expanded)}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </header>

      {expanded ? (
        <form onSubmit={onSubmit} noValidate className="p-4">
          <FormField
            label="API Key"
            htmlFor={`${setting.provider}-apiKey`}
            error={errors.apiKey?.message}
          >
            <div className="flex">
              <Input
                id={`${setting.provider}-apiKey`}
                type={showKey ? "text" : "password"}
                autoComplete="off"
                placeholder={
                  setting.maskedKeyHint
                    ? `${setting.maskedKeyHint} — leave blank to keep`
                    : "Not set"
                }
                className="h-9 rounded-r-none border-r-0"
                {...register("apiKey")}
              />
              <Button
                type="button"
                variant="outline"
                className="h-9 shrink-0 gap-1 rounded-l-none px-2.5 text-[11px]"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                {showKey ? "Hide" : "Show"}
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {setting.hasKey
                ? "A key is stored. Leave unchanged to keep the existing key."
                : "Add an API key before enabling this provider."}
            </p>
          </FormField>

          <div className="mt-4 mb-2 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold tracking-[0.05em] text-muted-foreground uppercase">
                Models
              </span>
              <p className="text-[11px] text-muted-foreground">
                Tried in the order shown
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => append({ value: "" })}
            >
              <Plus className="h-3.5 w-3.5" />
              Add model
            </Button>
          </div>

          {fields.length === 0 ? (
            <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-dashed border-border bg-muted/30 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Plus className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-foreground">
                  No models configured
                </p>
                <p className="text-[11px] text-muted-foreground">
                  This provider will be skipped at runtime.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-7 shrink-0 px-2 text-[11px]"
                onClick={() => append({ value: "" })}
              >
                Add first model
              </Button>
            </div>
          ) : (
            <div className="mb-4 flex flex-col gap-2">
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-1.5">
                  <span className="flex h-8 w-6 shrink-0 items-center justify-center rounded-md bg-brand-light text-[11px] font-bold text-brand">
                    {index + 1}
                  </span>
                  <Input
                    placeholder="e.g. gemini-2.5-flash"
                    {...register(`models.${index}.value` as const)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 p-0"
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                    aria-label="Move model up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 p-0"
                    disabled={index === fields.length - 1}
                    onClick={() => move(index, index + 1)}
                    aria-label="Move model down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 p-0 text-destructive"
                    onClick={() => remove(index)}
                    aria-label="Remove model"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {errors.models?.root?.message ? (
                <p className="text-[11px] text-destructive">
                  {errors.models.root.message}
                </p>
              ) : null}
            </div>
          )}

          <Controller
            name="enabled"
            control={control}
            render={({ field }) => (
              <div className="-mx-4 -mb-4 mt-2 flex items-center justify-between border-t border-border bg-muted/20 px-4 py-3">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <span className="relative inline-flex h-[18px] w-[31px] shrink-0 items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={field.value}
                      onChange={(event) => field.onChange(event.target.checked)}
                    />
                    <span className="absolute inset-0 rounded-full bg-muted transition-colors peer-checked:bg-brand peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50" />
                    <span className="absolute left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-[13px]" />
                  </span>
                  <span>
                    <span className="block text-[12px] font-semibold text-foreground">
                      {field.value ? "Enabled" : "Disabled"}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {field.value
                        ? "Available for AI text features"
                        : "Skipped at runtime"}
                    </span>
                  </span>
                </label>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-8 px-3 text-[12px]"
                >
                  {isSubmitting ? "Saving…" : "Save provider"}
                </Button>
              </div>
            )}
          />
        </form>
      ) : null}
    </article>
  );
}
