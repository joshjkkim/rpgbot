import { NextResponse } from "next/server";
import { fetchUserGuilds, type DiscordGuild } from "@/app/lib/discord";
import { dbQuery } from "@/app/lib/db";

export async function GET() {
  const result = await fetchUserGuilds();

  if (!result.ok) {
    // 401 tells the client to send the user back through sign-in; 503 tells it
    // to try again later. Reporting both as 500 made an expired login -- which
    // every user hits after a week -- indistinguishable from a Discord outage.
    return NextResponse.json(
      { error: result.status === 401 ? "unauthorized" : "discord_unavailable" },
      { status: result.status }
    );
  }

  const ownerGuilds = result.guilds.filter((guild) => guild.owner);
  const guildIds = ownerGuilds.map((g) => g.id);

  const botInstalledRes = guildIds.length
    ? await dbQuery<{ discord_guild_id: string }>(
        // `removed_at IS NULL` matters: guild rows are kept after the bot is
        // kicked so nobody loses their progression, so a row's existence alone
        // no longer means the bot is in the server. Without this the dashboard
        // offers "Configure" for a server the bot has left.
        `SELECT discord_guild_id
        FROM guilds
        WHERE discord_guild_id = ANY($1::bigint[])
          AND removed_at IS NULL`,
        [guildIds]
      )
    : { rows: [] as { discord_guild_id: string }[] };

  const installedSet = new Set(botInstalledRes.rows.map(r => r.discord_guild_id));

  const out = ownerGuilds.map((guild: DiscordGuild) => ({
    ...guild,
    installed: installedSet.has(guild.id),
  }));

  return NextResponse.json(out);
}
