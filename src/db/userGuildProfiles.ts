import { query } from "./index.js";
import type { QueryResultRow } from "pg";
import type { GuildConfig } from "./guilds.js";
import { calculateLevelFromXp } from "../leveling/levels.js";

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
    titles: string[];   // array of title IDs
}

type XpArgs = {
    userId: number;
    guildId: number;
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

    const res = await query<DbUserGuildProfile>(
        `
        SELECT * FROM user_guild_profiles
        WHERE user_id = $1 AND guild_id = $2;
        `,
        [userId, guildId]
    );

    const profile = res.rows[0]

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

    const updatedProfile = result.rows[0];

    if (!updatedProfile) {
        throw new Error("Failed to add message XP");
    }

    const xpNumber = Number(updatedProfile.xp);
    const newLevel = calculateLevelFromXp(xpNumber, config);

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

        return { profile: lvlRes.rows[0], gave: true, levelUp: true };
    }

    return { profile: updatedProfile, gave: true, levelUp: false };
}

export async function grantDailyXp(args: XpArgs): Promise<{profile: DbUserGuildProfile, granted: boolean, rewardXp?: number, rewardGold?: number, levelUp: boolean, 
                                                            streakReward?: {streak: number; xpBonus: number; goldBonus: number; channelId?: string; message?: string;}, increasedStreak?: boolean }> {
    const { userId, guildId, config, roleIds } = args;

    const existing = await query<DbUserGuildProfile>(
        `
        SELECT * FROM user_guild_profiles
        WHERE user_id = $1 AND guild_id = $2;
        `,
        [userId, guildId]
    );

    const profile = existing.rows[0];
    if (!profile) {
        throw new Error("User guild profile not found");
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
        const r = config.xp.roleXp[roleId];
        if (!r) continue;
        extraXp += r.dailyXpBonus ?? 0;
        streakMult += r.multiplier ? r.multiplier : 0;
        extraGold += r.dailyGoldBonus ?? 0;
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

        if (newStreak > profile.streak_count) {
            increasedStreak = true;
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

    const updated = result.rows[0];


    if (!updated) {
        throw new Error("Failed to grant daily XP");
    }

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

        return { profile: lvlRes.rows[0], granted: true, rewardXp, rewardGold, levelUp: true, ...(streakRewardInfo && { streakReward: streakRewardInfo }), increasedStreak } ;
    }   


    return { profile: updated, granted: true, rewardXp, rewardGold, levelUp: false, ...(streakRewardInfo && { streakReward: streakRewardInfo }), increasedStreak };
}
