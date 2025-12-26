import XpPageClient from "./xpPageClient";

export default async function XpPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <XpPageClient guildId={guildId} />;
}
