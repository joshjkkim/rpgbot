import { upsertUserGuildProfile } from "../db/userGuildProfiles.js";
import { isStale, userGuildProfileCache, profileKey, type CachedUserGuildProfile } from "./caches.js";

const PROFILE_CONFIG_TTL_MS = 30 * 1000;

export async function getOrCreateProfile(opts: { userId: number; guildId: number; }): Promise<CachedUserGuildProfile> {
    console.log(profileKey(opts.guildId, opts.userId));
    const cached = userGuildProfileCache.get(profileKey(opts.guildId, opts.userId));
    const now = Date.now();

    if (cached && !isStale(cached.lastLoaded, PROFILE_CONFIG_TTL_MS)) {
        console.log(`Cache hit for profile ${profileKey(opts.guildId, opts.userId)}`);
        const toReturn: CachedUserGuildProfile = {
            profile: cached.profile,
            lastLoaded: cached.lastLoaded,
        };
        return toReturn;
    }

    const profile = await upsertUserGuildProfile({
        userId: opts.userId,
        guildId: opts.guildId,
    });

    userGuildProfileCache.set(profileKey(opts.guildId, opts.userId), {
        profile,
        lastLoaded: now,
    });

    return { profile, lastLoaded: now };
}

