import type { GuildMember } from "discord.js";
import type { GuildConfig } from "../types/guild.js";
import type { DbUserGuildProfile, TempRoleState } from "../types/userprofile.js";
import { profileKey, userGuildProfileCache } from "../cache/caches.js";
import type { PendingProfileChanges } from "../types/cache.js";
import { getOrCreateProfile } from "../cache/profileService.js";
import { getOrCreateDbUser } from "../cache/userService.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";

interface ApplyRoleWithTempArgs {
    member: GuildMember;
    roleId: string;
    source: "item" | "command";
    sourceId?: string; // e.g. item.id or command name
}

export async function applyRoleWithTemp(args: ApplyRoleWithTempArgs): Promise<DbUserGuildProfile> {
    const { member, roleId, source, sourceId } = args;

    if (!member.roles.cache.has(roleId)) {
        await member.roles.add(roleId).catch(() => {});
    }

    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: member.id,
        username: member.user.username,
        avatarUrl: member.user.displayAvatarURL(),
    });

    const { guild, config} = await getOrCreateGuildConfig({ discordGuildId: member.guild.id });

    const tempCfg = config.xp.roleTemp?.[roleId];
    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: guild.id });

    if (!tempCfg) {
        return profile;
    }

    const now = Date.now();
    const durationMs = (tempCfg.defaultDurationMinutes ?? 60) * 60 * 1000;
    const relativeExpiry = new Date(now + durationMs);

    let finalExpiry = relativeExpiry;
    if (tempCfg.hardExpiryat) {
        const hard = new Date(tempCfg.hardExpiryat);
        if (!Number.isNaN(hard.getTime()) && hard.getTime() < finalExpiry.getTime()) {
            finalExpiry = hard;
        }
    }

    const expiresAtIso = finalExpiry.toISOString();

    const tempRoles: Record<string, TempRoleState> = {
        ...(profile.tempRoles ?? {}),
        [roleId]: {
            expiresAt: expiresAtIso,
            source,
            ...(sourceId && { sourceId }),
        },
    };

    const key = profileKey(profile.guild_id, profile.user_id);
    const cached = userGuildProfileCache.get(key);

    const updatedProfile: DbUserGuildProfile = {
        ...(cached?.profile ?? profile),
        tempRoles,
    };

    const pending: PendingProfileChanges = {
        ...(cached?.pendingChanges ?? {}),
        temp_roles: tempRoles,
    };

    userGuildProfileCache.set(key, {
        profile: updatedProfile,
        pendingChanges: Object.keys(pending).length > 0 ? pending : undefined,
        dirty: true,
        lastWroteToDb: cached?.lastWroteToDb,
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
    const cached = userGuildProfileCache.get(key);
    
    const { profile } = await getOrCreateProfile({ userId, guildId });

    const tempRoles = { ...(profile.tempRoles ?? {}) };

    if (!tempRoles[roleId]) {
        return null;
    }

    console.log("Checking expiry for temp role:", roleId, tempRoles[roleId]);

    if (new Date(tempRoles[roleId].expiresAt).getTime() > now) {
        return null;
    }

    await member.roles.remove(roleId).catch(() => {});

    delete tempRoles[roleId];

    const updatedProfile: DbUserGuildProfile = {
        ...(cached?.profile ?? profile),
        tempRoles,
    };

    const pending: PendingProfileChanges = {
        ...(cached?.pendingChanges ?? {}),
        temp_roles: tempRoles,
    };

    userGuildProfileCache.set(key, {
        profile: updatedProfile,
        pendingChanges: Object.keys(pending).length > 0 ? pending : undefined,
        dirty: true,
        lastWroteToDb: cached?.lastWroteToDb,
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