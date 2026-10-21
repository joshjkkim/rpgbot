import LevelingPageClient from "./levelingPageClient";

export default async function LevelingPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <LevelingPageClient guildId={guildId} />;
}
