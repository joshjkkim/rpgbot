import type { AttachmentBuilder, User } from "discord.js";
import type { GuildConfig } from "../types/guild.js";
import { renderLevelUpBanner } from "./canvas/levelUpBanner.js";
import { bestEffort } from "./bestEffort.js";
import { mentionsFor } from "./mentions.js";
import { announcer, speak } from "./characters.js";

/**
 * The level-up banner for the RPG: a card for every Combat level, and for a
 * skill every 10th level and at its cap, so skills that level often don't spam.
 * Owners switch each kind off on the Style page, and can have a copy posted in
 * a channel too. Null when there's nothing to show, or the card failed: the
 * reward is already given, so a card never blocks it.
 */
export async function rpgLevelUpCard(opts: {
    config: GuildConfig;
    kind: "combat" | "skills";
    user: User;
    /** Combat, or the skill's name. */
    label: string;
    before: number;
    after: number;
}): Promise<AttachmentBuilder | null> {
    const { config, kind, user, label, before, after } = opts;
    if (after <= before || config.style.levelUpCards?.[kind] === false) return null;
    if (kind === "skills") {
        const cap = config.gathering?.skill?.maxLevel ?? 50;
        const milestone = Math.floor(after / 10) > Math.floor(before / 10);
        if (!milestone && after < cap) return null;
    }
    const render = renderLevelUpBanner({
        name: user.displayName,
        avatarUrl: user.displayAvatarURL({ extension: "png", size: 256 }),
        level: after,
        accent: config.style.mainThemeColor,
        label,
    });
    // A bad avatar image can leave the render pending forever; the fight result must not wait on it.
    const timeout = new Promise<null>((resolve) => setTimeout(resolve, 5000, null).unref());
    const card = await Promise.race([render, timeout]).catch((err) => {
        console.error("Failed to render RPG level-up card:", err);
        return null;
    });

    const channelId = config.style.levelUpCards?.channelId;
    if (card && channelId) {
        const channel = await user.client.channels.fetch(channelId).catch(() => null);
        if (channel?.isTextBased() && channel.isSendable()) {
            await bestEffort("level-up announcement", speak(channel, announcer(config), {
                content: `🎉 <@${user.id}> reached **${label} ${after}**!`,
                files: [card],
                allowedMentions: await mentionsFor("guildId" in channel ? channel.guildId : "", user.id, { users: [user.id] }),
            }));
        }
    }
    return card;
}
