import { query } from "../db/index.js";
import type { QueryResultRow } from "pg";
import type { item } from "../db/userGuildProfiles.js";

export async function updateInventory(userId: number, guildId: number, inventory: Record<string, item>, newGoldBalance: number): Promise<void> {
    await query(
        `
        UPDATE user_guild_profiles
        SET inventory = $3, gold = $4, updated_at = NOW()
        WHERE user_id = $1 AND guild_id = $2;
        `,
        [userId, guildId, JSON.stringify(inventory), newGoldBalance]
    );
}

export async function getInventory(userId: number, guildId: number): Promise<Record<string, item>> {
    const result = await query<{ inventory: Record<string, item> }>(
        `
        SELECT inventory FROM user_guild_profiles
        WHERE user_id = $1 AND guild_id = $2;
        `,
        [userId, guildId]
    );

    if (result.rows.length === 0 || !result.rows[0] || !result.rows[0].inventory) {
        return {};
    }

    return result.rows[0].inventory;
}   