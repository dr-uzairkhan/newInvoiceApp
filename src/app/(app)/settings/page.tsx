import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProviderSettingsCard } from "@/components/settings/ProviderSettingsCard";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { PROVIDER_LABELS } from "@/lib/aiProviderLabels";
import { cn } from "@/lib/utils";
import { aiProviderSettingsService } from "@/services/aiProviderSettingsService";

/**
 * M16 — DB-backed AI provider configuration, replacing M11's read-only
 * env-var summary. Restyled per the v3 redesign (milestone 7,
 * ui_redesign_handoff_v3 screenshots/13-14) — always exactly 3 fixed
 * provider cards (Docs/implementation_decisions.md §19: "no dynamic
 * provider list"), so the mockup's "+ Add provider" button is deliberately
 * not carried over (confirmed with the user rather than silently dropped,
 * since it reverses an explicit shipped decision the same way milestone 6's
 * Party relationship split did).
 */
export default async function SettingsPage() {
  const settings = await aiProviderSettingsService.getSettingsForDisplay();
  const ready = settings.filter(
    (setting) => setting.enabled && setting.hasKey && setting.models.length > 0,
  );

  return (
    <>
      <PageHeader
        eyebrow="Application settings"
        title="AI providers"
        subtitle="API keys, provider priority and model fallback order for upcoming AI text help. No part of the app depends on this."
      />
      <SettingsTabs active="providers" />
      <ReadinessBanner
        readyLabels={ready.map((s) => PROVIDER_LABELS[s.provider])}
      />
      <div className="mb-2 flex items-center justify-between">
        <div>
          <span className="text-[13px] font-bold text-foreground">
            Provider priority
          </span>
          <p className="text-[11px] text-muted-foreground">
            Providers are tried from top to bottom. Models within each provider
            follow the same order.
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Use the arrows to reorder
        </span>
      </div>
      <div className="flex max-w-2xl flex-col gap-4">
        {settings.map((setting, index) => (
          <ProviderSettingsCard
            key={setting.provider}
            setting={setting}
            isFirst={index === 0}
            isLast={index === settings.length - 1}
          />
        ))}
      </div>
    </>
  );
}

function ReadinessBanner({ readyLabels }: { readyLabels: string[] }) {
  const count = readyLabels.length;
  const description =
    count === 0
      ? "No provider is configured and enabled yet."
      : count === 1
        ? `${readyLabels[0]} is the default provider.`
        : `${readyLabels[0]} is the default provider; ${readyLabels[1]} will be tried if it is unavailable.`;

  return (
    <div
      className={cn(
        "mb-6 flex max-w-2xl items-center justify-between gap-4 rounded-xl border p-4",
        count > 0
          ? "border-brand/20 bg-brand-light"
          : "border-border bg-muted/30",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            count > 0
              ? "bg-brand-light text-brand"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[12px] font-bold text-foreground">
            {count} {count === 1 ? "provider" : "providers"} ready
          </p>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
      </div>
      {count > 0 ? (
        <span className="shrink-0 rounded-full bg-[var(--status-paid-bg)] px-2.5 py-1 text-[10px] font-bold text-[var(--status-paid-text)] uppercase">
          AI assistance available
        </span>
      ) : null}
    </div>
  );
}
