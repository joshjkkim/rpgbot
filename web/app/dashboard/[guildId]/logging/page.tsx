import LoggingPageClient from "./loggingPageClient";

export default async function LoggingPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <LoggingPageClient guildId={guildId} />;
}
