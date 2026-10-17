import SetupWizard from "./setupWizard";
import { loadStarterPacks } from "@/app/lib/loadStarterPacks";

export const dynamic = "force-dynamic";

export default async function SetupPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <SetupWizard guildId={guildId} packs={await loadStarterPacks()} />;
}
