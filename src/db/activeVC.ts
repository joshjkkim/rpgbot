import { getGuildConfig } from "./guilds.js";
import { query } from "./index.js";
import { addMessageXp } from "./userGuildProfiles.js";
import { upsertUser } from "./users.js";

export interface ActiveVCSessions {
    guildId: string;
    userId: string;
    channelId: string;
    joinedAt: Date;
}

export const activeVCSessions = new Map<string, ActiveVCSessions>();

export function getActiveVCSessionKey(guildId: string, userId: string): string {
    return `${guildId}-${userId}`;
}

export function parseActiveVCSessionKey(key: string): { guildId: string; userId: string } {
    const [guildId, userId] = key.split("-");
    return { guildId: guildId!, userId: userId! };
}

export async function onLeaveVoiceChannel(guildId: string, userId: string, roleIds: string[]): Promise<ActiveVCSessions | null> {
    const key = getActiveVCSessionKey(guildId, userId);
    const session = activeVCSessions.get(key) ?? null;
    if (!session) return null;

    const user = await upsertUser({
        discordUserId: userId,
        username: "unknown",
        avatarUrl: "",
    });

    const { guild, config } = await getGuildConfig(guildId);

    if (config.xp.vc.channelIds[session.channelId]?.enabled === false) return null;

    const now = new Date();
    const durationMs = now.getTime() - session.joinedAt.getTime();
    const durationMinutes = Math.floor(durationMs / 60000);

    if (durationMinutes >= config.xp.vc.minMinutesForXp) {
        let xpAmount = config.xp.vc.basePerMinute * durationMinutes;
        xpAmount += config.xp.vc.channelIds[session.channelId]?.flatBonus ?? 0;
        xpAmount = Math.floor(xpAmount * (config.xp.vc.channelIds[session.channelId]?.multiplier ?? 1));

        for (const roleId of roleIds) {
            const roleConfig = config.xp.vc.roleXpBonus[roleId];
            if (roleConfig) {
                if (roleConfig.extraXp) {
                    xpAmount += roleConfig.extraXp;
                }
                if (roleConfig.multiplier) {
                    xpAmount = Math.floor(xpAmount * roleConfig.multiplier);
                }
            }
        }

        await addMessageXp({
            userId: user.id,
            guildId: guild.id,
            channelId: session.channelId,
            config,
            roleIds,
            amount: xpAmount,
        });
    }

    return session;

}