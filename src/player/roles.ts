import type { GuildMember } from "discord.js";
import type { GuildConfig } from "../db/guilds.js";
import type { DbUserGuildProfile, TempRoleState } from "../db/userGuildProfiles.js";
import { query } from "../db/index.js";
import { profileKey, userGuildProfileCache } from "../cache/caches.js";
import { getOrCreateProfile } from "../cache/profileService.js";

interface ApplyRoleWithTempArgs {
    member: GuildMember;
    roleId: string;
    config: GuildConfig;
    profile: DbUserGuildProfile;
    source: "item" | "command";
    sourceId?: string; // e.g. item.id or command name
}

export async function applyRoleWithTemp(args: ApplyRoleWithTempArgs): Promise<DbUserGuildProfile> {
    const { member, roleId, config, profile, source, sourceId } = args;

    if (!member.roles.cache.has(roleId)) {
        await member.roles.add(roleId).catch(() => {});
    }

    const tempCfg = config.xp.roleTemp?.[roleId];
    if (!tempCfg) {
        return profile;
    }

    const now = Date.now();

    const durationMs = (tempCfg.defaultDurationMinutes ?? 60) * 60 * 1000;
    const relativeExpiry = new Date(now + durationMs);

    let finalExpiry = relativeExpiry;

    if (tempCfg.hardExpiryat) {
        const hard = new Date(tempCfg.hardExpiryat);
        if (hard.getTime() <= now) return profile;
        if (!Number.isNaN(hard.getTime()) && hard.getTime() < finalExpiry.getTime()) {
        finalExpiry = hard;
        }
    }

    const expiresAtIso = finalExpiry.toISOString();

    const tempRoles: Record<string, TempRoleState> = {
        ...(profile.temp_roles ?? {}),
        [roleId]: {
        expiresAt: expiresAtIso,
        source,
        ...(sourceId && { sourceId }),
        },
    };

    const result = await query<DbUserGuildProfile>(
        `
        UPDATE user_guild_profiles
        SET temp_roles = $3,
            updated_at = NOW()
        WHERE user_id = $1 AND guild_id = $2
        RETURNING *;
        `,
        [profile.user_id, profile.guild_id, JSON.stringify(tempRoles)]
    );

    const updatedProfile = result.rows[0] ?? profile;

    // 4) Sync cache
    const key = profileKey(profile.guild_id, profile.user_id);
    userGuildProfileCache.set(key, {
        profile: updatedProfile,
        lastLoaded: Date.now(),
    });

    return updatedProfile;
}

export async function removeTempRole(member: GuildMember, roleId: string, guildId: number, userId: number): Promise<DbUserGuildProfile | null> {
    if (!member.roles.cache.has(roleId)) {
        return null;
    }

    const now = Date.now();

    const key = profileKey(guildId, userId);
    
    const { profile } = await getOrCreateProfile({ userId, guildId });

    const tempRoles = profile.temp_roles ?? {};
    if (!tempRoles[roleId]) {
        return null;
    }

    if (new Date(tempRoles[roleId].expiresAt).getTime() > now) {
        return null;
    }

    member.roles.remove(roleId).catch(() => {});

    delete tempRoles[roleId];

    const result = await query<DbUserGuildProfile>(
        `
        UPDATE user_guild_profiles
        SET temp_roles = $3,
            updated_at = NOW()
        WHERE user_id = $1 AND guild_id = $2
        RETURNING *;
        `,
        [userId, guildId, JSON.stringify(tempRoles)]
    );

    const updatedProfile = result.rows[0] ?? profile;

    userGuildProfileCache.set(key, {
        profile: updatedProfile,
        lastLoaded: Date.now(),
    });

    return updatedProfile;
}

export async function refreshTempRolesForMember(member: GuildMember, profile: DbUserGuildProfile): Promise<DbUserGuildProfile> {
    const tempRoles = profile.temp_roles ?? {};
    let updatedProfile = profile;

    for (const roleId of Object.keys(tempRoles)) {
        const res = await removeTempRole(member, roleId, profile.guild_id, profile.user_id);
        if (res) {
        updatedProfile = res;
        }
    }

    return updatedProfile;
}