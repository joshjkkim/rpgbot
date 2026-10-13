import PresetsPageClient from "./presetsPageClient";
import { loadStarterPacks } from "@/app/lib/loadStarterPacks";

// Packs can come from a template server's live config, so never cache this page.
export const dynamic = "force-dynamic";

export default async function PresetsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <PresetsPageClient guildId={guildId} packs={await loadStarterPacks()} />;
}
