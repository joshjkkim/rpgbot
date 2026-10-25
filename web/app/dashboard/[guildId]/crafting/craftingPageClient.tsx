"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import CraftingEditor from "@/app/components/crafting/craftingEditor";
import { skillOptions } from "@/app/components/ui/requirementsField";
import { itemCreator } from "@/app/lib/newItem";

export default function CraftingPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, dirty, error, save } = useGuildConfig(guildId);
  const crafting = config?.crafting ?? null;

  return (
    <ConfigPage
      title="Crafting"
      description="Stations members craft at with /craft, the recipes at each, and what a lucky craft can turn into."
      loading={loading}
      saving={saving}
      error={error}
      dirty={dirty}
      onSave={() => save(config)}
      onCreateItem={itemCreator(config, setConfig)}
      collections={config?.collections?.sets}
      rawSection={crafting}
    >
      {config && (
        <CraftingEditor
          skills={skillOptions(config)}
          value={crafting}
          shopItems={config.shop?.items ?? {}}
          onChange={(next) => setConfig((prev) => ({ ...prev, crafting: next }))}
        />
      )}
    </ConfigPage>
  );
}
