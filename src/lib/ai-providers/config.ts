import { aiProviderSettingsService } from "@/services/aiProviderSettingsService";
import type {
  AiAssistConfigSummary,
  ResolvedAiTarget,
} from "@/services/aiProviderSettingsService";

export type { ResolvedAiTarget, AiAssistConfigSummary };

/**
 * DB-backed — supersedes M11's
 * environment-variables-only resolution (`implementation_decisions.md` §22
 * addendum). Thin re-exports over `aiProviderSettingsService` so
 * `fallbackRunner.ts` (and any page that needs to know whether AI is
 * configured) import from this same module; both are `async` since they
 * read Postgres. Server-only.
 */
export function resolveAiAssistSequence(): Promise<ResolvedAiTarget[]> {
  return aiProviderSettingsService.getResolvedSequence();
}

export function getAiAssistConfigSummary(): Promise<AiAssistConfigSummary> {
  return aiProviderSettingsService.getConfigSummary();
}
