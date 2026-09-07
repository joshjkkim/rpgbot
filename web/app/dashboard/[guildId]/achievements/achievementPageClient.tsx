"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import AchievementsEditor from "@/app/components/achievements/achievementsEditor";

export default function AchievementsPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, error, save } = useGuildConfig(guildId);

  const achievements = config?.achievements ?? null;

  return (
    <ConfigPage
      title="Achievements"
      description="One-off milestones, what unlocks them, and where they are announced."
      loading={loading}
      saving={saving}
      error={error}
      canSave={Boolean(config)}
      onSave={() => save(config)}
      rawSection={achievements}
    >
      {config && (
        <AchievementsEditor
          value={achievements}
          onChange={(next: any) => setConfig((prev: any) => ({ ...prev, achievements: next }))}
        />
      )}
    </ConfigPage>
  );
}
