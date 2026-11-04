import type { Client, Guild } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, PermissionFlagsBits } from "discord.js";
import { setGuildConfig, upsertGuild } from "../db/guilds.js";
import { DEFAULT_GUILD_CONFIG } from "../types/guild.js";
import { dashboardButton, SUPPORT_URL } from "../ui/dashboardLinks.js";

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
 * cannot post there, with how to set up: /setup (or its button, in the
 * server), the dashboard, and the support server.
 */
async function sendWelcome(guild: Guild) {
  // A DM's buttons don't know which server they're for, so there the setup button becomes words.
  const welcome = (inDm: boolean) => {
    const embed = new EmbedBuilder()
      .setColor(0xc4a462)
      .setTitle("⚔️ havocish has arrived")
      .setDescription(
        [
          `Adventurers of **${guild.name}** now earn XP and gold just by chatting. Try \`/profile\` to see your character, \`/daily\` to claim a reward, and \`/help\` for everything else.`,
          "",
          inDm
            ? `**First, set up your world:** run **\`/setup\`** in **${guild.name}**. It takes a minute: pick how fast people level and a world to start in (a ready-made one, one AI writes from your description, or blank). Fights, gathering and the shop start once it's done. Prefer the website? The dashboard has the same setup.`
            : "**Server owner, first set up your world:** run **`/setup`** or press **Set up here**. It takes a minute: pick how fast people level and a world to start in (a ready-made one, one AI writes from your description, or blank). Fights, gathering and the shop start once it's done. Prefer the website? The dashboard has the same setup.",
          "",
          "Stuck or have an idea? Come say hi in the support server.",
        ].join("\n")
      );
    return {
      embeds: [embed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...(inDm ? [] : [new ButtonBuilder().setCustomId("setup:start").setStyle(ButtonStyle.Primary).setLabel("⚡ Set up here")]),
        dashboardButton(guild.id, "setup", "Set up on the dashboard"),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Support server").setURL(SUPPORT_URL),
      )],
    };
  };

  const me = guild.members.me;
  const channel = guild.systemChannel;
  const canPost = channel && me && channel
    .permissionsFor(me)
    .has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);

  if (channel && canPost) {
    await channel.send(welcome(false));
    return;
  }

  const owner = await guild.fetchOwner();
  await owner.send(welcome(true));
}
