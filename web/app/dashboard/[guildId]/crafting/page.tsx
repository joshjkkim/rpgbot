import CraftingPageClient from "./craftingPageClient";

export default async function CraftingPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <CraftingPageClient guildId={guildId} />;
}
