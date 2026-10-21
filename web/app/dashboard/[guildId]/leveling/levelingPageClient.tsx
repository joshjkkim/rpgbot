"use client";

import { useState } from "react";
import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import { Section, Toggle } from "@/app/components/ui/form";
import XpBasicsEditor from "@/app/components/xp/xpBasicsEditor";
import LevelsEditor from "@/app/components/levels/levelsEditor";
import RoleRewardsEditor from "@/app/components/levels/roleRewardsEditor";

/** The page in four parts, so owners open the one they came for instead of scrolling past the rest. */
const TABS = [
  { id: "earning", label: "Earning XP", blurb: "What messages and voice are worth, per channel and per role." },
  { id: "daily", label: "Dailies & streaks", blurb: "What /daily pays, and the bonus for coming back day after day." },
  { id: "levels", label: "Levels", blurb: "The level cap, the curve, and where level-ups are announced." },
  { id: "rewards", label: "Rewards", blurb: "What members get at a level, or for getting a role from any bot." },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** XP and levels on one page, behind one switch: off for servers that keep another leveling bot. */
export default function LevelingPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, dirty, error, save } = useGuildConfig(guildId);
  const [tab, setTab] = useState<Tab>("earning");
  const on = config?.xp?.enabled !== false;
  // With leveling off, role rewards are all that's left here.
  const shown: Tab = on ? tab : "rewards";

  return (
    <ConfigPage
      title="Leveling"
      description="Chat and voice XP, daily rewards, the level curve, and the rewards along the way."
      loading={loading}
      saving={saving}
      error={error}
      dirty={dirty}
      onSave={() => save(config)}
      rawSection={config ? { xp: config.xp, levels: config.levels, roleRewards: config.roleRewards } : undefined}
    >
      {config && (
        <>
          <Section title="havocish leveling">
            <Toggle
              label="Use havocish for leveling"
              checked={on}
              onChange={(v) => setConfig((prev) => ({ ...prev, xp: { ...prev?.xp, enabled: v } }))}
              hint={
                on
                  ? "Members earn XP and levels here, and each chat level makes them a little stronger in the RPG."
                  : "Off: no chat or voice XP, no level-ups, and dailies pay only gold. The RPG still works. Already have a leveling bot? Reward the roles it gives below, and gate items, quests and more by them under Requirements."
              }
            />
          </Section>

          {on && (
            <div role="tablist" className="flex flex-wrap gap-1 border-b border-[var(--border)]">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`-mb-px border-b-2 px-3 py-1.5 text-sm transition-colors ${
                    tab === t.id ? "border-[var(--accent)] text-[var(--gold)]" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {on && <p className="text-sm text-[var(--muted)]">{TABS.find((t) => t.id === shown)!.blurb}</p>}

          {(shown === "earning" || shown === "daily") && (
            <XpBasicsEditor part={shown} value={config.xp} onChange={(next) => setConfig((prev) => ({ ...prev, xp: next }))} />
          )}
          {shown === "levels" && (
            <LevelsEditor
              part="levels"
              value={config.levels}
              onChange={(next) => setConfig((prev) => ({ ...prev, levels: next }))}
              shopItems={config.shop?.items ?? {}}
            />
          )}
          {shown === "rewards" && (
            <>
              {on && (
                <>
                  <LevelsEditor
                    part="rewards"
                    value={config.levels}
                    onChange={(next) => setConfig((prev) => ({ ...prev, levels: next }))}
                    shopItems={config.shop?.items ?? {}}
                  />
                  <XpBasicsEditor part="rewards" value={config.xp} onChange={(next) => setConfig((prev) => ({ ...prev, xp: next }))} />
                </>
              )}
              {/* Outside the switch: role rewards are how another leveling bot's roles pay into the RPG. */}
              <RoleRewardsEditor
                value={config.roleRewards}
                onChange={(next) => setConfig((prev) => ({ ...prev, roleRewards: next }))}
                shopItems={config.shop?.items ?? {}}
              />
            </>
          )}
        </>
      )}
    </ConfigPage>
  );
}
