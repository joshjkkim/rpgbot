import type { GuildConfig } from "../types/guild.js";
import type { GatheringActivity } from "../types/gathering.js";
import type { CraftingStation } from "../types/crafting.js";
import type { MoveConfig } from "../types/combat.js";
import type { UserQuestState } from "../types/quest.js";
import { movesOf } from "./moves.js";
import { placeEnemies } from "./places.js";

/**
 * "What's next": one line under a result saying what the player is working
 * toward, worked out from what the server already has (move requirements,
 * places, location and recipe skills), so owners set nothing up. Progress you
 * can see is what makes "one more" feel worth it.
 */

/** Player moves unlocked purely by Combat level (learned-only ones come from scrolls and gear instead). */
function levelMoves(config: GuildConfig): (MoveConfig & { at: number })[] {
    return Object.values(movesOf(config))
        .filter((m) => m.players && !m.players.learned && (m.players.requirements?.combatLevel ?? 0) > 1)
        .map((m) => ({ ...m, at: m.players!.requirements!.combatLevel! }));
}

/** Moves a level-up just opened: their Combat level is past `before` and at most `after`. */
export function movesUnlocked(config: GuildConfig, before: number, after: number): MoveConfig[] {
    return levelMoves(config).filter((m) => m.at > before && m.at <= after).sort((a, b) => a.at - b.at);
}

/** "🆕 New move: Rend. Pick it in /moves." for each move a level-up opened. */
export function newMoveLines(config: GuildConfig, before: number, after: number): string[] {
    return movesUnlocked(config, before, after).map((m) => `🆕 **New move: ${m.emoji} ${m.name}.** Pick it in \`/moves\`.`);
}

const levels = (n: number) => `${n} level${n === 1 ? "" : "s"} to go`;

/**
 * After a fight. Outgrown the enemy: where to find a fair fight. Otherwise the
 * next move Combat level will unlock.
 */
export function nextFightLine(config: GuildConfig, level: number, tooEasy: boolean): string | null {
    if (tooEasy) {
        // The place whose toughest suitable enemy is closest to the player's level.
        const best = Object.values(config.combat?.places ?? {})
            .filter((p) => p.channelIds?.length)
            .map((p) => ({ p, top: Math.max(0, ...placeEnemies(p, config, level).map((x) => x.enemy.minLevel)) }))
            .filter((x) => x.top > 0)
            .sort((a, b) => b.top - a.top)[0];
        if (best) return `-# Next: ${best.p.emoji} **${best.p.name}** has enemies more your level.`;
    }
    const move = levelMoves(config).filter((m) => m.at > level).sort((a, b) => a.at - b.at)[0];
    return move ? `-# Next: ${move.emoji} **${move.name}** unlocks at Combat ${move.at} (${levels(move.at - level)}).` : null;
}

/**
 * After a fight, ahead of nextFightLine: the quest a player is in the middle of.
 * A finished one they haven't claimed (its reward, often the role that opens
 * the next area, waits on that), else the enemy a hunting quest wants and where
 * it roams, else, for someone who has never taken a quest, that there are some.
 */
export function questLine(config: GuildConfig, playerQuests: Record<string, UserQuestState> | null | undefined): string | null {
    if (!config.quests?.enabled) return null;
    const quests = config.quests.quests ?? {};
    const mine = Object.entries(playerQuests ?? {}).flatMap(([id, state]) => (quests[id] && quests[id]!.active !== false ? [{ q: quests[id]!, state }] : []));

    const unclaimed = mine.find(({ state }) => state?.completedAt && !state.claimedAt);
    if (unclaimed) return `-# 📜 **${unclaimed.q.name}** is done: claim it in \`/quests\`.`;

    for (const { q, state } of mine) {
        const cond = q.conditions;
        if (!state?.acceptedAt || state.completedAt || cond.type !== "defeatEnemies" || !cond.enemyIds?.length) continue;
        const enemy = cond.enemyIds.map((id) => config.combat?.enemies?.[id]).find(Boolean);
        if (!enemy) continue;
        const where = Object.values(config.combat?.places ?? {}).filter((p) => p.channelIds?.length && p.enemies?.some((e) => cond.enemyIds!.includes(e.enemyId)));
        const roams = where.length ? ` It roams ${where.map((p) => `${p.emoji} **${p.name}**`).join(", ")}.` : "";
        return `-# 📜 **${q.name}**: defeat ${enemy.emoji} **${enemy.name}** (${state.progress ?? 0}/${cond.target}).${roams}`;
    }

    const anyActive = Object.values(quests).some((q) => q.active !== false);
    return !mine.length && anyActive ? "-# 📜 There are quests to take in `/quests`." : null;
}

/** After a gathering run: the next location this skill opens. */
export function nextGatherLine(activity: GatheringActivity, skill: number): string | null {
    const next = Object.values(activity.locations ?? {}).filter((l) => (l.minSkill ?? 1) > skill).sort((a, b) => a.minSkill - b.minSkill)[0];
    return next ? `-# Next: ${next.emoji} **${next.name}** opens at ${activity.skillName} ${next.minSkill} (${levels(next.minSkill - skill)}).` : null;
}

/** After a craft: the next recipe this station's skill opens. */
export function nextCraftLine(station: CraftingStation, skill: number, config: GuildConfig): string | null {
    const next = Object.values(station.recipes ?? {}).filter((r) => !r.hidden && (r.minSkill ?? 1) > skill).sort((a, b) => a.minSkill - b.minSkill)[0];
    if (!next) return null;
    const item = config.shop?.items?.[next.output?.itemId ?? ""];
    return `-# Next: ${item?.emoji ?? "🔨"} **${item?.name ?? next.id}** at ${station.skillName} ${next.minSkill} (${levels(next.minSkill - skill)}).`;
}
