import type { Client, Guild } from "discord.js";
import { Events } from "discord.js";
import { setGuildConfig, upsertGuild } from "../db/guilds.js";
import { DEFAULT_GUILD_CONFIG } from "../types/guild.js";

export function registerGuildCreate(client: Client) {
  console.log(`Registering guildCreate event handler`);
  client.on(Events.GuildCreate, async (guild: Guild) => {
    console.log(`Guild created: ${guild.name} (${guild.id})`);
    try {
      const dbGuild = await upsertGuild({
        discordGuildId: guild.id,
        name: guild.name,
        iconUrl: guild.iconURL(),
      });

      console.log(JSON.stringify(dbGuild.config));

      if (dbGuild.config === null || Object.keys(dbGuild.config).length === 0) {
        await setGuildConfig(guild.id, DEFAULT_GUILD_CONFIG);
      }


      console.log(`Registered guild ${guild.name} (${guild.id}) in DB`);
    } catch (error) {
      console.error(`Failed to register guild ${guild.name} (${guild.id}) in DB:`, error);
    }
  });
}