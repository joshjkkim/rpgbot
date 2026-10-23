import type { MessageMentionOptions } from "discord.js";
import { getOrCreateDbUser } from "../cache/userService.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { getOrCreateProfile } from "../cache/profileService.js";

/** Pings for roles and @everyone an owner wrote into a message, but not the member. */
const NO_MEMBER_PINGS: MessageMentionOptions = { parse: ["roles", "everyone"] };

/** Whether a member turned on Quiet in /settings: announcements name them without pinging. */
export async function isQuiet(discordGuildId: string, discordUserId: string): Promise<boolean> {
    try {
        const { user } = await getOrCreateDbUser({ discordUserId });
        const { guild } = await getOrCreateGuildConfig({ discordGuildId });
        const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
        return !!profile.settings?.quiet;
    } catch {
        return false;
    }
}

/** Discord's own default: whatever the text mentions pings. */
const DEFAULT_PINGS: MessageMentionOptions = { parse: ["users", "roles", "everyone"] };

/** allowedMentions for a message about a member: `usual`, unless they're Quiet, then no ping for them. */
export async function mentionsFor(discordGuildId: string, discordUserId: string, usual: MessageMentionOptions = DEFAULT_PINGS): Promise<MessageMentionOptions> {
    if (!discordGuildId) return usual;
    return (await isQuiet(discordGuildId, discordUserId)) ? NO_MEMBER_PINGS : usual;
}
