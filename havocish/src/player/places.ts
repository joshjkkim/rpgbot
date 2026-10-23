import type { EnemyConfig, PlaceConfig } from "../types/combat.js";
import type { GuildConfig } from "../types/guild.js";

/**
 * Places map the server's channels to enemy pools: wolves in #the-woods, the
 * Lich only in #the-crypt. A place can cover a whole category, and a thread
 * belongs to the channel it's in. Channels outside every place keep the old
 * behaviour: any enemy that suits the player's level.
 */

/** The channel, its parent and grandparent: a thread's channel, a channel's category. */
export type ChannelChain = (string | null | undefined)[];

/** Ids to match a place against, nearest first. */
export function channelChain(channel: { id: string; parentId?: string | null; parent?: { parentId?: string | null } | null } | null | undefined): ChannelChain {
    if (!channel) return [];
    return [channel.id, channel.parentId, channel.parent?.parentId];
}

/** The place a channel belongs to; the nearest match wins, so a channel can be its own place inside a category's. */
export function placeFor(config: GuildConfig, chain: ChannelChain): PlaceConfig | null {
    const places = Object.values(config.combat?.places ?? {});
    for (const id of chain) {
        if (!id) continue;
        const place = places.find((p) => p.channelIds?.includes(id));
        if (place) return place;
    }
    return null;
}

/** Enemies met in a place that suit a Combat level, with their weights. */
export function placeEnemies(place: PlaceConfig, config: GuildConfig, level: number, allowed: (e: EnemyConfig) => boolean = () => true) {
    const enemies = config.combat?.enemies ?? {};
    return (place.enemies ?? [])
        .map((p) => ({ enemy: enemies[p.enemyId], weight: Math.max(0, p.weight ?? 1) }))
        .filter((p): p is { enemy: EnemyConfig; weight: number } =>
            !!p.enemy && !p.enemy.boss && p.weight > 0 &&
            level >= p.enemy.minLevel && (p.enemy.maxLevel == null || level <= p.enemy.maxLevel) && allowed(p.enemy));
}

/** Rolls an enemy from a place's pool by weight, or null when nothing there suits the level. */
export function pickFromPlace(place: PlaceConfig, config: GuildConfig, level: number, allowed?: (e: EnemyConfig) => boolean, roll = Math.random): EnemyConfig | null {
    const pool = placeEnemies(place, config, level, allowed);
    let r = roll() * pool.reduce((sum, p) => sum + p.weight, 0);
    for (const p of pool) {
        r -= p.weight;
        if (r < 0) return p.enemy;
    }
    return pool.at(-1)?.enemy ?? null;
}

/** Whether fights here open in a thread. */
export function fightsInThread(config: GuildConfig, place: PlaceConfig | null): boolean {
    return (place ? place.fights ?? "thread" : config.combat?.fightsIn ?? "channel") === "thread";
}
