"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import CollectionsEditor from "@/app/components/collections/collectionsEditor";

export default function CollectionsPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, dirty, error, save } = useGuildConfig(guildId);

  return (
    <ConfigPage
      title="Collections"
      description="Groups of items to find and enemies to beat, with rewards along the way and unlocks for finishing them."
      loading={loading}
      saving={saving}
      error={error}
      dirty={dirty}
      onSave={() => save(config)}
      rawSection={config?.collections ?? null}
    >
      {config && (
        <CollectionsEditor
          value={config.collections}
          onChange={(next) => setConfig((prev) => ({ ...prev, collections: next }))}
          items={config.shop?.items ?? {}}
          enemies={config.combat?.enemies ?? {}}
        />
      )}
    </ConfigPage>
  );
}
