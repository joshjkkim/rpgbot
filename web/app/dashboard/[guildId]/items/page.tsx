import ItemsPageClient from "./itemsPageClient";

export default async function ItemsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <ItemsPageClient guildId={guildId} />;
}
