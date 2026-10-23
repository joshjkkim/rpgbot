import { movesOf, statusesOf } from "../player/moves.js";
import { RULES } from "../player/twists.js";
import type { Guild } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { GuildConfig } from "../types/guild.js";
import type { DashboardPage } from "../ui/dashboardLinks.js";
import type { Requirements } from "../types/requirements.js";

/**
 * The server health check behind the dashboard Overview: everything in a
 * guild's config that will quietly fail. Channels the bot can't post in, roles
 * it can't hand out, features switched on with nothing in them, rewards that
 * point at deleted items. Most playtest bugs were exactly this, found only when
 * a member hit an error.
 *
 * It reads Discord through `Access`, so the rules can be tested without one.
 */

export type Issue = {
    severity: "error" | "warning";
    /** One sentence an owner can act on. */
    message: string;
    /** Dashboard page that fixes it. */
    page: DashboardPage;
};

type Perm = "view" | "send" | "embed" | "files" | "threads" | "threadSend";

export interface Access {
    /** The channel's name, or null when it no longer exists. */
    channelName(id: string): string | null;
    /** Which of `perms` the bot lacks in the channel. */
    missingIn(id: string, perms: Perm[]): Perm[];
    /** The role's name, or null when it no longer exists. */
    roleName(id: string): string | null;
    /** Whether the bot can give and take the role. */
    canManageRole(id: string): boolean;
}

const PERM_NAMES: Record<Perm, string> = {
    view: "View Channel", send: "Send Messages", embed: "Embed Links", files: "Attach Files",
    threads: "Create Public Threads", threadSend: "Send Messages in Threads",
};
const POST: Perm[] = ["view", "send"];
const POST_EMBED: Perm[] = ["view", "send", "embed"];

export function checkGuild(config: GuildConfig, access: Access): Issue[] {
    const issues: Issue[] = [];
    const seenChannels = new Set<string>();

    const channel = (id: string | null | undefined, what: string, page: DashboardPage, perms: Perm[]) => {
        if (!id || seenChannels.has(`${id}|${what}`)) return;
        seenChannels.add(`${id}|${what}`);
        const name = access.channelName(id);
        if (name === null) {
            issues.push({ severity: "error", message: `The ${what} channel was deleted. Pick another one.`, page });
            return;
        }
        const missing = access.missingIn(id, perms);
        if (missing.length) {
            issues.push({
                severity: "error",
                message: `havocish can't post ${what} in #${name}. Give it ${missing.map((p) => PERM_NAMES[p]).join(", ")} there.`,
                page,
            });
        }
    };

    const role = (id: string | undefined, what: string, page: DashboardPage) => {
        if (!id) return;
        const name = access.roleName(id);
        if (name === null) {
            issues.push({ severity: "error", message: `${what} gives a role that was deleted.`, page });
        } else if (!access.canManageRole(id)) {
            issues.push({
                severity: "error",
                message: `havocish can't give @${name} (${what}). Give it Manage Roles and drag its role above @${name} in Server Settings → Roles.`,
                page,
            });
        }
    };

    const items = config.shop?.items ?? {};
    const item = (id: string | undefined, what: string, page: DashboardPage) => {
        if (id && !items[id]) issues.push({ severity: "warning", message: `${what} gives an item that no longer exists (${id}).`, page });
    };

    // ── Levels ──
    channel(config.levels.announceLevelUpInChannelId, "level-up announcements", "levels", [...POST, "files"]);
    for (const [level, actions] of Object.entries(config.levels.levelActions ?? {})) {
        for (const a of actions ?? []) {
            if (a.type === "sendMessage") channel(a.channelId, `the level ${level} message`, "levels", POST);
            else if (a.type === "giveItem") item(a.itemId, `The level ${level} reward`, "levels");
            else if (a.type === "assignRole" || a.type === "removeRole") role(a.roleId, `the level ${level} reward`, "levels");
        }
    }

    channel(config.rareFinds?.channelId, "rare-find announcements", "items", POST);
    channel(config.style.levelUpCards?.channelId, "level-up card", "styles", [...POST, "files"]);

    // ── Role rewards ── (the page is Leveling: they sit beside level rewards)
    channel(config.roleRewards?.channelId, "role reward announcements", "leveling", POST);
    for (const [roleId, actions] of Object.entries(config.roleRewards?.roles ?? {})) {
        // Only read, never given, so havocish needs no permission over it.
        if (access.roleName(roleId) === null) issues.push({ severity: "warning", message: `A role reward is for a role that was deleted (${roleId}).`, page: "leveling" });
        for (const a of actions ?? []) if (a.type === "giveItem") item(a.itemId, "A role reward", "leveling");
    }

    // ── XP and dailies ──
    channel(config.xp.announceDailyInChannelId, "daily reward announcements", "xp", POST);
    channel(config.xp.streakAnnounceChannelId, "streak announcements", "xp", POST);
    for (const [days, reward] of Object.entries(config.xp.streakRewards ?? {})) {
        channel(reward?.channelId, `the ${days}-day streak reward`, "xp", POST);
    }

    // ── Shop ──
    const visibleItems = Object.values(items).filter((i) => !i.hidden);
    if (config.shop?.enabled && visibleItems.length === 0) {
        issues.push({ severity: "warning", message: "The shop is open but has nothing for sale.", page: "shop" });
    }
    if (config.shop?.gifting?.enabled) channel(config.shop.gifting.announceChannel, "gift announcements", "shop", POST);
    for (const it of Object.values(items)) {
        for (const a of Object.values(it.actions ?? {})) {
            if (a.type === "assignRole" || a.type === "removeRole") role(a.roleId, `the item ${it.name}`, "items");
            if (a.type === "sendMessage") channel(a.channelId, `the item ${it.name}'s message`, "items", POST);
            if (a.type === "giveItem") item(a.itemId, `The item ${it.name}`, "items");
        }
    }

    // ── Combat ──
    if (config.combat.enabled) {
        const enemies = Object.values(config.combat.enemies ?? {});
        const normal = enemies.filter((e) => !e.boss);
        if (normal.length === 0) {
            issues.push({ severity: "warning", message: "Combat is on but there are no enemies to fight.", page: "combat" });
        }
        if (config.combat.bosses?.enabled && !enemies.some((e) => e.boss)) {
            issues.push({ severity: "warning", message: "Random world bosses are on, but no enemy is marked as a world boss.", page: "combat" });
        }
        if (config.combat.encounters?.enabled) {
            for (const id of config.combat.encounters.channelIds ?? []) channel(id, "random encounters", "combat", POST_EMBED);
        }
        if (config.combat.bosses?.enabled) {
            for (const id of config.combat.bosses.channelIds ?? []) channel(id, "world bosses", "combat", POST_EMBED);
        }
        for (const e of enemies) for (const d of e.drops ?? []) item(d.itemId, `The enemy ${e.name}`, "combat");

        // Places: the server's channels as its map.
        for (const place of Object.values(config.combat.places ?? {})) {
            const pool = (place.enemies ?? []).filter((p) => (p.weight ?? 1) > 0);
            if (!place.channelIds?.length) issues.push({ severity: "warning", message: `The place ${place.name} isn't tied to any channel yet, so nobody can find it. Pick its channels on the Combat page's Places tab.`, page: "combat" });
            if (!pool.length) issues.push({ severity: "warning", message: `Nothing lives in the place ${place.name}: give it some enemies.`, page: "combat" });
            for (const p of pool) {
                const e = config.combat.enemies?.[p.enemyId];
                if (!e) issues.push({ severity: "warning", message: `The place ${place.name} has an enemy that was deleted (${p.enemyId}).`, page: "combat" });
                else if (e.boss) issues.push({ severity: "warning", message: `The place ${place.name} lists the world boss ${e.name}, which only comes as a boss.`, page: "combat" });
            }
            const perms: Perm[] = (place.fights ?? "thread") === "thread" ? [...POST_EMBED, "threads", "threadSend"] : POST_EMBED;
            for (const id of place.channelIds ?? []) channel(id, `${place.name} fights`, "combat", perms);
        }

        // Moves: anything missing falls back to a plain attack in a fight, so these only warn.
        const moves = movesOf(config);
        const statuses = statusesOf(config);
        const warn = (message: string, page: DashboardPage = "combat") => issues.push({ severity: "warning", message, page });
        for (const e of enemies) for (const m of e.moves ?? []) {
            if (!moves[m.moveId]) warn(`The enemy ${e.name} uses a move that was deleted (${m.moveId}); it attacks instead.`);
        }
        for (const m of Object.values(moves)) {
            if (!m.effects?.length) warn(`The move ${m.name} does nothing. Give it an effect.`);
            for (const ef of m.effects ?? []) {
                const statusId = ef.type === "status" ? ef.statusId : ef.when?.type === "targetHasStatus" ? ef.when.statusId : null;
                if (statusId && !statuses[statusId]) warn(`The move ${m.name} uses a status that was deleted (${statusId}).`);
            }
        }
        if (!Object.values(moves).some((m) => m.players)) warn("No move is marked for players, so members can only Attack.");
        const reachable = new Set<string>();
        for (const it of Object.values(items)) {
            for (const id of it.effects?.moves ?? []) {
                reachable.add(id);
                if (!moves[id]) warn(`The item ${it.name} gives a move that was deleted (${id}).`, "items");
            }
            for (const a of Object.values(it.actions ?? {})) {
                if (a.type !== "learnMove") continue;
                reachable.add(a.moveId ?? "");
                if (!moves[a.moveId ?? ""]?.players) warn(`The scroll ${it.name} teaches a move players can't have (${a.moveId || "none picked"}).`, "items");
            }
        }
        for (const m of Object.values(moves)) {
            if (m.players?.learned && !reachable.has(m.id)) warn(`The move ${m.name} must be learned, but no scroll teaches it and no gear gives it.`);
        }
    }

    // ── Quests ──
    if (config.quests?.enabled) {
        const active = Object.values(config.quests.quests ?? {}).filter((q) => q.active !== false);
        if (active.length === 0) issues.push({ severity: "warning", message: "Quests are on but none are active.", page: "quests" });
        channel(config.quests.announceAllId, "quest announcements", "quests", POST);
        for (const q of active) {
            channel(q.overrideChannelId, `the quest ${q.name}'s announcements`, "quests", POST);
            for (const r of Object.values(q.reward ?? {})) {
                role(r.roleId, `the quest ${q.name}`, "quests");
                item(r.itemId, `The quest ${q.name}`, "quests");
                channel(r.channelId, `the quest ${q.name}'s reward message`, "quests", POST);
            }
        }
    }

    // ── Achievements ──
    if (config.achievements?.enabled) {
        const all = Object.values(config.achievements.achievements ?? {});
        if (all.length === 0) issues.push({ severity: "warning", message: "Achievements are on but none exist yet.", page: "achievements" });
        channel(config.achievements.announceAllId, "achievement announcements", "achievements", POST);
        for (const a of all) {
            channel(a.overrideChannelId, `the achievement ${a.name}'s announcements`, "achievements", POST);
            role(a.reward?.roleId, `the achievement ${a.name}`, "achievements");
            item(a.reward?.itemId, `The achievement ${a.name}`, "achievements");
        }
    }

    // ── Gathering ──
    if (config.gathering?.enabled) {
        const activities = Object.values(config.gathering.activities ?? {}).filter((a) => a.enabled !== false);
        if (activities.length === 0) {
            issues.push({ severity: "warning", message: "Gathering is on but there are no activities.", page: "gathering" });
        }
        for (const id of config.gathering.channelIds ?? []) channel(id, "gathering", "gathering", POST);
        for (const a of activities) {
            const locations = Object.values(a.locations ?? {});
            if (!locations.some((l) => (l.minSkill ?? 1) <= 1)) {
                issues.push({ severity: "warning", message: `Nobody can start ${a.name}: it has no location open at skill 1.`, page: "gathering" });
            }
            for (const l of locations) {
                if ((l.minToolTier ?? 0) > 0 && !Object.values(items).some((i) => i.tool?.activityId === a.id && (i.tool.tier ?? 1) >= l.minToolTier!)) {
                    issues.push({ severity: "warning", message: `${a.name} at ${l.name} needs a tier ${l.minToolTier} tool, but no item is one.`, page: "gathering" });
                }
                if (!(l.loot ?? []).some((x) => x.chance > 0 && items[x.itemId])) {
                    issues.push({ severity: "warning", message: `${a.name} at ${l.name} has nothing to find.`, page: "gathering" });
                }
                for (const x of l.loot ?? []) item(x.itemId, `${a.name} at ${l.name}`, "gathering");
                for (const c of l.conditions ?? []) {
                    if (!config.gathering.conditions?.[c.conditionId]) issues.push({ severity: "warning", message: `${a.name} at ${l.name} can get a condition that was deleted (${c.conditionId}).`, page: "gathering" });
                }
                for (const t of l.traits ?? []) {
                    const elsewhere = (t.effects?.rules ?? []).filter((r) => RULES[r] && RULES[r].game !== a.game);
                    if (elsewhere.length) issues.push({ severity: "warning", message: `${a.name} at ${l.name}: the trait ${t.name} has rules for another game (${elsewhere.map((r) => RULES[r].name).join(", ")}), which do nothing here.`, page: "gathering" });
                }
            }
        }
    }

    // ── Crafting ──
    const taught = new Set(Object.values(items).flatMap((it) => Object.values(it.actions ?? {})
        .filter((a) => a?.type === "learnRecipe").map((a) => `${a.stationId}/${a.recipeId}`)));
    if (config.crafting?.enabled) {
        const stations = Object.values(config.crafting.stations ?? {}).filter((s) => s.enabled !== false);
        if (stations.length === 0) {
            issues.push({ severity: "warning", message: "Crafting is on but there are no stations.", page: "crafting" });
        }
        for (const st of stations) {
            const recipes = Object.values(st.recipes ?? {});
            if (!recipes.some((r) => (r.minSkill ?? 1) <= 1 && !r.hidden)) {
                issues.push({ severity: "warning", message: `Nobody can start ${st.name}: it has no recipe open at skill 1.`, page: "crafting" });
            }
            for (const r of recipes) {
                const name = items[r.output?.itemId]?.name ?? "a recipe";
                item(r.output?.itemId, `${st.name}'s recipe for ${name}`, "crafting");
                if ((r.inputs ?? []).some((i) => !items[i.itemId])) {
                    issues.push({ severity: "warning", message: `${st.name}'s recipe for ${name} needs an item that no longer exists, so nobody can make it.`, page: "crafting" });
                }
                if (r.hidden && !taught.has(`${st.id}/${r.id}`)) {
                    issues.push({ severity: "warning", message: `${st.name}'s recipe for ${name} is hidden, but no item teaches it. Make a recipe scroll on the Items page, or unhide it.`, page: "crafting" });
                }
            }
        }
    }

    // Recipe scrolls pointing at a station or recipe that's gone teach nothing.
    for (const it of Object.values(items)) {
        for (const a of Object.values(it.actions ?? {})) {
            if (a?.type === "learnRecipe" && !config.crafting?.stations?.[a.stationId ?? ""]?.recipes?.[a.recipeId ?? ""]) {
                issues.push({ severity: "warning", message: `${it.name} teaches a recipe that no longer exists.`, page: "items" });
            }
        }
    }

    // ── Requirements ── (a gate on a deleted role or skill quietly stops gating)
    const reqs = (req: Requirements | undefined, what: string, page: DashboardPage) => {
        for (const id of req?.roles ?? []) {
            if (access.roleName(id) === null) issues.push({ severity: "warning", message: `${what} needs a role that was deleted, so that condition is ignored.`, page });
        }
        for (const id of Object.keys(req?.skills ?? {})) {
            if (!config.gathering?.activities?.[id] && !config.crafting?.stations?.[id]) {
                issues.push({ severity: "warning", message: `${what} needs a skill that no longer exists, so that condition is ignored.`, page });
            }
        }
    };
    for (const it of Object.values(items)) reqs(it.requirements, `The item ${it.name}`, "items");
    for (const e of Object.values(config.combat.enemies ?? {})) reqs(e.requirements, `The enemy ${e.name}`, "combat");
    for (const q of Object.values(config.quests?.quests ?? {})) reqs(q.requirements, `The quest ${q.name}`, "quests");
    for (const a of Object.values(config.gathering?.activities ?? {})) {
        for (const l of Object.values(a.locations ?? {})) reqs(l.requirements, `${a.name} at ${l.name}`, "gathering");
    }
    for (const st of Object.values(config.crafting?.stations ?? {})) {
        for (const r of Object.values(st.recipes ?? {})) reqs(r.requirements, `${st.name}'s recipe for ${items[r.output?.itemId]?.name ?? "an item"}`, "crafting");
    }

    // ── Logging ──
    if (config.logging?.enabled) {
        if (!config.logging.mainChannelId) {
            issues.push({ severity: "warning", message: "Logging is on but has no channel to post in.", page: "logging" });
        }
        channel(config.logging.mainChannelId, "logs", "logging", POST_EMBED);
        for (const [category, target] of Object.entries(config.logging.allowedCategories ?? {})) {
            if (typeof target === "string") channel(target, `${category} logs`, "logging", POST_EMBED);
        }
    }

    // Errors first: they break things today; warnings are things that do nothing.
    return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
}

/** The real Access, read from the bot's view of the guild. */
export function discordAccess(guild: Guild): Access {
    const me = guild.members.me;
    const FLAGS = {
        view: PermissionFlagsBits.ViewChannel,
        send: PermissionFlagsBits.SendMessages,
        embed: PermissionFlagsBits.EmbedLinks,
        files: PermissionFlagsBits.AttachFiles,
        threads: PermissionFlagsBits.CreatePublicThreads,
        threadSend: PermissionFlagsBits.SendMessagesInThreads,
    } as const;
    return {
        channelName: (id) => guild.channels.cache.get(id)?.name ?? null,
        missingIn: (id, perms) => {
            const ch = guild.channels.cache.get(id);
            const allowed = me && ch ? ch.permissionsFor(me) : null;
            return perms.filter((p) => !allowed?.has(FLAGS[p]));
        },
        roleName: (id) => guild.roles.cache.get(id)?.name ?? null,
        canManageRole: (id) => guild.roles.cache.get(id)?.editable ?? false,
    };
}
