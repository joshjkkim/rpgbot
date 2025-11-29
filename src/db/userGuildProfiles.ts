import { query } from "./index.js";
import type { QueryResultRow } from "pg";
import type { GuildConfig, shopItemAction } from "./guilds.js";
import { calculateLevelFromXp } from "../leveling/levels.js";
import { logAndBroadcastEvent } from "./events.js";
import { getOrCreateProfile } from "../cache/profileService.js";
import type { Client, GuildMember } from "discord.js";
import { profileKey } from "../cache/caches.js";
import { userGuildProfileCache } from "../cache/caches.js";
import { refreshTempRolesForMember } from "../player/roles.js";
export interface item {
    id: string;
    name: string;
    emoji?: string;
    description?: string;
    quantity: number;
}

export interface TempRoleState {
    expiresAt: string; // ISO date string
    source?: "item" | "command";
    sourceId?: string;
}
export interface DbUserGuildProfile extends QueryResultRow {
    id: number;
    user_id: number;
    guild_id: number;
    xp: string;              // bigint comes back as string
    level: number;
    gold: string;
    streak_count: number;
    last_daily_at: string | null;
    last_message_at: string | null;
    inventory: Record<string, item>;
    temp_roles: Record<string, TempRoleState>;
}

type XpArgs = {
    client?: Client;
    member?: GuildMember;
    userId: number;
    guildId: number;
    discordUserId?: string;
    discordGuildId?: string;
    channelId?: string;
    config: GuildConfig;
    roleIds?: string[];
    amount?: number;
}

type UpsertArgs = {
    userId: number;
    guildId: number;
};

export async function upsertUserGuildProfile(args: UpsertArgs): Promise<DbUserGuildProfile> {
    const { userId, guildId } = args;

    const result = await query<DbUserGuildProfile>(
        `
        INSERT INTO user_guild_profiles (user_id, guild_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, guild_id)
        DO UPDATE SET
        updated_at = NOW()
        RETURNING *;
        `,
        [userId, guildId]
    );

        if (!result.rows[0]) {
            throw new Error("Failed to upsert user guild profile");
        }

    return result.rows[0];
}

export async function getUserGuildProfile(userId: number, guildId: number): Promise<DbUserGuildProfile | null> {
    const result = await query<DbUserGuildProfile>(
        `
        SELECT * FROM user_guild_profiles
        WHERE user_id = $1 AND guild_id = $2;
        `,
        [userId, guildId]
    );

    return result.rows[0] ?? null;
}

export async function addMessageXp(args: XpArgs): Promise<{profile: DbUserGuildProfile, gave: boolean, levelUp: boolean}> {
    const { userId, guildId, channelId, config } = args;


    let { profile } = await getOrCreateProfile({userId, guildId});

    if(args.member) {
        profile = await refreshTempRolesForMember(args.member, profile);
    }
    

    if (!profile) {
        throw new Error("User guild profile not found");
    }
    let xpAmount = 0;

    if(args.amount == undefined) {
        xpAmount = config.xp.basePerMessage;
        xpAmount += config.xp.xpChannelIds[channelId ?? ""]?.flatBonus ?? 0;
        let cooldownSeconds = config.xp.xpChannelIds[channelId ?? ""]?.cooldownOverride ?? config.xp.xpMessageCooldown;
        xpAmount = Math.floor(xpAmount * (config.xp.xpChannelIds[channelId ?? ""]?.multiplier ?? 1));

        for (const roleId of args.roleIds || []) {
            const roleConfig = config.xp.roleXp[roleId];
            if (roleConfig) {
                if (roleConfig.extraXp) {
                    xpAmount += roleConfig.extraXp;
                }
                if (roleConfig.multiplier) {
                    xpAmount = Math.floor(xpAmount * roleConfig.multiplier);
                }
                if (roleConfig.cooldownSeconds) {
                    cooldownSeconds = Math.min(cooldownSeconds, roleConfig.cooldownSeconds);
                }
            }
        }

        const lastMessageAt = profile?.last_message_at;
        if (lastMessageAt && cooldownSeconds > 0) {
            const now = new Date();
            const diffTime = now.getTime() - new Date(lastMessageAt).getTime();
            const diffSeconds = diffTime / 1000;

            if (diffSeconds < cooldownSeconds) {
                return { profile, gave: false, levelUp: false};
            }
        }
    } else {
        xpAmount = args.amount!;
    }

    const result = await query<DbUserGuildProfile>(
        `
        UPDATE user_guild_profiles
        SET xp = xp + $3,
            last_message_at = NOW(),
            updated_at = NOW()
        WHERE user_id = $1 AND guild_id = $2
        RETURNING *;
        `,
        [userId, guildId, xpAmount]
    );

    let updatedProfile = result.rows[0];

    if (!updatedProfile) {
        throw new Error("Failed to add message XP");
    }

    const xpNumber = Number(updatedProfile.xp);
    const newLevel = calculateLevelFromXp(xpNumber, config);
    let levelUp = false;

    if (newLevel > updatedProfile.level) {
        const lvlRes = await query<DbUserGuildProfile>(
            `
            UPDATE user_guild_profiles
            SET level = $3,
                updated_at = NOW()
            WHERE user_id = $1 AND guild_id = $2
            RETURNING *;
            `,
            [userId, guildId, newLevel]
        );

        if (!lvlRes.rows[0]) {
            throw new Error("Failed to update user level");
        }

        updatedProfile = lvlRes.rows[0];
        levelUp = true;
    }

    const key = profileKey(guildId, userId);
    userGuildProfileCache.set(key, {
        profile: updatedProfile,
        lastLoaded: Date.now(),
    });

    if (args.client && config.logging.enabled) {
        const guild = args.client.guilds.cache.get(String(args.discordGuildId)) ?? null;
        if (guild) {
            await logAndBroadcastEvent(guild, {
                guildId,
                userId,
                category: "xp",
                eventType: "messageXp",
                xpDelta: xpAmount,
                source: `Message (${channelId ?? "unknown channel"})`,
                metaData: { actorDiscordId: args.discordUserId ?? null },
                timestamp: new Date(),
            }, config);
        }
    }

    return { profile: updatedProfile, gave: true, levelUp };
}

export async function grantDailyXp(args: XpArgs): Promise<{profile: DbUserGuildProfile, granted: boolean, rewardXp?: number, rewardGold?: number, levelUp: boolean, 
                                                            streakReward?: {streak: number; xpBonus: number; goldBonus: number; channelId?: string; message?: string;}, increasedStreak?: boolean }> {
    const { userId, guildId, config, roleIds } = args;

    let { profile } = await getOrCreateProfile({userId, guildId});

    if (args.member) {
        profile = await refreshTempRolesForMember(args.member, profile);
    }

    const now = new Date();
    const lastDaily = profile.last_daily_at ? new Date(profile.last_daily_at) : null;

    const toDateString = (date: Date) => date.toISOString().slice(0, 10);

    if (lastDaily && toDateString(lastDaily) === toDateString(now)) {
        return { profile, granted: false, levelUp: false };
    }

    let newStreak = 1;
    let increasedStreak = false;

    if(lastDaily) {
        const diffTime = now.getTime() - lastDaily.getTime();
        const diffHours = diffTime / (1000 * 60 * 60);

        if (diffHours < 24) {
            return { profile, granted: false, levelUp: false };
        }

        if (diffHours >= 24 && diffHours < 48) {
            newStreak = profile.streak_count + 1;
        } else {
            newStreak = 1;
        }
    } else {
        newStreak = 1;  
    }

    let baseXp = config.xp.dailyXp;
    let baseGold = config.xp.dailyGold;
    let extraXp = 0;
    let extraGold = 0;

    let streakMult = (config.xp.streakMultiplier ?? 0);

    for (const roleId of roleIds ?? []) {
        const r = config.xp.roleDailyBonus[roleId];
        if (!r) continue;
        extraXp += r.xpBonus ?? 0;
        streakMult += r.multiplier ? r.multiplier : 0;
        extraGold += r.goldBonus ?? 0;
     }
    
    const bonusFactor = 1 + streakMult * (newStreak - 1);

    let streakRewardInfo: {
        streak: number;
        xpBonus: number;
        goldBonus: number;
        channelId?: string;
        message?: string;
    } | null = null;

    if (newStreak !== profile.streak_count) {
        const reward = config.xp.streakRewards[newStreak];
        if (reward) {
            const xpBonus = reward.xpBonus ?? 0;
            const goldBonus = reward.goldBonus ?? 0;

            extraXp += xpBonus;
            extraGold += goldBonus;

            streakRewardInfo = {
                streak: newStreak,
                xpBonus,
                goldBonus,
                ...(reward.channelId && { channelId: reward.channelId }),
                ...(reward.message && { message: reward.message }),
            };
        }
    }

    let rewardXp = Math.floor((baseXp + extraXp) * bonusFactor);
    let rewardGold = Math.floor((baseGold + extraGold) * bonusFactor);

    const result = await query<DbUserGuildProfile>(
        `
        UPDATE user_guild_profiles
        SET xp = xp + $3,
            gold = gold + $4,
            streak_count = $5,
            last_daily_at = NOW(),
            updated_at = NOW()
        WHERE user_id = $1 AND guild_id = $2
        RETURNING *;
        `,
        [userId, guildId, rewardXp, rewardGold, newStreak]
    );

    let updated = result.rows[0];


    if (!updated) {
        throw new Error("Failed to grant daily XP");
    }

    let levelUp = false;
    const xpNumber = Number(updated.xp);
    const newLevel = calculateLevelFromXp(xpNumber, config);
    if (newLevel > updated.level) {
        const lvlRes = await query<DbUserGuildProfile>(
            `
            UPDATE user_guild_profiles
            SET level = $3,
                updated_at = NOW()
            WHERE user_id = $1 AND guild_id = $2
            RETURNING *;
            `,
            [userId, guildId, newLevel]
        );

        if (!lvlRes.rows[0]) {
            throw new Error("Failed to update user level after daily XP");
        }

        levelUp = true;
        updated = lvlRes.rows[0];
    }   

    const key = profileKey(guildId, userId);
    userGuildProfileCache.set(key, {
        profile: updated,
        lastLoaded: Date.now(),
    });

    if (newStreak > profile.streak_count) {
            increasedStreak = true;
            const guild = args.client?.guilds.cache.get(String(args.discordGuildId)) ?? null; 
            await logAndBroadcastEvent(
                guild
                , {
                    guildId,
                    userId,
                    category: "xp",
                    eventType: "streakIncrement",
                    xpDelta: 0,
                    goldDelta: 0,
                    source: `Streak increased to ${newStreak}`,
                    metaData: { actorDiscordId: args.discordUserId ?? null },
                    timestamp: new Date(),
                }, config);
        } else if (newStreak == 1 && profile.streak_count > 1) {
            const guild = args.client?.guilds.cache.get(String(args.discordGuildId)) ?? null; 
            await logAndBroadcastEvent(
                guild
                , {
                    guildId,
                    userId,
                    category: "xp",
                    eventType: "streakReset",
                    xpDelta: 0,
                    goldDelta: 0,
                    source: `Streak reset from ${profile.streak_count} to 1`,
                    metaData: { actorDiscordId: args.discordUserId ?? null },
                    timestamp: new Date(),
                }, config);
        }

    if (config.logging.enabled) {
        const guild = args.client?.guilds.cache.get(String(args.discordGuildId)) ?? null; 
        await logAndBroadcastEvent(guild, {
            guildId,
            userId,
            category: "xp",
            eventType: "grantDaily",
            xpDelta: rewardXp,
            goldDelta: rewardGold,
            source: `autoMessageDaily`,
            metaData: { actorDiscordId: args.discordUserId ?? null },
            timestamp: new Date(),
        }, config);
    }
    

    return { profile: updated, granted: true, rewardXp, rewardGold, levelUp, ...(streakRewardInfo && { streakReward: streakRewardInfo }), increasedStreak };
}
