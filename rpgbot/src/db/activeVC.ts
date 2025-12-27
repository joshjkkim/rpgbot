import { getGuildConfig } from "./guilds.js";
import { logAndBroadcastEvent } from "./events.js";
import { addMessageXp } from "./userGuildProfiles.js";
import { upsertUser } from "./users.js";
import type { VoiceState } from "discord.js";
import { refreshTempRolesForMember } from "../player/roles.js";
import { getOrCreateProfile } from "../cache/profileService.js";
import type { PendingProfileChanges } from "../types/cache.js";
import { applyAchievementSideEffects, runAchievementPipeline } from "../player/achievements.js";
import { profileKey, userGuildProfileCache } from "../cache/caches.js";
import { calculateLevelFromXp } from "../leveling/levels.js";

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
            client: voiceState.guild?.client,
            member: voiceState.member ?? null,
            discordGuildId: voiceState.guild?.id,
            discordUserId: userId,
            userId: user.id,
            guildId: guild.id,
            channelId: session.channelId,
            config,
            roleIds,
            amount: xpAmount,
        });

        const cached2 = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
        let profile2 = cached2.profile;
        let pending2: PendingProfileChanges = cached2.pendingChanges ?? ({} as PendingProfileChanges);

        const stats2 = profile2.user_stats ?? ({} as any);
        stats2.xpFromVC = (stats2.xpFromVC ?? 0) + xpAmount;
        stats2.timeSpentInVC = (stats2.timeSpentInVC ?? 0) + durationMinutes * 60;
        profile2.user_stats = stats2;

        pending2 = { ...pending2, user_stats: profile2.user_stats };

        const ach2 = await runAchievementPipeline({ profile: profile2, pending: pending2, config });
        profile2 = ach2.profile;
        pending2 = ach2.pending;

        const xpAfter = Number(profile2.xp ?? "0");
        const levelAfter = calculateLevelFromXp(xpAfter, config);
        if (levelAfter > profile2.level) {
            profile2.level = levelAfter;
            pending2.level = profile2.level;
        }

        userGuildProfileCache.set(profileKey(guild.id, user.id), {
            profile: profile2,
            pendingChanges: Object.keys(pending2).length ? pending2 : undefined,
            dirty: true,
            lastWroteToDb: cached2.lastWroteToDb,
            lastLoaded: Date.now(),
        });
        
        const hasDiscordCtx = Boolean(voiceState.guild?.client && voiceState.guild.id && userId);
        const hasEffects =
        ach2.unlocked.length > 0 ||
        Boolean(ach2.rewards?.messages?.length) ||
        Boolean(ach2.rewards?.grantedRoles?.length);

        if (hasDiscordCtx && hasEffects) {
            await applyAchievementSideEffects({
                client: voiceState.guild.client,
                discordGuildId: voiceState.guild.id,
                discordUserId: userId,
                member: voiceState.member ?? null,
                channelIdHint: session.channelId,   
                config,
                unlocked: ach2.unlocked,
                rewards: ach2.rewards
                ? { grantedRoles: ach2.rewards.grantedRoles, messages: ach2.rewards.messages }
                : null,
            });
        }

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