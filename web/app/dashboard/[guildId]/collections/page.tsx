import CollectionsPageClient from "./collectionsPageClient";

export default async function CollectionsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <CollectionsPageClient guildId={guildId} />;
}
