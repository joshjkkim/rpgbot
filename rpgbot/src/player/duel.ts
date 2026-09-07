import { resolveHit } from "./fight.js";
import type { DuelResult, DuelRound, DuelSide } from "../types/combat.js";

/** Hard ceiling, used when a guild has not configured one. */
const DEFAULT_MAX_ROUNDS = 50;

/**
 * Fights two players to a conclusion.
 *
 * Unlike a PvE fight there are no turns to wait on: a duel resolves the moment
 * it is accepted, so this is a pure function over two stat blocks. That keeps
 * both players out of the AFK problem, and means nothing has to be held in
 * memory between rounds.
 *
 * Faster side strikes first. Ties on speed go to the challenger, so the
 * ordering is deterministic rather than dependent on argument order.
 *
 * The round cap exists because two high-defence players can both sit at the
 * damage floor of 1 for a very long time; hitting it is a draw and nobody's
 * wager moves.
 */
export function simulateDuel(
    challenger: DuelSide,
    opponent: DuelSide,
    opts: { maxRounds?: number } = {}
): DuelResult {
    const maxRounds = Math.max(1, opts.maxRounds ?? DEFAULT_MAX_ROUNDS);

    let challengerHp = Math.max(1, challenger.startingHp);
    let opponentHp = Math.max(1, opponent.startingHp);

    const rounds: DuelRound[] = [];
    const challengerFirst = challenger.stats.spd >= opponent.stats.spd;

    for (let round = 1; round <= maxRounds; round++) {
        // Within a round each side swings once, faster first. A side that has
        // already fallen does not get its swing.
        const order = challengerFirst
            ? ([challenger, opponent] as const)
            : ([opponent, challenger] as const);

        for (const attacker of order) {
            const attackerIsChallenger = attacker.discordUserId === challenger.discordUserId;
            const defender = attackerIsChallenger ? opponent : challenger;

            const attackerHp = attackerIsChallenger ? challengerHp : opponentHp;
            if (attackerHp <= 0) continue;

            const hit = resolveHit(
                attacker.stats.atk,
                defender.stats.def,
                attacker.stats.critChance,
                attacker.stats.critMultiplier
            );

            if (attackerIsChallenger) {
                opponentHp = Math.max(0, opponentHp - hit.damage);
            } else {
                challengerHp = Math.max(0, challengerHp - hit.damage);
            }

            rounds.push({
                round,
                attacker: attacker.discordUserId,
                damage: hit.damage,
                isCrit: hit.isCrit,
                attackerHpAfter: attackerIsChallenger ? challengerHp : opponentHp,
                defenderHpAfter: attackerIsChallenger ? opponentHp : challengerHp,
            });

            if (challengerHp <= 0 || opponentHp <= 0) break;
        }

        if (challengerHp <= 0 || opponentHp <= 0) break;
    }

    if (challengerHp > 0 && opponentHp > 0) {
        return {
            winnerDiscordId: null,
            loserDiscordId: null,
            rounds,
            challengerHp,
            opponentHp,
            draw: true,
        };
    }

    const challengerWon = opponentHp <= 0;

    return {
        winnerDiscordId: challengerWon ? challenger.discordUserId : opponent.discordUserId,
        loserDiscordId: challengerWon ? opponent.discordUserId : challenger.discordUserId,
        rounds,
        challengerHp,
        opponentHp,
        draw: false,
    };
}

/**
 * Splits a pot into the winner's take and the guild's rake.
 *
 * The rake is the only part of a duel that removes gold from circulation --
 * the wager itself just moves between two players.
 */
export function splitPot(pot: bigint, rakePercent: number): { payout: bigint; rake: bigint } {
    const pct = Math.min(100, Math.max(0, rakePercent));
    if (pct === 0) return { payout: pot, rake: 0n };

    const rake = (pot * BigInt(Math.round(pct * 100))) / 10000n;
    return { payout: pot - rake, rake };
}
