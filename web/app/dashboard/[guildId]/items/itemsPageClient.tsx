"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import ItemsEditor from "@/app/components/items/itemsEditor";
import { Section, SelectField, FieldGrid } from "@/app/components/ui/form";
import { ChannelField } from "@/app/components/ui/pickers";
import { RARITIES } from "@/app/components/shop/itemTooltip";

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
      collections={config?.collections?.sets}
      rawSection={config?.shop?.items ?? null}
    >
      {config && (
        <>
          <Section
            title="Rare-find announcements"
            description={'Post in a channel when someone loots, gathers or crafts an item this rare: "✨ @member found 🌠 Starmetal Shard at Deep Veins!" Off until you pick a channel.'}
            defaultOpen={false}
          >
            <FieldGrid>
              <ChannelField
                label="Announce in"
                value={config.rareFinds?.channelId ?? ""}
                onChange={(v) => setConfig((prev) => ({ ...prev, rareFinds: { ...prev?.rareFinds, channelId: v || null } }))}
                emptyLabel="Off"
              />
              <SelectField
                label="At least this rare"
                value={config.rareFinds?.minRarity ?? "epic"}
                onChange={(v) => setConfig((prev) => ({ ...prev, rareFinds: { ...prev?.rareFinds, minRarity: v } }))}
                options={RARITIES.filter((r) => r.value !== "poor").map((r) => ({ value: r.value, label: `${r.label} and up` }))}
              />
            </FieldGrid>
          </Section>
          <ItemsEditor guildId={guildId} config={config} onChange={(next) => setConfig((prev) => ({ ...prev, shop: next }))} />
        </>
      )}
    </ConfigPage>
  );
}
