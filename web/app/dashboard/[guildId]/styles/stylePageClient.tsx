"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import StyleBasicsEditor from "@/app/components/styles/styleBasicsEditor";

export default function StylePageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, error, save } = useGuildConfig(guildId);

  const style = config?.style ?? null;

  return (
    <ConfigPage
      title="Style"
      description="Colours, profile card template, and what your server calls its XP and currency."
      loading={loading}
      saving={saving}
      error={error}
      canSave={Boolean(config)}
      onSave={() => save(config)}
      rawSection={style}
    >
      {config && (
        <StyleBasicsEditor
          value={style}
          onChange={(next: any) => setConfig((prev: any) => ({ ...prev, style: next }))}
        />
      )}
    </ConfigPage>
  );
}
