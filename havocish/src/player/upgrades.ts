import type { GuildConfig, UpgradeRules } from "../types/guild.js";
import type { DbUserGuildProfile, item } from "../types/userprofile.js";
import type { PendingProfileChanges } from "../types/cache.js";
import type { shopItemConfig } from "../types/economy.js";
import { commitProfileChanges, getOrCreateProfile } from "../cache/profileService.js";
import type { ForgeOutcome } from "./crafting.js";

/**
 * Gear upgrades: spend gold (and maybe a material) to take a piece of gear
 * from +0 toward +5. Each step costs more and is less sure; the forge strike
 * nudges the odds. A failed step costs what it cost, never the item. Levels
 * belong to the player and the item type (inventories stack by type), in
 * user_stats.upgrades.
 */

export const UPGRADE_DEFAULTS = { name: "Upgrade", chances: [100, 100, 100, 75, 50], statPercent: 10, goldPercent: 25, strikeBonus: 15 };

export function upgradeRules(config: GuildConfig) {
    const r: UpgradeRules = config.shop?.upgrades ?? {};
    return {
        enabled: r.enabled !== false,
        name: r.name?.trim() || UPGRADE_DEFAULTS.name,
        chances: r.chances?.length ? r.chances : UPGRADE_DEFAULTS.chances,
        statPercent: r.statPercent ?? UPGRADE_DEFAULTS.statPercent,
        goldPercent: r.goldPercent ?? UPGRADE_DEFAULTS.goldPercent,
        strikeBonus: r.strikeBonus ?? UPGRADE_DEFAULTS.strikeBonus,
        material: r.material?.itemId ? { itemId: r.material.itemId, perStep: Math.max(1, r.material.perStep ?? 1) } : null,
    };
}

export function upgradeLevel(profile: DbUserGuildProfile, itemId: string): number {
    return Math.max(0, profile.user_stats?.upgrades?.[itemId] ?? 0);
}

type Stats = NonNullable<NonNullable<shopItemConfig["effects"]>["stats"]>;

/** What an item's upgrade level adds: a share of each of its positive stats per level, at least +1 per level. */
export function upgradeBonus(stats: Stats | undefined, level: number, statPercent: number): Stats {
    const out: Stats = {};
    if (!stats || level <= 0) return out;
    for (const [k, v] of Object.entries(stats) as Array<[keyof Stats, number | undefined]>) {
        if (!v || v <= 0) continue;
        out[k] = k === "crit" ? Math.round(v * statPercent / 100 * level * 10) / 10 || 0.5 * level : Math.max(level, Math.round(v * statPercent / 100 * level));
    }
    return out;
}

/** What an item is worth for pricing a step: its shop price, or what it sells for, times three. */
function itemValue(item: shopItemConfig): number {
    return Math.max(50, item.price || (item.sellPrice ?? 0) * 3);
}

export type UpgradeStep = { to: number; chance: number; gold: number; material: { itemId: string; quantity: number } | null; gain: Stats };

/** The next step for an item at `level`, or null at the top (or with nothing to upgrade). */
export function nextStep(item: shopItemConfig, level: number, config: GuildConfig): UpgradeStep | null {
    const r = upgradeRules(config);
    if (!item.equipable || level >= r.chances.length) return null;
    const to = level + 1;
    const stats = item.effects?.stats;
    const before = upgradeBonus(stats, level, r.statPercent);
    const after = upgradeBonus(stats, to, r.statPercent);
    const gain = Object.fromEntries(Object.entries(after).map(([k, v]) => [k, Math.round(((v ?? 0) - ((before as Record<string, number>)[k] ?? 0)) * 10) / 10]).filter(([, v]) => (v as number) > 0)) as Stats;
    return {
        to,
        chance: Math.max(0, Math.min(100, r.chances[level] ?? 0)),
        gold: Math.round(itemValue(item) * r.goldPercent / 100 * to / 10) * 10,
        material: r.material ? { itemId: r.material.itemId, quantity: r.material.perStep * to } : null,
        gain,
    };
}

/** The chance after the strike: a perfect one adds the bonus, a miss takes it off. */
export function chanceAfterStrike(chance: number, outcome: ForgeOutcome, config: GuildConfig): number {
    const b = upgradeRules(config).strikeBonus;
    return Math.max(0, Math.min(100, chance + (outcome === "perfect" ? b : outcome === "ruin" ? -b : 0)));
}

export type UpgradeResult =
    | { ok: false; message: string }
    | { ok: true; success: boolean; level: number; chance: number; step: UpgradeStep };

/**
 * One upgrade attempt: checks, spends the gold and material, rolls the chance
 * the strike gave, and raises the level on success. No await between the checks
 * and the spend, so two quick clicks can't spend twice.
 */
export async function attemptUpgrade(opts: {
    userId: number; guildId: number; config: GuildConfig; itemId: string; outcome: ForgeOutcome; roll?: () => number;
}): Promise<UpgradeResult> {
    const { userId, guildId, config, itemId, outcome, roll = Math.random } = opts;
    if (!upgradeRules(config).enabled) return { ok: false, message: "Upgrades are turned off on this server." };
    const item = config.shop?.items?.[itemId];
    const cached = await getOrCreateProfile({ userId, guildId });
    const p = cached.profile;
    const owned = (p.inventory?.[itemId]?.quantity ?? 0) > 0 || Object.values(p.equips ?? {}).includes(itemId);
    if (!item || !owned) return { ok: false, message: "You don't have that item." };
    const level = upgradeLevel(p, itemId);
    const step = nextStep(item, level, config);
    if (!step) return { ok: false, message: "It can't go any higher." };
    const inv: Record<string, item> = { ...(p.inventory ?? {}) };
    const gold = BigInt(p.gold ?? "0");
    if (gold < BigInt(step.gold)) return { ok: false, message: `That costs ${step.gold.toLocaleString()} gold.` };
    if (step.material && (inv[step.material.itemId]?.quantity ?? 0) < step.material.quantity) return { ok: false, message: "You don't have enough materials." };

    const baseline = { xp: p.xp, gold: p.gold };
    p.gold = (gold - BigInt(step.gold)).toString();
    if (step.material) {
        const left = inv[step.material.itemId]!.quantity - step.material.quantity;
        if (left > 0) inv[step.material.itemId] = { ...inv[step.material.itemId]!, quantity: left };
        else delete inv[step.material.itemId];
    }
    const chance = chanceAfterStrike(step.chance, outcome, config);
    const success = roll() * 100 < chance;
    const stats = { ...(p.user_stats ?? {}) } as NonNullable<DbUserGuildProfile["user_stats"]>;
    if (success) stats.upgrades = { ...stats.upgrades, [itemId]: step.to };
    p.inventory = inv;
    p.user_stats = stats;
    commitProfileChanges({
        userId, guildId, profile: p,
        changes: { ...(cached.pendingChanges ?? {}), gold: p.gold, inventory: inv, user_stats: stats } as PendingProfileChanges,
        baseline,
    });
    return { ok: true, success, level: success ? step.to : level, chance, step };
}
