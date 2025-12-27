export interface DbUser {
  id: number;
  discord_user_id: string; // store snowflakes as text or bigint
  username: string | null;
  avatar_url: string | null;
  created_at: string; // timestamp as ISO string
}