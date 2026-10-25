import CombatPageClient from "../combat/combatPageClient";

export default async function CombatRulesPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <CombatPageClient guildId={guildId} rules />;
}
