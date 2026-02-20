import LevelsPageClient from "./levelsPageClient";

export default async function LevelsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <LevelsPageClient guildId={guildId} />;
}
