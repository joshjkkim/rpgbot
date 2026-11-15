"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import PetsEditor from "@/app/components/pets/petsEditor";

export default function PetsPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, dirty, error, save } = useGuildConfig(guildId);

  return (
    <ConfigPage
      title="Pets"
      description="Pets members hatch or are given, level up, feed and bring into fights."
      loading={loading}
      saving={saving}
      error={error}
      dirty={dirty}
      onSave={() => save(config)}
      rawSection={config?.pets ?? null}
    >
      {config && (
        <PetsEditor
          guildId={guildId}
          value={config.pets}
          onChange={(next) => setConfig((prev) => ({ ...prev, pets: next }))}
          shopItems={config.shop?.items ?? {}}
          moves={config.combat?.moves}
          statuses={config.combat?.statuses}
          stations={config.crafting?.stations ?? {}}
        />
      )}
    </ConfigPage>
  );
}
