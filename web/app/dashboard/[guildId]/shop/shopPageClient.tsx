"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import ShopEconomyEditor from "@/app/components/shop/shopBasicsEditor";

export default function ShopPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, error, save } = useGuildConfig(guildId);

  const shop = config?.shop ?? null;

  return (
    <ConfigPage
      title="Economy"
      description="Shop categories and items, what they cost, who can buy them, and what they do when used."
      loading={loading}
      saving={saving}
      error={error}
      canSave={Boolean(config)}
      onSave={() => save(config)}
      rawSection={shop}
    >
      {config && (
        <ShopEconomyEditor
          value={shop}
          onChange={(next: any) => setConfig((prev: any) => ({ ...prev, shop: next }))}
        />
      )}
    </ConfigPage>
  );
}
