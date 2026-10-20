import { GuildMember } from "discord.js";
import type { GuildConfig } from "../types/guild.js";
import type { Requirements } from "../types/requirements.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";
import type { shopItemConfig } from "../types/economy.js";
import { skillLevel } from "./gathering.js";
import { combatLevel } from "./combatLevel.js";

/**
 * The one place RPG content is gated. Everything that can be locked (items,
 * locations, recipes, enemies, quests) carries a Requirements block and asks
 * here, so every gate words its message the same way.
 */

/** What Discord says about the member, read off the interaction: no extra API calls. */
export type MemberFacts = { roleIds: string[]; joinedAt: number | null; boosting: boolean };

const DAY_MS = 86_400_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- interaction.member is one of two Discord shapes
export function memberFacts(member: any): MemberFacts {
    if (member instanceof GuildMember) {
        return { roleIds: [...member.roles.cache.keys()], joinedAt: member.joinedTimestamp ?? null, boosting: !!member.premiumSinceTimestamp };
    }
    return {
        roleIds: Array.isArray(member?.roles) ? member.roles : [],
        joinedAt: member?.joined_at ? Date.parse(member.joined_at) : null,
        boosting: !!member?.premium_since,
    };
}

/**
 * An item's own fields folded into its requirements. Its "minimum level" is a
 * Combat level now: gear is gated by the RPG, not by chatting.
 */
export function itemRequirements(item: shopItemConfig | undefined): Requirements {
    const req = item?.requirements ?? {};
    const roles = [...(req.roles ?? []), ...(item?.requiresRoleIds ?? [])];
    const combat = Math.max(req.combatLevel ?? 0, item?.minLevel ?? 0);
    return { ...req, ...(combat > 0 && { combatLevel: combat }), ...(roles.length && { roles: [...new Set(roles)] }) };
}

/** A skill's name and the member's level in it, from gathering or crafting. Null when the skill no longer exists. */
function skillOf(id: string, profile: DbUserGuildProfile, config: GuildConfig) {
    const activity = config.gathering?.activities?.[id];
    const station = config.crafting?.stations?.[id];
    if (!activity && !station) return null;
    const xp = (activity ? profile.user_stats?.gathering?.[id]?.xp : profile.user_stats?.crafting?.[id]?.xp) ?? 0;
    return { name: (activity ?? station)!.skillName, level: skillLevel(xp, config) };
}

const roleList = (ids: string[]) =>
    ids.length === 1 ? `the <@&${ids[0]}> role` : `one of ${ids.map((id) => `<@&${id}>`).join(", ")}`;

/** "a, b and c" */
const joinAnd = (parts: string[]) => (parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`);

/**
 * Whether the member meets every condition, and what they're missing, worded
 * for a message: "Needs Mining 15 and the @Veteran role." References to
 * deleted skills fail open, like every other dangling reference.
 */
export function checkRequirements(
    req: Requirements | undefined,
    ctx: { profile: DbUserGuildProfile; config: GuildConfig; facts: MemberFacts; now?: number },
): { ok: boolean; missing: string[]; message: string } {
    const { profile, config, facts, now = Date.now() } = ctx;
    const missing: string[] = [];
    if (!req) return { ok: true, missing, message: "" };

    if (req.combatLevel && combatLevel(profile, config) < req.combatLevel) missing.push(`Combat ${req.combatLevel}`);
    if (req.chatLevel && (profile.level ?? 1) < req.chatLevel) missing.push(`chat level ${req.chatLevel}`);
    for (const [id, need] of Object.entries(req.skills ?? {})) {
        const skill = skillOf(id, profile, config);
        if (skill && skill.level < need) missing.push(`${skill.name} ${need}`);
    }
    if (req.roles?.length && !req.roles.some((r) => facts.roleIds.includes(r))) missing.push(roleList(req.roles));
    if (req.memberDays && (facts.joinedAt == null || now - facts.joinedAt < req.memberDays * DAY_MS)) {
        missing.push(`${req.memberDays} day${req.memberDays === 1 ? "" : "s"} in the server`);
    }
    if (req.booster && !facts.boosting) missing.push("boosting the server");

    return { ok: missing.length === 0, missing, message: missing.length ? `Needs ${joinAnd(missing)}.` : "" };
}

/** Every condition, worded for a list or a tooltip, whether or not it's met. */
export function describeRequirements(req: Requirements | undefined, config: GuildConfig): string[] {
    if (!req) return [];
    const out: string[] = [];
    if (req.combatLevel) out.push(`Combat ${req.combatLevel}`);
    if (req.chatLevel) out.push(`Chat level ${req.chatLevel}`);
    for (const [id, need] of Object.entries(req.skills ?? {})) {
        const name = config.gathering?.activities?.[id]?.skillName ?? config.crafting?.stations?.[id]?.skillName;
        if (name) out.push(`${name} ${need}`);
    }
    if (req.roles?.length) out.push(req.roles.length === 1 ? `<@&${req.roles[0]}>` : `one of ${req.roles.map((r) => `<@&${r}>`).join(", ")}`);
    if (req.memberDays) out.push(`${req.memberDays} days in the server`);
    if (req.booster) out.push("Server booster");
    return out;
}
