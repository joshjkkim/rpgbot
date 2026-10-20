import { dbQuery } from "@/app/lib/db";
import { STARTER_PACKS, type StarterPack } from "@/app/lib/starterPacks";

type Config = Record<string, Record<string, Record<string, unknown>> | undefined>;

/**
 * Every starter pack: the rows of the `starter_packs` table, whose content is
 * read live from each pack's template server, followed by the JSON packs in
 * app/lib/packs that no row has replaced (same id).
 *
 * So a new pack is one INSERT plus a template server edited on the dashboard,
 * and changing a pack is just editing that server. No deploy either way.
 *
 * Keep template servers free of role and channel ids (item role actions, quest
 * announce channels): they are copied as-is and mean nothing in other servers.
 */
export async function loadStarterPacks(): Promise<StarterPack[]> {
    // A database without the table yet (migration 003 not applied) just gets the JSON packs.
    const res = await dbQuery<{ id: string; name: string; description: string; config: Config | null }>(
        `SELECT p.id, p.name, p.description, g.config
         FROM starter_packs p JOIN guilds g ON g.discord_guild_id = p.source_discord_guild_id
         ORDER BY p.position, p.name`,
    ).catch((err: { code?: string }) => {
        if (err.code !== "42P01") console.error("Loading starter packs failed:", err); // 42P01: no such table
        return null;
    });

    const live: StarterPack[] = (res?.rows ?? []).map(({ id, name, description, config: c }) => ({
        id,
        name,
        description,
        content: {
            shop: { categories: c?.shop?.categories ?? {}, items: c?.shop?.items ?? {} },
            combat: { enemies: c?.combat?.enemies ?? {} },
            quests: { quests: c?.quests?.quests ?? {} },
            achievements: { achievements: c?.achievements?.achievements ?? {} },
            gathering: { activities: c?.gathering?.activities ?? {} },
            crafting: { stations: c?.crafting?.stations ?? {} },
        } as StarterPack["content"],
    }));

    const replaced = new Set(live.map((p) => p.id));
    return [...live, ...STARTER_PACKS.filter((p) => !replaced.has(p.id))];
}
