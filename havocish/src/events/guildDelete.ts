import type { Client, Guild } from "discord.js";
import { Events } from "discord.js";
import { markGuildRemoved } from "../db/guilds.js";

export function registerGuildDelete(client: Client) {
  client.on(Events.GuildDelete, async (guild: Guild) => {
    // GuildDelete also fires when a guild goes *unavailable* -- a Discord-side
    // outage, with the bot still very much installed. `available: false` is how
    // that case identifies itself, and treating it as a removal would flag
    // every guild caught in an outage as uninstalled.
    if (!guild.available) {
      console.log(`Guild unavailable (Discord outage), not a removal: ${guild.id}`);
      return;
    }

    console.log(`Removed from guild: ${guild.name} (${guild.id})`);

    try {
      // Soft: the config and every member's progression survive, so re-adding
      // the bot picks up where the server left off. See migration 002.
      await markGuildRemoved(guild.id);
      console.log(`Marked guild ${guild.id} as removed`);
    } catch (error) {
      console.error(`Failed to mark guild ${guild.id} as removed:`, error);
    }
  });
}
