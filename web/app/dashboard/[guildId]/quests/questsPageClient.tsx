"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import QuestsBasicsEditor from "@/app/components/quests/questsBasicEditor";
import { skillOptions } from "@/app/components/ui/requirementsField";

export default function QuestsPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, dirty, error, save } = useGuildConfig(guildId);

  const quests = config?.quests ?? null;

  return (
    <ConfigPage
      title="Quests"
      description="Objectives members can take on, how progress is tracked, and what completing one pays out."
      loading={loading}
      saving={saving}
      error={error}
      dirty={dirty}
      onSave={() => save(config)}
      collections={config?.collections?.sets}
      rawSection={quests}
    >
      {config && (
        <QuestsBasicsEditor
          skills={skillOptions(config)}
          value={quests}
          shopItems={config.shop?.items ?? {}}
          enemies={config.combat?.enemies ?? {}}
          onChange={(next) => setConfig((prev) => ({ ...prev, quests: next }))}
        />
      )}
    </ConfigPage>
  );
}
