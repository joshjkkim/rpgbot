import AnnouncementsPageClient from "./announcementsPageClient";

export default async function AnnouncementsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <AnnouncementsPageClient guildId={guildId} />;
}
