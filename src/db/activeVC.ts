import { getGuildConfig } from "./guilds.js";
import { logAndBroadcastEvent } from "./events.js";
import { addMessageXp, updateUserStats } from "./userGuildProfiles.js";
import { upsertUser } from "./users.js";
import type { VoiceState } from "discord.js";
import { refreshTempRolesForMember } from "../player/roles.js";
import { getOrCreateProfile } from "../cache/profileService.js";

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

export async function onLeaveVoiceChannel(voiceState: VoiceState, guildId: string, userId: string, roleIds: string[]): Promise<ActiveVCSessions | null> {
    const key = getActiveVCSessionKey(guildId, userId);
    const session = activeVCSessions.get(key) ?? null;
    if (!session) return null;

    const user = await upsertUser({
        discordUserId: userId,
        username: "unknown",
        avatarUrl: "",
    });

    const { guild, config } = await getGuildConfig(guildId);

    let { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });

    if (voiceState.member) {
        profile = await refreshTempRolesForMember(voiceState.member, profile);
    }

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

        const { gave } = await addMessageXp({
            userId: user.id,
            guildId: guild.id,
            channelId: session.channelId,
            config,
            roleIds,
            amount: xpAmount,
        });

        await updateUserStats(user.id, guild.id, {
            xpFromVC: (profile.user_stats?.xpFromVC ?? 0) + xpAmount,
            timeSpentInVC: (profile.user_stats?.timeSpentInVC ?? 0) + durationMinutes * 60,
        }); 

        if (gave) {
            await logAndBroadcastEvent(voiceState.guild, {
                guildId: guild.id,
                userId: user.id,
                category: "xp",
                eventType: "vcXp",
                xpDelta: xpAmount,
                source: `Voice Channel (${session.channelId})`,
                metaData: { actorDiscordId: userId, channelId: session.channelId, durationMinutes },
                timestamp: new Date(),
            }, config);
        }
    }

    return session;

}