import type { Client, Guild } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, EmbedBuilder, Events, PermissionFlagsBits } from "discord.js";
import { setGuildConfig, upsertGuild } from "../db/guilds.js";
import { DEFAULT_GUILD_CONFIG } from "../types/guild.js";
import { dashboardButton } from "../ui/dashboardLinks.js";

export function registerGuildCreate(client: Client) {
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

    // Separate from registration: a closed DM or a locked channel must not
    // look like the install failed.
    try {
      await sendWelcome(guild);
    } catch (error) {
      console.error(`Could not send a welcome message in ${guild.name} (${guild.id}):`, error);
    }
  });
}

/**
 * Greets the server in its system channel, or DMs the owner when the bot
 * cannot post there, with a link to finish setup on the dashboard.
 */
async function sendWelcome(guild: Guild) {
  const embed = new EmbedBuilder()
    .setColor(0xc4a462)
    .setTitle("⚔️ havocish has arrived")
    .setDescription(
      [
        `Adventurers of **${guild.name}** now earn XP and gold just by chatting. Try \`/profile\` to see your character and \`/daily\` to claim a reward.`,
        "",
        "**Server owner:** open the dashboard to stock the shop, add enemies and write quests. A quest log there walks you through it.",
      ].join("\n")
    );
  const payload = {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(dashboardButton(guild.id))],
  };

  const me = guild.members.me;
  const channel = guild.systemChannel;
  const canPost = channel && me && channel
    .permissionsFor(me)
    .has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);

  if (channel && canPost) {
    await channel.send(payload);
    return;
  }

  const owner = await guild.fetchOwner();
  await owner.send(payload);
}
