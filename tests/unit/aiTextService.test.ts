import { afterEach, describe, expect, it, vi } from "vitest";

const runWithFallback = vi.fn();
vi.mock("@/lib/ai-providers/fallbackRunner", () => ({
  runWithFallback: (params: unknown) => runWithFallback(params),
}));

const { aiTextService, buildImproveTextSystemPrompt, improvedTextSchema } =
  await import("@/services/aiTextService");

afterEach(() => {
  runWithFallback.mockReset();
});

describe("aiTextService.improveText", () => {
  it("sends the trimmed text as the user prompt with a field-specific system prompt and returns the model's text", async () => {
    runWithFallback.mockResolvedValue({ text: "Software development services" });

    const result = await aiTextService.improveText(
      "  software developement servces  ",
      "itemDescription",
    );

    expect(result).toBe("Software development services");
    expect(runWithFallback).toHaveBeenCalledTimes(1);
    const params = runWithFallback.mock.calls[0][0] as {
      systemPrompt: string;
      userPrompt: string;
      schema: unknown;
    };
    expect(params.userPrompt).toBe("software developement servces");
    expect(params.systemPrompt).toBe(buildImproveTextSystemPrompt("itemDescription"));
    expect(params.systemPrompt).toContain("line-item description");
    expect(params.schema).toBe(improvedTextSchema);
  });

  it("returns null without calling a provider for blank input", async () => {
    expect(await aiTextService.improveText("   ", "itemsNote")).toBeNull();
    expect(runWithFallback).not.toHaveBeenCalled();
  });

  it("returns null when every provider fails (the runner yields null)", async () => {
    runWithFallback.mockResolvedValue(null);
    expect(await aiTextService.improveText("some note", "bottomNote")).toBeNull();
  });

  it("the system prompt forbids changing facts and demands the JSON shape", () => {
    for (const field of ["itemDescription", "itemsNote", "bottomNote"] as const) {
      const prompt = buildImproveTextSystemPrompt(field);
      expect(prompt).toContain("Never add, remove or invent information");
      expect(prompt).toContain('{"text": "<improved text>"}');
    }
  });

  it("the response schema rejects an empty rewrite", () => {
    expect(improvedTextSchema.safeParse({ text: "   " }).success).toBe(false);
    expect(improvedTextSchema.safeParse({ text: "ok" }).success).toBe(true);
  });
});
