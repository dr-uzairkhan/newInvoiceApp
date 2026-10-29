import type { ZodType } from "zod";
import { resolveAiAssistSequence } from "@/lib/ai-providers/config";
import { callGoogle } from "@/lib/ai-providers/google";
import { callAnthropic } from "@/lib/ai-providers/anthropic";
import { callGroq } from "@/lib/ai-providers/groq";
import type {
  AiProviderCaller,
  AiProviderName,
} from "@/lib/ai-providers/types";

const CALLERS: Record<AiProviderName, AiProviderCaller> = {
  google: callGoogle,
  anthropic: callAnthropic,
  groq: callGroq,
};

/**
 * Scans from `start` (the index of an opening `{`/`[`) for the matching
 * close, honoring quoted-string content (including escapes) so a brace/
 * bracket character inside a string value never miscounts depth. Returns
 * the index of the matching close, or -1 if the value never balances.
 */
function findBalancedJsonEnd(text: string, start: number): number {
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === open) depth++;
    else if (char === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Strips ```json fences a model may wrap its output in despite instructions
 * not to. Some models additionally append trailing prose after a raw,
 * unfenced JSON value (e.g. "...} Let me know if you'd like changes!") —
 * a plain `JSON.parse` on the whole text fails on that trailing content, so
 * this falls back to locating the first balanced top-level JSON value and
 * parsing only that substring.
 */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch (error) {
    const start = candidate.search(/[{[]/);
    if (start === -1) throw error;
    const end = findBalancedJsonEnd(candidate, start);
    if (end === -1) throw error;
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

/**
 * Walks the DB-backed provider→model fallback sequence (M16,
 * providers in cascade order, each provider's
 * models in list order), stopping at the first response that parses as JSON
 * and validates against `schema`. Every per-target failure (network error,
 * non-JSON response, schema mismatch) is logged and swallowed — this never
 * throws, since every AI feature is pure progressive enhancement and must never
 * surface a blocking error to a form.
 */
export async function runWithFallback<T>(params: {
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType<T>;
}): Promise<T | null> {
  const sequence = await resolveAiAssistSequence();

  for (const target of sequence) {
    try {
      const raw = await CALLERS[target.provider]({
        model: target.model,
        apiKey: target.apiKey,
        systemPrompt: params.systemPrompt,
        userPrompt: params.userPrompt,
      });
      const parsed = params.schema.safeParse(extractJson(raw));
      if (parsed.success) {
        return parsed.data;
      }
      console.error(
        `aiAssist: ${target.provider}:${target.model} returned a response that failed schema validation`,
        parsed.error.flatten(),
      );
    } catch (error) {
      console.error(
        `aiAssist: ${target.provider}:${target.model} failed`,
        error,
      );
    }
  }

  return null;
}
