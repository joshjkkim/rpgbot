"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import { Section, Toggle } from "@/app/components/ui/form";
import XpBasicsEditor from "@/app/components/xp/xpBasicsEditor";
import LevelsEditor from "@/app/components/levels/levelsEditor";
import RoleRewardsEditor from "@/app/components/levels/roleRewardsEditor";

/** XP and levels on one page, behind one switch: off for servers that keep another leveling bot. */
export default function LevelingPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, dirty, error, save } = useGuildConfig(guildId);
  const on = config?.xp?.enabled !== false;

  return (
    <ConfigPage
      title="Leveling"
      description="Chat and voice XP, daily rewards, the level curve, and what happens at each level."
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
                  : "Off: no chat or voice XP, no level-ups, and dailies pay only gold. The RPG still works. Already have a leveling bot? Gate items, quests and more by the roles it gives, under Requirements."
              }
            />
          </Section>
          {on && (
            <>
              <XpBasicsEditor value={config.xp} onChange={(next) => setConfig((prev) => ({ ...prev, xp: next }))} />
              <LevelsEditor
                value={config.levels}
                onChange={(next) => setConfig((prev) => ({ ...prev, levels: next }))}
                shopItems={config.shop?.items ?? {}}
              />
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
    </ConfigPage>
  );
}
