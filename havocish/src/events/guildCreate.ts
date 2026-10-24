import type { Client, Guild } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, PermissionFlagsBits } from "discord.js";
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
        `Adventurers of **${guild.name}** now earn XP and gold just by chatting. Try \`/profile\` to see your character, \`/daily\` to claim a reward, and \`/help\` for everything else.`,
        "",
        "**Server owner:** press **Set up here** to choose how fast people level and what world to start in (a ready-made one, or blank to build your own). It takes a minute, right here in Discord. Prefer the website? The dashboard has the same setup, and everything after it.",
      ].join("\n")
    );
  const payload = {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("setup:start").setStyle(ButtonStyle.Primary).setLabel("⚡ Set up here"),
      dashboardButton(guild.id, "setup", "Set up on the dashboard"),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Support server").setURL("https://discord.gg/9dV5NnV9tq"),
    )],
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
