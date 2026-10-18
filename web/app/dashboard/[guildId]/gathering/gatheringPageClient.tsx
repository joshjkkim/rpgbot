"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import GatheringEditor from "@/app/components/gathering/gatheringEditor";

export default function GatheringPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, dirty, error, save } = useGuildConfig(guildId);

  const gathering = config?.gathering ?? null;

  return (
    <ConfigPage
      title="Gathering"
      description="Skills your members train with /gather: what each activity is called, which minigame it plays, and what it finds where."
      loading={loading}
      saving={saving}
      error={error}
      dirty={dirty}
      onSave={() => save(config)}
      rawSection={gathering}
    >
      {config && (
        <GatheringEditor
          value={gathering}
          shopItems={config.shop?.items ?? {}}
          onChange={(next) => setConfig((prev) => ({ ...prev, gathering: next }))}
        />
      )}
    </ConfigPage>
  );
}
