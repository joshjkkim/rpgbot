import ShopPageClient from "./shopPageClient";

export default async function ShopPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <ShopPageClient guildId={guildId} />;
}
