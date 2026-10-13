import { dbQuery } from "@/app/lib/db";
import { STARTER_PACKS, type StarterPack } from "@/app/lib/starterPacks";

/**
 * The starter packs, with their content read live from a template server when
 * STARTER_PACK_GUILD_ID is set. Editing that server on the dashboard then
 * updates the pack for everyone who adds it afterwards, with no deploy; the
 * JSON file is the fallback and supplies the name and description.
 *
 * Keep the template server free of role and channel ids (item role actions,
 * quest announce channels): they are copied as-is and mean nothing elsewhere.
 *
 * ponytail: one template server feeds the first pack. Map pack ids to servers
 * when there is more than one pack.
 */
export async function loadStarterPacks(): Promise<StarterPack[]> {
    const source = process.env.STARTER_PACK_GUILD_ID?.trim();
    if (!source) return STARTER_PACKS;

    type Config = Record<string, Record<string, Record<string, unknown>> | undefined>;
    const res = await dbQuery<{ config: Config | null }>(
        `SELECT config FROM guilds WHERE discord_guild_id = $1`,
        [source],
    ).catch(() => null);
    const c = res?.rows[0]?.config;
    if (!c) return STARTER_PACKS;

    const [first, ...rest] = STARTER_PACKS;
    return [
        {
            ...first!,
            content: {
                shop: { categories: c.shop?.categories ?? {}, items: c.shop?.items ?? {} },
                combat: { enemies: c.combat?.enemies ?? {} },
                quests: { quests: c.quests?.quests ?? {} },
                achievements: { achievements: c.achievements?.achievements ?? {} },
            } as StarterPack["content"],
        },
        ...rest,
    ];
}
