import { FilterChips } from "@/components/shared/FilterChips";

const TABS = [
  { value: "providers", label: "AI Providers" },
  { value: "users", label: "Users" },
  { value: "tokens", label: "API Tokens" },
] as const;

/** M28 — real route tabs (/settings, /settings/users, /settings/tokens), not a
 * `?`-param variant of one page like FilterChips' other users — `hrefFor` just
 * points at different pages instead. */
export function SettingsTabs({
  active,
}: {
  active: (typeof TABS)[number]["value"];
}) {
  return (
    <div className="mb-4">
      <FilterChips
        options={TABS}
        active={active}
        hrefFor={(value) =>
          value === "providers" ? "/settings" : `/settings/${value}`
        }
      />
    </div>
  );
}
