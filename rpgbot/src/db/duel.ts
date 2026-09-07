import { withTransaction } from "./index.js";
import { flushProfileCacheToDb } from "../cache/profileService.js";
import { profileKey, userGuildProfileCache } from "../cache/caches.js";
import { calculateStats, resolveCurrentHp } from "../player/combat.js";
import { simulateDuel, splitPot } from "../player/duel.js";
import type { DuelResult, DuelSide } from "../types/combat.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";
import type { GuildConfig } from "../types/guild.js";

export type DuelOutcome =
    | {
          success: true;
          result: DuelResult;
          /** Gold moved to the winner after the rake. Zero on a draw. */
          payout: bigint;
          /** Gold removed from circulation. Zero on a draw. */
          rake: bigint;
      }
    | { success: false; message: string };

type LockedProfile = {
    id: string;
    user_id: number;
    gold: string;
    level: number;
    equips: DbUserGuildProfile["equips"] | null;
    user_stats: DbUserGuildProfile["user_stats"] | null;
};

function toSide(
    profile: LockedProfile,
    discordUserId: string,
    displayName: string,
    config: GuildConfig
): DuelSide {
    // calculateStats only reads level and equips, so a partial row is enough.
    const stats = calculateStats(
        { level: profile.level, equips: profile.equips ?? {} } as DbUserGuildProfile,
        config,
        config.shop?.items ?? {}
    );

    const startingHp = resolveCurrentHp(
        { user_stats: profile.user_stats ?? {} } as DbUserGuildProfile,
        stats
    );

    return {
        userId: profile.user_id,
        discordUserId,
        displayName,
        stats,
        startingHp,
    };
}

/**
 * Runs a duel and settles the wager, as one transaction.
 *
 * The fight is simulated *inside* the transaction, against the locked rows.
 * Doing it outside would reintroduce exactly the bug the shop and trade paths
 * were fixed for: both balances would be read, the winner decided, and the
 * result written back over whatever had happened in between -- so a player
 * could stake gold they had already spent.
 *
 * Both profiles are locked in ascending id order, matching acceptTrade(), so a
 * duel and a trade involving the same two players cannot deadlock each other.
 *
 * Combat stats come from the locked rows too, so a duel cannot settle using
 * equipment that was unequipped while the challenge sat unanswered.
 */
export async function resolveDuel(opts: {
    guildId: number;
    challenger: { userId: number; discordUserId: string; displayName: string };
    opponent: { userId: number; discordUserId: string; displayName: string };
    wager: bigint;
    config: GuildConfig;
}): Promise<DuelOutcome> {
    const { guildId, challenger, opponent, wager, config } = opts;

    if (wager < 0n) {
        return { success: false, message: "A wager cannot be negative." };
    }
    if (challenger.userId === opponent.userId) {
        return { success: false, message: "You cannot duel yourself." };
    }

    // Both players' gold lives in the write-back cache until it is flushed, so
    // push it down before the transaction reads their rows.
    await flushProfileCacheToDb({ userId: challenger.userId, guildId, force: true });
    await flushProfileCacheToDb({ userId: opponent.userId, guildId, force: true });

    const pvp = config.combat?.pvp ?? {};
    let settled = false;

    try {
        const outcome = await withTransaction<DuelOutcome>(async (client) => {
            const rows = new Map<number, LockedProfile>();

            // Ascending profile id, same order acceptTrade() uses.
            const idRes = await client.query<{ id: string; user_id: number }>(
                `SELECT id, user_id FROM user_guild_profiles
                 WHERE guild_id = $1 AND user_id = ANY($2::bigint[])`,
                [guildId, [challenger.userId, opponent.userId]]
            );

            if (idRes.rows.length < 2) {
                return { success: false, message: "Both players need a profile in this server first." };
            }

            const ordered = [...idRes.rows].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));

            for (const { id } of ordered) {
                const res = await client.query<LockedProfile>(
                    `SELECT id, user_id, gold, level, equips, user_stats
                     FROM user_guild_profiles WHERE id = $1 FOR UPDATE`,
                    [id]
                );
                const row = res.rows[0];
                if (!row) {
                    return { success: false, message: "One of the profiles disappeared mid-duel." };
                }
                rows.set(row.user_id, row);
            }

            const challengerRow = rows.get(challenger.userId);
            const opponentRow = rows.get(opponent.userId);
            if (!challengerRow || !opponentRow) {
                return { success: false, message: "Both players need a profile in this server first." };
            }

            // Re-check the stakes against the locked balances: the challenge may
            // have been sitting unanswered while either side spent their gold.
            if (BigInt(challengerRow.gold ?? 0) < wager) {
                return { success: false, message: "The challenger can no longer cover that wager." };
            }
            if (BigInt(opponentRow.gold ?? 0) < wager) {
                return { success: false, message: "You cannot cover that wager." };
            }

            const challengerSide = toSide(
                challengerRow,
                challenger.discordUserId,
                challenger.displayName,
                config
            );
            const opponentSide = toSide(
                opponentRow,
                opponent.discordUserId,
                opponent.displayName,
                config
            );

            const result = simulateDuel(challengerSide, opponentSide, {
                maxRounds: pvp.maxRounds ?? 50,
            });

            const hpByUser = new Map<number, number>([
                [challenger.userId, result.challengerHp],
                [opponent.userId, result.opponentHp],
            ]);

            let payout = 0n;
            let rake = 0n;

            if (!result.draw && result.winnerDiscordId) {
                const winnerIsChallenger = result.winnerDiscordId === challenger.discordUserId;
                const winnerRow = winnerIsChallenger ? challengerRow : opponentRow;
                const loserRow = winnerIsChallenger ? opponentRow : challengerRow;

                // The pot is both stakes; the loser's stake is what actually moves.
                const split = splitPot(wager * 2n, pvp.rakePercent ?? 0);
                payout = split.payout;
                rake = split.rake;

                // Winner is up the pot minus their own stake and the rake.
                const winnerGold = BigInt(winnerRow.gold ?? 0) - wager + payout;
                const loserGold = BigInt(loserRow.gold ?? 0) - wager;

                await client.query(
                    `UPDATE user_guild_profiles SET gold = $2, updated_at = NOW() WHERE id = $1`,
                    [winnerRow.id, winnerGold.toString()]
                );
                await client.query(
                    `UPDATE user_guild_profiles SET gold = $2, updated_at = NOW() WHERE id = $1`,
                    [loserRow.id, loserGold.toString()]
                );
            }

            // HP carries out of the duel either way, so a won fight still costs
            // something and /daily's heal stays worth having.
            for (const row of [challengerRow, opponentRow]) {
                const stats = { ...(row.user_stats ?? {}) } as Record<string, unknown>;
                stats.currentHp = hpByUser.get(row.user_id) ?? 0;
                await client.query(
                    `UPDATE user_guild_profiles SET user_stats = $2, updated_at = NOW() WHERE id = $1`,
                    [row.id, JSON.stringify(stats)]
                );
            }

            settled = true;
            return { success: true, result, payout, rake };
        });

        // The transaction wrote behind the cache's back.
        if (settled) {
            userGuildProfileCache.delete(profileKey(guildId, challenger.userId));
            userGuildProfileCache.delete(profileKey(guildId, opponent.userId));
        }

        return outcome;
    } catch (err) {
        console.error("Duel failed and was rolled back:", err);
        return { success: false, message: "Something went wrong resolving that duel. No gold changed hands." };
    }
}
