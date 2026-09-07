"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import XpBasicsEditor from "@/app/components/xp/xpBasicsEditor";

export default function XpPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, error, save } = useGuildConfig(guildId);

  const xp = config?.xp ?? null;

  return (
    <ConfigPage
      title="XP"
      description="How members earn XP from messages and voice, plus daily rewards, streaks and role-based rates."
      loading={loading}
      saving={saving}
      error={error}
      canSave={Boolean(config)}
      onSave={() => save(config)}
      rawSection={xp}
    >
      {config && (
        <XpBasicsEditor
          value={xp}
          onChange={(next: any) => setConfig((prev: any) => ({ ...prev, xp: next }))}
        />
      )}
    </ConfigPage>
  );
}
