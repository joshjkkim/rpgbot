import HelperPageClient from "./helperPageClient";

export default async function HelperPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <HelperPageClient guildId={guildId} />;
}
