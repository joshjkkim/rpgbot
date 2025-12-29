import StylePageClient from "./stylePageClient";

export default async function StylePage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <StylePageClient guildId={guildId} />;
}
