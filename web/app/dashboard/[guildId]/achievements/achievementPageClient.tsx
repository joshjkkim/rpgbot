"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import AchievementsEditor from "@/app/components/achievements/achievementsEditor";
import { skillOptions } from "@/app/components/ui/requirementsField";

export default function AchievementsPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, dirty, error, save } = useGuildConfig(guildId);

  const achievements = config?.achievements ?? null;

  return (
    <ConfigPage
      title="Achievements"
      description="One-off milestones, what unlocks them, and where they are announced."
      loading={loading}
      saving={saving}
      error={error}
      dirty={dirty}
      onSave={() => save(config)}
      collections={config?.collections?.sets}
      rawSection={achievements}
    >
      {config && (
        <AchievementsEditor
          value={achievements}
          shopItems={config.shop?.items ?? {}}
          skills={skillOptions(config)}
          onChange={(next) => setConfig((prev) => ({ ...prev, achievements: next }))}
        />
      )}
    </ConfigPage>
  );
}
