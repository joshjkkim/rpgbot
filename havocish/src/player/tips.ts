import type { GuildConfig } from "../types/guild.js";
import { commitProfileChanges, getOrCreateProfile } from "../cache/profileService.js";

/**
 * One-time tips: a line shown privately, once per member, the first time
 * they meet something new. No tutorial: each tip turns up where it applies.
 * Owners can switch them off on the Style page.
 */
const TIPS = {
    firstFight: "👁️ **The headline is what the enemy does next.** Red means a big hit is coming: try 🛡️ **Guard**. A move on cooldown shows the turns left, and the footer says who acts first.",
    firstWin: "⚔️ **That paid Combat XP.** `/me` shows your character and HP, and `/moves` your moves. More unlock as your Combat level grows.",
    firstLoss: "❤️ **A loss leaves you low on HP and wounded for a while.** HP refills on its own; food and potions heal right away. Gather or craft while the wound wears off.",
    firstParty: "🎯 **In a party, each of you picks with Choose my move.** The round plays once everyone has picked, or when the timer runs out.",
} as const;

export type Tip = keyof typeof TIPS;

/** The tip's text if this member hasn't had it (and marks it had), or null. */
export async function tipOnce(userId: number, guildId: number, config: GuildConfig, tip: Tip): Promise<string | null> {
    if (config.style?.tips === false) return null;
    const cached = await getOrCreateProfile({ userId, guildId });
    const p = cached.profile;
    const seen = p.user_stats?.tips ?? [];
    if (seen.includes(tip)) return null;
    p.user_stats = { ...p.user_stats, tips: [...seen, tip] } as typeof p.user_stats;
    commitProfileChanges({
        userId, guildId, profile: p,
        changes: { ...(cached.pendingChanges ?? {}), user_stats: p.user_stats },
        baseline: { xp: p.xp, gold: p.gold },
    });
    return `-# 💡 Tip\n${TIPS[tip]}`;
}
