"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import ItemsEditor from "@/app/components/items/itemsEditor";

export default function ItemsPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, dirty, error, save } = useGuildConfig(guildId);

  return (
    <ConfigPage
      title="Items"
      description="Every item members can own: gear, potions, tools, materials and loot. Each one shows where it comes from and what it's used for."
      loading={loading}
      saving={saving}
      error={error}
      dirty={dirty}
      onSave={() => save(config)}
      rawSection={config?.shop?.items ?? null}
    >
      {config && (
        <ItemsEditor guildId={guildId} config={config} onChange={(next) => setConfig((prev) => ({ ...prev, shop: next }))} />
      )}
    </ConfigPage>
  );
}
