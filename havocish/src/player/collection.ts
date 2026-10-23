import type { GuildConfig } from "../types/guild.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";

/**
 * The collection log: every item a server has, grouped by where it comes from,
 * against what a member has ever found (user_stats.found). Built from the
 * config each time, so new content shows up in it on its own.
 */

export type CollectionSource = {
    id: string;
    kind: "enemy" | "gathering" | "crafting" | "shop";
    emoji: string;
    name: string;
    itemIds: string[];
};

const uniq = (ids: string[]) => [...new Set(ids)];

/** Where items come from: each enemy, gathering location, crafting station, and the shop. Empty ones are left out. */
export function collectionSources(config: GuildConfig): CollectionSource[] {
    const items = config.shop?.items ?? {};
    const real = (ids: string[]) => uniq(ids).filter((id) => items[id]);
    const out: CollectionSource[] = [];
    for (const e of Object.values(config.combat?.enemies ?? {})) {
        out.push({ id: `enemy:${e.id}`, kind: "enemy", emoji: e.emoji, name: e.name, itemIds: real((e.drops ?? []).map((d) => d.itemId)) });
    }
    for (const a of Object.values(config.gathering?.activities ?? {})) {
        for (const l of Object.values(a.locations ?? {})) {
            out.push({ id: `gather:${a.id}:${l.id}`, kind: "gathering", emoji: l.emoji || a.emoji, name: l.name, itemIds: real((l.loot ?? []).map((x) => x.itemId)) });
        }
    }
    for (const st of Object.values(config.crafting?.stations ?? {})) {
        const made = Object.values(st.recipes ?? {}).flatMap((r) => [r.output?.itemId, ...(r.masterwork ?? []).map((m) => m.itemId)]);
        out.push({ id: `craft:${st.id}`, kind: "crafting", emoji: st.emoji, name: st.name, itemIds: real(made.filter((x): x is string => !!x)) });
    }
    const forSale = Object.values(items).filter((i) => !i.hidden && i.price > 0).map((i) => i.id);
    out.push({ id: "shop", kind: "shop", emoji: "🛒", name: "The shop", itemIds: real(forSale) });
    return out.filter((s) => s.itemIds.length > 0);
}

/** Found out of total: overall (each item once) and per source. */
export function collectionProgress(profile: DbUserGuildProfile, config: GuildConfig) {
    const found = new Set(profile.user_stats?.found ?? []);
    const sources = collectionSources(config).map((s) => ({ ...s, found: s.itemIds.filter((id) => found.has(id)).length }));
    const all = uniq(sources.flatMap((s) => s.itemIds));
    return { found: all.filter((id) => found.has(id)).length, total: all.length, sources, has: (id: string) => found.has(id) };
}
