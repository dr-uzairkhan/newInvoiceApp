import { aiProviderSettingRepository } from "@/repositories/aiProviderSettingRepository";
import {
  decryptSecret,
  encryptSecret,
  maskedHint,
} from "@/lib/crypto/settingsEncryption";
import type {
  AiProviderName,
  AiProviderTarget,
} from "@/lib/ai-providers/types";

export type ResolvedAiTarget = AiProviderTarget & { apiKey: string };

export type AiAssistConfigSummary = {
  configured: boolean;
  primary: AiProviderTarget | null;
  fallback: AiProviderTarget[];
};

export type ProviderSettingDisplay = {
  provider: AiProviderName;
  hasKey: boolean;
  maskedKeyHint: string | null;
  models: string[];
  enabled: boolean;
  order: number;
};

/**
 * DB-backed AI provider config, replacing M11's
 * environment-variables-only resolution. `ensureSeeded()` runs before every
 * read so the app never needs a separate manual seed step for the 3 fixed
 * provider rows.
 */
async function getSettingsForDisplay(): Promise<ProviderSettingDisplay[]> {
  await aiProviderSettingRepository.ensureSeeded();
  const rows = await aiProviderSettingRepository.findAllOrdered();
  return rows.map((row) => ({
    provider: row.provider,
    hasKey: row.apiKeyCiphertext !== null,
    maskedKeyHint:
      row.apiKeyCiphertext !== null
        ? maskedHint(decryptSecret(row.apiKeyCiphertext))
        : null,
    models: row.models,
    enabled: row.enabled,
    order: row.order,
  }));
}

/**
 * Full runtime fallback sequence: providers walked in `order` (skipping
 * disabled/keyless/model-less rows), then each provider's `models` in list
 * order — the two-level structure `fallbackRunner.ts` walks flat.
 */
async function getResolvedSequence(): Promise<ResolvedAiTarget[]> {
  await aiProviderSettingRepository.ensureSeeded();
  const rows = await aiProviderSettingRepository.findAllOrdered();

  const resolved: ResolvedAiTarget[] = [];
  for (const row of rows) {
    if (!row.enabled || !row.apiKeyCiphertext || row.models.length === 0) {
      continue;
    }
    const apiKey = decryptSecret(row.apiKeyCiphertext);
    for (const model of row.models) {
      resolved.push({ provider: row.provider, model, apiKey });
    }
  }
  return resolved;
}

async function getConfigSummary(): Promise<AiAssistConfigSummary> {
  const sequence = await getResolvedSequence();
  const [primary, ...fallback] = sequence;
  return {
    configured: sequence.length > 0,
    primary: primary
      ? { provider: primary.provider, model: primary.model }
      : null,
    fallback: fallback.map(({ provider, model }) => ({ provider, model })),
  };
}

/**
 * `apiKey` blank/omitted means "keep the existing key" — write-only fields
 * are never sent back to the client to compare against, so an empty
 * submission must not clear a previously-saved key.
 */
async function updateProviderSetting(
  provider: AiProviderName,
  input: { apiKey: string; models: string[]; enabled: boolean },
): Promise<void> {
  await aiProviderSettingRepository.ensureSeeded();
  const trimmedKey = input.apiKey.trim();
  await aiProviderSettingRepository.update(provider, {
    models: input.models,
    enabled: input.enabled,
    ...(trimmedKey ? { apiKeyCiphertext: encryptSecret(trimmedKey) } : {}),
  });
}

/** Adjacent-swap reordering — promotes/demotes a provider by one position. */
async function moveProvider(
  provider: AiProviderName,
  direction: "up" | "down",
): Promise<void> {
  await aiProviderSettingRepository.ensureSeeded();
  const rows = await aiProviderSettingRepository.findAllOrdered();
  const index = rows.findIndex((row) => row.provider === provider);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= rows.length) return;

  await aiProviderSettingRepository.swapOrder(
    { provider: rows[index].provider, order: rows[index].order },
    { provider: rows[targetIndex].provider, order: rows[targetIndex].order },
  );
}

export const aiProviderSettingsService = {
  getSettingsForDisplay,
  getResolvedSequence,
  getConfigSummary,
  updateProviderSetting,
  moveProvider,
};
