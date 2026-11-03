import type { MoveConfig } from "../types/combat.js";
import type { GuildConfig } from "../types/guild.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";
import { checkRequirements, type MemberFacts } from "./requirements.js";
import { moveById, movesOf } from "../content/fight.js";

/**
 * Fight moves on the player's side: which ones they have and take into a fight,
 * The turn engine and moves in plain words are content/fight.ts.
 */
export * from "../content/fight.js";

/** Moves a player takes into a fight; one button row, with Flee. */
export const LOADOUT_SIZE = 4;

// ─── What a player can use ────────────────────────────────────────────────────

/** Move ids the player's equipped gear gives. */
export function gearMoves(profile: DbUserGuildProfile, config: GuildConfig): string[] {
    const items = config.shop?.items ?? {};
    return Object.values(profile.equips ?? {}).flatMap((id) => (id && items[id]?.effects?.moves) || []);
}

/** Every move this player has: from gear, or for players and unlocked (and learned, where it must be). */
export function playerMoves(profile: DbUserGuildProfile, config: GuildConfig, facts: MemberFacts): MoveConfig[] {
    const gear = new Set(gearMoves(profile, config));
    const learned = new Set(profile.user_stats?.moves?.learned ?? []);
    const all = movesOf(config);
    const have = Object.values(all).filter((m) =>
        gear.has(m.id) || (
            !!m.players &&
            (!m.players.learned || learned.has(m.id)) &&
            checkRequirements(m.players.requirements, { profile, config, facts }).ok
        ));
    return have.length > 0 ? have : [moveById(config, "attack")];
}

/**
 * Whether a move scroll has anything to teach: "missing" when the move is gone
 * or isn't for players, "known" when already learned or it needs no learning.
 */
export function moveToLearn(profile: DbUserGuildProfile, config: GuildConfig, moveId: string): { status: "missing" | "known" | "new"; move?: MoveConfig } {
    const move = movesOf(config)[moveId];
    if (!move?.players) return { status: "missing" };
    const learned = profile.user_stats?.moves?.learned ?? [];
    return { status: !move.players.learned || learned.includes(moveId) ? "known" : "new", move };
}

/** Adds a move to the learned list in place; callers commit user_stats. */
export function learnMove(profile: DbUserGuildProfile, moveId: string): void {
    const stats = profile.user_stats ?? ({} as NonNullable<DbUserGuildProfile["user_stats"]>);
    const learned = [...new Set([...(stats.moves?.learned ?? []), moveId])];
    profile.user_stats = { ...stats, moves: { ...stats.moves, learned } };
}

/** The moves taken into a fight: the picked ones still available, topped up in list order. */
export function loadoutFor(profile: DbUserGuildProfile, config: GuildConfig, facts: MemberFacts): string[] {
    const have = playerMoves(profile, config, facts).map((m) => m.id);
    const picked = (profile.user_stats?.moves?.loadout ?? []).filter((id) => have.includes(id));
    const gear = gearMoves(profile, config).filter((id) => have.includes(id));
    return [...new Set([...picked, ...gear, ...have])].slice(0, LOADOUT_SIZE);
}
