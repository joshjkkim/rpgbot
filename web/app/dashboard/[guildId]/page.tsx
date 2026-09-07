import GuildOverview from "@/app/components/guildOverview";

export default async function GuildPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;

  return <GuildOverview guildId={guildId} />;
}
