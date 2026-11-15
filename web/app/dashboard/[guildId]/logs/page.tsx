import LogsPageClient from "./logsPageClient";

export default async function LogsPage({ params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;

  return (
    <div>
      <h1>Logs for Guild {guildId}</h1>
      <LogsPageClient guildId={guildId} />
    </div>
  );
}
