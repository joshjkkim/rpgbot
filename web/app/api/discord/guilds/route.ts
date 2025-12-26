import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/auth";
import { dbQuery } from "@/app/lib/db";

type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const accessToken = (session as any)?.accessToken as string | undefined;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const res = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: "discord_error" }, { status: 500 });
  }

  const guilds = await res.json();
  const ownerGuilds = guilds.filter((guild: DiscordGuild) => guild.owner);
  const guildIds = ownerGuilds.map((g: DiscordGuild) => g.id);

  const botInstalledRes = guildIds.length
    ? await dbQuery<{ discord_guild_id: string }>(
        `SELECT discord_guild_id
        FROM guilds
        WHERE discord_guild_id = ANY($1::bigint[])`,
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
