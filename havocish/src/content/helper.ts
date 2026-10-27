import type { GuildConfigJson } from "./packs.ts";

/**
 * The dashboard's helper: an owner asks in plain words ("put fights in
 * #arena", "why can't anyone reach the Deep Vein?") and a small model answers
 * from the server's own config. Changes come back as edits the owner sees and
 * applies; the helper never saves anything itself.
 */

/** One edit: a path into the config (section first), and its new value. null deletes. */
export type Change = { path: string[]; value: unknown };

export const HELPER_PROMPT = `You are the helper on the dashboard of havocish, a Discord RPG and leveling bot. You talk to a server owner (or a member with Manage Server) about their own server's setup.

What the bot does: members earn chat XP and levels (/level, optional, off when the server keeps another leveling bot), fight enemies turn by turn (/fight, with Combat levels 1 to 40), buy and sell in /shop, upgrade gear (/upgrade), gather with minigames (/gather), craft (/craft), do quests and achievements, fill collections, and fight world bosses together. Characters post the game's public messages under their own name and picture.

The server's config is one JSON object. Below you get its channels, roles and an outline of the config: settings as they are, and each entry (enemy, item, place…) by id and name only. Call read_config for the full detail of the part a question is about. Its sections, and the dashboard page that edits each:
- combat (Combat page: enemies, places, moves, statuses; Combat rules page: stats per level, HP regen, parties, fightsIn, allowEnemyChoice). combat.places.<id> = {id, name, emoji, arrival, channelIds: [channel or category ids], enemies: [{enemyId, weight}], fights: "thread" | "channel"}. Enemies have minLevel/maxLevel, drops [{itemId, chance 0-1, quantity}] and moves [{moveId, weight}].
- shop (Items page: items and categories; Shop page: upgrades, gifting). Items: price, sellPrice, rarity, minLevel, hidden (not sold), equipable + equipSlot + effects.stats for gear, actions for usable items.
- xp, levels (Leveling page): chat XP per message, cooldown, daily, voice, level curve, levelActions: {"<level>": [{type: "assignRole", roleId}]} for roles at chat levels.
- unlocks (Combat rules page, "Roles at levels"): unlocks.list.<id> = {id, roleId, requirements: {combatLevel}, placeId?}: a role given at a Combat level, often to open a hidden channel.
- roleRewards (rewards for getting a role from anywhere): roles: {"<roleId>": [{type: "giveGold", amount}]}.
- quests, achievements (their pages), gathering (activities and locations), crafting (stations and recipes), collections, characters (list, shopkeeperId, announcerId).
- announcements: levels.announceLevelUpInChannelId, quests.announceAllId, achievements.announceAllId, collections.channelId, unlocks.channelId, rareFinds.channelId (Announcements page). logging.mainChannelId (Logging page).
- Each feature section has "enabled".
Requirements anywhere look like {combatLevel, chatLevel, skills: {<activity or station id>: level}, roles: [ids], memberDays, booster, found: [item ids], collections: [ids]}.

How to help:
- Answer plainly and briefly, the way you'd explain it to a friend who runs a Discord server. Name the dashboard page when pointing somewhere. Use names, never raw ids, in what you say.
- To change something, call propose_changes once with every edit needed. The owner sees each edit and applies it with one click; nothing changes until then. Say in a sentence what it will do.
- Read an entry with read_config before changing or copying it.
- Change as little as possible: set the one field, or add the one entry, rather than rewriting a section. A new entry copies the shape of the existing ones of its kind, with a lowercase-hyphen id that isn't taken.
- Use only channel and role ids from the lists below. If what they named isn't there, say so and ask.
- If something can't be done with the config, say so honestly. Don't invent settings.`;

/** The tool the model proposes edits with. Values are free-form JSON, so the schema stays loose and applyChanges checks them. */
export const PROPOSE_TOOL = {
    name: "propose_changes",
    description: "Propose edits to the server's config for the owner to review and apply. Each change sets the value at a path (section first, e.g. [\"combat\", \"places\", \"forest\", \"channelIds\"]); a null value deletes it.",
    input_schema: {
        type: "object" as const,
        properties: {
            summary: { type: "string", description: "One sentence: what applying these does." },
            changes: {
                type: "array",
                items: {
                    type: "object",
                    properties: { path: { type: "array", items: { type: "string" } }, value: { description: "The new value, any JSON. null deletes." } },
                    required: ["path", "value"],
                },
            },
        },
        required: ["summary", "changes"],
    },
};

/** The tool the model reads one part of the config with, since it only gets the outline up front. */
export const READ_TOOL = {
    name: "read_config",
    description: "Read part of the server's config in full, e.g. [\"combat\", \"places\", \"deep-vein\"] or [\"xp\"]. Read only what the question needs.",
    input_schema: {
        type: "object" as const,
        properties: { path: { type: "array", items: { type: "string" }, description: "Section first." } },
        required: ["path"],
    },
};

/**
 * The config in brief, for every message: settings as they are, each entry
 * (enemy, item, place…) as just its name, long text cut short. A full config
 * is ~40k tokens; this is a few thousand.
 */
export function outline(value: unknown, depth = 0): unknown {
    if (typeof value === "string") return value.length > 50 ? `${value.slice(0, 47)}…` : value;
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) {
        if (value.every((v) => !v || typeof v !== "object") && value.length <= 10) return value.map((v) => outline(v, depth + 1));
        return `[${value.length} items]`;
    }
    const entries = Object.entries(value);
    // An entry deep in a section: its name is enough to know it's there.
    if (depth >= 3) return typeof (value as { name?: unknown }).name === "string" ? (value as { name: string }).name : `{${entries.length} fields}`;
    return Object.fromEntries(entries.map(([k, v]) => [k, outline(v, depth + 1)]));
}

/** Changes that are safe to show and apply: a real path into a known section, no prototype tricks. */
export function cleanChanges(raw: unknown, config: GuildConfigJson): Change[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((c) => {
        const path = (c as Change)?.path;
        if (!Array.isArray(path) || path.length < 2 || path.length > 8 || !path.every((p) => typeof p === "string" && p && !["__proto__", "prototype", "constructor"].includes(p))) return [];
        // A new section of its own is fine (unlocks, roleRewards…), as long as it's an object.
        if (config[path[0]!] !== undefined && (typeof config[path[0]!] !== "object" || config[path[0]!] === null)) return [];
        return [{ path, value: (c as Change).value === undefined ? null : (c as Change).value }];
    });
}

/** What's at `path` now, for showing old → new. */
export function valueAt(config: GuildConfigJson | null, path: string[]): unknown {
    let at: unknown = config;
    for (const p of path) at = at && typeof at === "object" ? (at as Record<string, unknown>)[p] : undefined;
    return at;
}

/** The config with the changes made, on a copy. Objects along the way are created as needed. */
export function applyChanges(config: GuildConfigJson | null, changes: Change[]): GuildConfigJson {
    const next = structuredClone(config ?? {}) as Record<string, unknown>;
    for (const { path, value } of changes) {
        let at = next;
        for (const p of path.slice(0, -1)) {
            if (!at[p] || typeof at[p] !== "object") at[p] = {};
            at = at[p] as Record<string, unknown>;
        }
        const last = path.at(-1)!;
        if (value === null) {
            if (Array.isArray(at)) at.splice(Number(last), 1);
            else delete at[last];
        } else at[last] = structuredClone(value);
    }
    return next as GuildConfigJson;
}
