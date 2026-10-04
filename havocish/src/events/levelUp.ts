import type { Client } from "discord.js";
import { profileEvents } from "../cache/profileService.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { query } from "../db/index.js";
import { handleLevelUp } from "../leveling/levels.js";

/**
 * Runs the level-up flow (announcement, level roles, level messages) for every
 * level-up, whatever the XP came from: messages, voice, fights, items, quests,
 * achievements. profileEvents only knows DB ids, so look up the Discord ones.
 */
export function registerLevelUps(client: Client) {
    profileEvents.on("levelUp", async (e: { userId: number; guildId: number; fromLevel: number; toLevel: number }) => {
        try {
            const res = await query<{ discord_user_id: string; discord_guild_id: string }>(
                `SELECT u.discord_user_id, g.discord_guild_id FROM users u, guilds g WHERE u.id = $1 AND g.id = $2`,
                [e.userId, e.guildId],
            );
            const ids = res.rows[0];
            if (!ids) return;

            const { config } = await getOrCreateGuildConfig({ discordGuildId: ids.discord_guild_id });
            const member = await client.guilds.cache.get(ids.discord_guild_id)
                ?.members.fetch(ids.discord_user_id).catch(() => null);

            await handleLevelUp({
                client,
                guildId: ids.discord_guild_id,
                userId: ids.discord_user_id,
                member: member ?? null,
                config,
                newLevel: e.toLevel,
                fromLevel: e.fromLevel,
            });
        } catch (err) {
            console.error("Level-up handling failed:", err);
        }
    });
}
