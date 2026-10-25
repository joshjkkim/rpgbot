import type { Client } from "discord.js";
import type { GuildConfig } from "../types/guild.js";
import type { ItemRarity } from "../types/economy.js";
import { bestEffort } from "./bestEffort.js";
import { mentionsFor } from "./mentions.js";
import { shopkeeper, speak } from "./characters.js";

const ORDER: ItemRarity[] = ["poor", "common", "uncommon", "rare", "epic", "legendary"];

/**
 * Posts "✨ @member found 🌠 Starmetal Shard at the Deep Veins!" in the owner's
 * rare-finds channel, for items at or above the chosen rarity. Off until a
 * channel is set. Fights, world bosses, gathering and crafting all call this
 * once the items are already in the bag, so a failed post loses nothing.
 */
export async function announceRareFinds(opts: {
    client: Client;
    config: GuildConfig;
    discordUserId: string;
    items: { itemId: string; quantity: number }[];
    /** "found" or "made". */
    verb: string;
    /** Where: "from 👑 The Hollow King", "at ⛏️ Deep Veins". */
    where: string;
}) {
    const { client, config, discordUserId, items, verb, where } = opts;
    const channelId = config.rareFinds?.channelId;
    if (!channelId) return;
    const min = ORDER.indexOf(config.rareFinds?.minRarity ?? "epic");

    const rare = items
        .map((i) => ({ ...i, def: config.shop?.items?.[i.itemId] }))
        .filter((i) => i.def && ORDER.indexOf(i.def.rarity ?? "common") >= min);
    if (!rare.length) return;

    const names = rare.map((i) => `${i.def!.emoji ?? "✨"} **${i.def!.name}**${i.quantity > 1 ? ` ×${i.quantity}` : ""}`);
    const list = names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.isSendable()) return;
    await bestEffort("rare find announcement", speak(channel, shopkeeper(config), {
        content: `✨ <@${discordUserId}> ${verb} ${list} ${where}!`,
        allowedMentions: await mentionsFor("guildId" in channel ? channel.guildId : "", discordUserId, { users: [discordUserId] }),
    }));
}
