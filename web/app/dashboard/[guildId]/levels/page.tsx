import { redirect } from "next/navigation";

/** XP and Levels are one page now; old links (the bot's buttons, bookmarks) land there. */
export default async function OldPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  redirect(`/dashboard/${guildId}/leveling`);
}
