import AchievementsPageClient from "./achievementPageClient";

export default async function AchievementsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <AchievementsPageClient guildId={guildId} />;
}
