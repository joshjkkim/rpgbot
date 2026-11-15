import PetsPageClient from "./petsPageClient";

export default async function PetsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <PetsPageClient guildId={guildId} />;
}
