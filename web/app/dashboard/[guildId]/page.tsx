import ConfigDisplay from "@/app/components/configDisplay";
import { useGuildConfig } from "@/app/hooks/useGuildConfig";

export default async function GuildPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;

  return (
    <main style={{ padding: 24 }}>
      <h1>Guild Dashboard</h1>
      <p>Guild ID: {guildId}</p>

    </main>
  );
}
