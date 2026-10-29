import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsTabs } from "@/components/settings/SettingsTabs";

/** Regression: every tab once linked to /settings, so "Users" and "API Tokens" did nothing when clicked. */
describe("SettingsTabs", () => {
  it("links each tab to its own route", () => {
    const html = renderToStaticMarkup(<SettingsTabs active="providers" />);
    expect(html).toContain('href="/settings"');
    expect(html).toContain('href="/settings/users"');
    expect(html).toContain('href="/settings/tokens"');
  });
});
