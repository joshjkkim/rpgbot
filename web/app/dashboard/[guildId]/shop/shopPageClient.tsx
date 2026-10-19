"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import ShopEconomyEditor from "@/app/components/shop/shopBasicsEditor";

export default function ShopPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, guild, loading, saving, dirty, error, save } = useGuildConfig(guildId);

  const shop = config?.shop ?? null;

  return (
    <ConfigPage
      title="Economy"
      description="The shop: whether it's open, how it's grouped, and gifting. Items themselves are on the Items page."
      loading={loading}
      saving={saving}
      error={error}
      dirty={dirty}
      onSave={() => save(config)}
      rawSection={shop}
    >
      {config && (
        <ShopEconomyEditor
          guildId={guildId}
          serverName={guild.name ?? "Your server"}
          goldIcon={(config.style?.gold as { icon?: string } | undefined)?.icon || "💰"}
          value={shop}
          onChange={(next) => setConfig((prev) => ({ ...prev, shop: next }))}
        />
      )}
    </ConfigPage>
  );
}
