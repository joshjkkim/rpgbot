/**
 * The bot's install link.
 *
 * Permissions the bot actually uses:
 *   View Channels          1024
 *   Send Messages          2048
 *   Embed Links           16384   profile cards, level-up and quest embeds
 *   Attach Files          32768   rendered profile images
 *   Read Message History  65536
 *   Manage Roles     268435456    level rewards, achievement roles, temp roles
 */
const PERMISSIONS = 268553216;

/** Empty when DISCORD_CLIENT_ID is not exposed to the client -- callers hide the link. */
export function inviteUrl(guildId?: string): string {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  if (!clientId) return "";

  const params = new URLSearchParams({
    client_id: clientId,
    permissions: String(PERMISSIONS),
    scope: "bot applications.commands",
  });

  // Preselects the server in Discord's install dialog.
  if (guildId) params.set("guild_id", guildId);

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
