"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import CharactersEditor from "@/app/components/characters/charactersEditor";

export default function CharactersPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, dirty, error, save } = useGuildConfig(guildId);

  return (
    <ConfigPage
      title="Characters"
      description="The people and creatures of your world. They post under their own name and picture: villains arriving, quest givers, the shopkeeper."
      loading={loading}
      saving={saving}
      error={error}
      dirty={dirty}
      onSave={() => save(config)}
      rawSection={config?.characters ?? null}
    >
      {config && (
        <CharactersEditor
          guildId={guildId}
          value={config.characters}
          onChange={(next) => setConfig((prev) => ({ ...prev, characters: next }))}
          enemies={config.combat?.enemies ?? {}}
          quests={config.quests?.quests ?? {}}
        />
      )}
    </ConfigPage>
  );
}
