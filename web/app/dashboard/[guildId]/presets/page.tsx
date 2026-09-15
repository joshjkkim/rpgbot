import PresetsPageClient from "./presetsPageClient";

export default async function PresetsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <PresetsPageClient guildId={guildId} />;
}
