import type { GuildConfig, LevelAction } from "../types/guild.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";
import type { PendingProfileChanges } from "../types/cache.js";
import { getOrCreateProfile, commitProfileChanges } from "../cache/profileService.js";
import { addToBag } from "./gathering.js";
import { addCombatXp } from "./combatLevel.js";

/**
 * The rewards that pay into the RPG: gold, items and Combat XP, for reaching a
 * chat level or for getting a role. This is the bridge from leveling (havocish's
 * own, or any other bot's roles) into the RPG, never the other way: nothing
 * here gives chat XP. Roles and messages stay in handleLevelUp, which needs
 * Discord; this needs only the profile.
 */

const REWARD_TYPES = new Set<LevelAction["type"]>(["giveGold", "giveItem", "giveCombatXp"]);

/** Applies the reward actions to a profile in place. Returns the changed columns and the wording. */
function applyRewards(p: DbUserGuildProfile, config: GuildConfig, actions: LevelAction[]) {
    const inv = { ...(p.inventory ?? {}) };
    let gold = 0n;
    let combatXp = 0;
    const given: string[] = [];

    for (const a of actions) {
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

    const changes: PendingProfileChanges = { inventory: inv } as PendingProfileChanges;
    p.inventory = inv;
    if (gold) {
        p.gold = (BigInt(p.gold) + gold).toString();
        changes.gold = p.gold;
        given.unshift(`+${gold.toLocaleString()} ${config.style.gold.name || "gold"}`);
    }
    if (combatXp) {
        addCombatXp(p, config, combatXp);
        given.push(`+${combatXp.toLocaleString()} ⚔️ Combat XP`);
    }
    return { changes, given };
}

/**
 * Every reward for the levels crossed, in one commit. Returns what was given,
 * worded for the level-up announcement: "+500 gold, 1× Iron Sword".
 */
export async function grantLevelRewards(opts: {
    userId: number;
    guildId: number;
    config: GuildConfig;
    fromLevel: number;
    toLevel: number;
}): Promise<string[]> {
    const { userId, guildId, config, fromLevel, toLevel } = opts;
    const actions: LevelAction[] = [];
    for (let level = fromLevel + 1; level <= toLevel; level++) actions.push(...(config.levels.levelActions?.[level] ?? []));
    const rewards = actions.filter((a) => REWARD_TYPES.has(a.type));
    if (!rewards.length) return [];

    const cached = await getOrCreateProfile({ userId, guildId });
    const p = cached.profile;
    const baseline = { xp: p.xp, gold: p.gold };
    const { changes, given } = applyRewards(p, config, rewards);
    commitProfileChanges({
        userId, guildId, profile: p,
        changes: { ...(cached.pendingChanges ?? {}), ...changes, user_stats: p.user_stats },
        baseline,
    });
    return given;
}

/**
 * Pays the reward of every rewarded role the member holds and hasn't been paid
 * for yet, then marks those roles as paid. Safe to call on every member update
 * and message: with nothing new it returns without touching the profile.
 */
export async function grantRoleRewards(opts: {
    userId: number;
    guildId: number;
    config: GuildConfig;
    roleIds: string[];
}): Promise<{ roleId: string; given: string[] }[]> {
    const { userId, guildId, config, roleIds } = opts;
    const table = config.roleRewards?.roles ?? {};
    const rewarded = roleIds.filter((id) => table[id]?.some((a) => REWARD_TYPES.has(a.type)));
    if (!rewarded.length) return [];

    const cached = await getOrCreateProfile({ userId, guildId });
    const p = cached.profile;
    const paid = p.user_stats?.roleRewards ?? [];
    const due = rewarded.filter((id) => !paid.includes(id));
    if (!due.length) return [];

    const baseline = { xp: p.xp, gold: p.gold };
    let changes: PendingProfileChanges = {} as PendingProfileChanges;
    const out = due.map((roleId) => {
        const r = applyRewards(p, config, table[roleId]!.filter((a) => REWARD_TYPES.has(a.type)));
        changes = { ...changes, ...r.changes };
        return { roleId, given: r.given };
    });
    p.user_stats = { ...(p.user_stats ?? {}), roleRewards: [...paid, ...due] } as typeof p.user_stats;
    commitProfileChanges({
        userId, guildId, profile: p,
        changes: { ...(cached.pendingChanges ?? {}), ...changes, user_stats: p.user_stats },
        baseline,
    });
    return out;
}
