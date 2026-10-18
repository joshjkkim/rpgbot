import GatheringPageClient from "./gatheringPageClient";

export default async function GatheringPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <GatheringPageClient guildId={guildId} />;
}
