import QuestsPageClient from "./questsPageClient";

export default async function QuestsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <QuestsPageClient guildId={guildId} />;
}
