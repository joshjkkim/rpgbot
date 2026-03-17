import CombatPageClient from "./combatPageClient";

export default async function CombatPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <CombatPageClient guildId={guildId} />;
}
