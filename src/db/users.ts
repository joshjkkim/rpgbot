import { query } from "./index.js";

export interface DbUser {
  id: number;
  discord_user_id: string; // store snowflakes as text or bigint
  username: string | null;
  avatar_url: string | null;
  created_at: string; // timestamp as ISO string
}

type UpsertUserArgs = {
  discordUserId: string;
  username?: string;
  avatarUrl?: string | null;
};

export async function upsertUser(args: UpsertUserArgs): Promise<DbUser> {
  const { discordUserId, username, avatarUrl } = args;

  const result = await query<DbUser>(
    `
    INSERT INTO users (discord_user_id, username, avatar_url)
    VALUES ($1, $2, $3)
    ON CONFLICT (discord_user_id)
    DO UPDATE SET
      username = EXCLUDED.username,
      avatar_url = EXCLUDED.avatar_url
    RETURNING *;
    `,
    [discordUserId, username ?? null, avatarUrl ?? null]
  );

  if (!result.rows[0]) {
    throw new Error("Failed to upsert user");
  }
  return result.rows[0];
}

export async function getUserByDiscordId(
  discordUserId: string
): Promise<DbUser | null> {
  const result = await query<DbUser>(
    `SELECT * FROM users WHERE discord_user_id = $1`,
    [discordUserId]
  );
  return result.rows[0] ?? null;
}
