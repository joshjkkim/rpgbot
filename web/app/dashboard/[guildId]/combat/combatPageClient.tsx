"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import CombatEditor from "@/app/components/combat/combatEditor";

export default function CombatPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, error, save } = useGuildConfig(guildId);

  const combat = config?.combat ?? null;

  return (
    <ConfigPage
      title="Combat"
      description="Base stats and per-level growth, the enemies members can fight, and what losing costs them."
      loading={loading}
      saving={saving}
      error={error}
      canSave={Boolean(config)}
      onSave={() => save(config)}
      rawSection={combat}
    >
      {config && (
        <CombatEditor
          value={combat}
          onChange={(next: any) => setConfig((prev: any) => ({ ...prev, combat: next }))}
        />
      )}
    </ConfigPage>
  );
}
