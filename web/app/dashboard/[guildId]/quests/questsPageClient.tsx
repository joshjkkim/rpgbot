"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import QuestsBasicsEditor from "@/app/components/quests/questsBasicEditor";

export default function QuestsPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, error, save } = useGuildConfig(guildId);

  const quests = config?.quests ?? null;

  return (
    <ConfigPage
      title="Quests"
      description="Objectives members can take on, how progress is tracked, and what completing one pays out."
      loading={loading}
      saving={saving}
      error={error}
      canSave={Boolean(config)}
      onSave={() => save(config)}
      rawSection={quests}
    >
      {config && (
        <QuestsBasicsEditor
          value={quests}
          onChange={(next: any) => setConfig((prev: any) => ({ ...prev, quests: next }))}
        />
      )}
    </ConfigPage>
  );
}
