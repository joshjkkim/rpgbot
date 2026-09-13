"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import LoggingEditor from "@/app/components/logging/loggingEditor";

export default function LoggingPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, dirty, error, save } = useGuildConfig(guildId);

  const logging = config?.logging ?? null;

  return (
    <ConfigPage
      title="Logging"
      description="Which categories of event get recorded, and the channel each one is sent to."
      loading={loading}
      saving={saving}
      error={error}
      dirty={dirty}
      onSave={() => save(config)}
      rawSection={logging}
    >
      {config && (
        <LoggingEditor
          value={logging}
          onChange={(next: any) => setConfig((prev: any) => ({ ...prev, logging: next }))}
        />
      )}
    </ConfigPage>
  );
}
