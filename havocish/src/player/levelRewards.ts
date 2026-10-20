import type { GuildConfig } from "../types/guild.js";
import type { PendingProfileChanges } from "../types/cache.js";
import { getOrCreateProfile, commitProfileChanges } from "../cache/profileService.js";
import { addToBag } from "./gathering.js";
import { addCombatXp } from "./combatLevel.js";

/**
 * The level actions that pay out into the RPG: gold, items and Combat XP for
 * reaching a chat level. This is the bridge from leveling into the RPG (never
 * the other way: nothing here gives chat XP). Roles and messages stay in
 * handleLevelUp, which needs Discord; this needs only the profile.
 *
 * Returns what was given, worded for the level-up announcement: "+500 gold, 1× Iron Sword".
 */
export async function grantLevelRewards(opts: {
    userId: number;
    guildId: number;
    config: GuildConfig;
    fromLevel: number;
    toLevel: number;
}): Promise<string[]> {
    const { userId, guildId, config, fromLevel, toLevel } = opts;
    const actions = [];
    for (let level = fromLevel + 1; level <= toLevel; level++) actions.push(...(config.levels.levelActions?.[level] ?? []));
    const rewards = actions.filter((a) => a.type === "giveGold" || a.type === "giveItem" || a.type === "giveCombatXp");
    if (!rewards.length) return [];

    const cached = await getOrCreateProfile({ userId, guildId });
    const p = cached.profile;
    const baseline = { xp: p.xp, gold: p.gold };
    const inv = { ...(p.inventory ?? {}) };
    let gold = 0n;
    let combatXp = 0;
    const given: string[] = [];

    for (const a of rewards) {
        const amount = Math.max(0, Math.floor(a.amount ?? 0));
        if (a.type === "giveGold" && amount) gold += BigInt(amount);
        if (a.type === "giveCombatXp" && amount) combatXp += amount;
        if (a.type === "giveItem" && a.itemId) {
            // Deleted items and maxPerUser caps give nothing, quietly, like loot does.
            const added = addToBag(inv, config, a.itemId, Math.max(1, a.quantity ?? 1));
            const def = config.shop?.items?.[a.itemId];
            if (added && def) given.push(`${added}× ${`${def.emoji ?? ""} ${def.name}`.trim()}`);
        }
    }

    const changes: PendingProfileChanges = { ...(cached.pendingChanges ?? {}), inventory: inv };
    p.inventory = inv;
    if (gold) {
        p.gold = (BigInt(p.gold) + gold).toString();
        changes.gold = p.gold;
        given.unshift(`+${gold.toLocaleString()} ${config.style.gold.name || "gold"}`);
    }
    if (combatXp) {
        addCombatXp(p, config, combatXp);
        changes.user_stats = p.user_stats;
        given.push(`+${combatXp.toLocaleString()} ⚔️ Combat XP`);
    }
    commitProfileChanges({ userId, guildId, profile: p, changes, baseline });
    return given;
}
