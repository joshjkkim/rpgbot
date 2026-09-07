"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import LevelsEditor from "@/app/components/levels/levelsEditor";

export default function LevelsPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, error, save } = useGuildConfig(guildId);

  const levels = config?.levels ?? null;

  return (
    <ConfigPage
      title="Levels"
      description="The progression curve, per-level XP overrides, and what happens when someone levels up."
      loading={loading}
      saving={saving}
      error={error}
      canSave={Boolean(config)}
      onSave={() => save(config)}
      rawSection={levels}
    >
      {config && (
        <LevelsEditor
          value={levels}
          onChange={(next: any) => setConfig((prev: any) => ({ ...prev, levels: next }))}
        />
      )}
    </ConfigPage>
  );
}
