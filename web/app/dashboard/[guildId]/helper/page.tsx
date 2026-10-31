import { helperCallsToday, limitsFor } from "@/app/lib/aiUsage";
import HelperPageClient from "./helperPageClient";

export default async function HelperPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  // Just two counts, so nothing secret if this runs before the layout turns a non-manager away.
  const [used, { helperDaily }] = await Promise.all([helperCallsToday(guildId), limitsFor(guildId)]);
  return <HelperPageClient guildId={guildId} limit={helperDaily} initialLeft={Math.max(0, helperDaily - used)} />;
}
