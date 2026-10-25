"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import AnnouncementsEditor from "@/app/components/announcements/announcementsEditor";

export default function AnnouncementsPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, dirty, error, save } = useGuildConfig(guildId);

  return (
    <ConfigPage
      title="Announcements"
      description="Everything havocish posts for the server to see: what, where, in what words, and who says it."
      loading={loading}
      saving={saving}
      error={error}
      dirty={dirty}
      onSave={() => save(config)}
    >
      {config && <AnnouncementsEditor config={config} setConfig={setConfig} />}
    </ConfigPage>
  );
}
