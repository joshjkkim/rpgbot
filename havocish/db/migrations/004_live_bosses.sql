-- 004: world bosses survive a restart.
--
-- A live boss used to exist only in the bot's memory, so every deploy or crash
-- made one vanish mid-fight, damage and all. Each live boss now has a row here,
-- written when it spawns, as it takes damage (batched with the message redraw)
-- and on shutdown, and deleted when it falls or escapes. At startup the bot
-- reloads every row and re-attaches to the boss's message.
--
-- `enemy` is a snapshot, so editing the enemy on the dashboard mid-fight does
-- not change the boss being fought. One boss per guild, hence the key.

BEGIN;

CREATE TABLE IF NOT EXISTS public.live_bosses (
    discord_guild_id BIGINT      PRIMARY KEY,
    channel_id       BIGINT      NOT NULL,
    message_id       BIGINT      NOT NULL,
    enemy            JSONB       NOT NULL,
    hp               INTEGER     NOT NULL,
    ends_at          TIMESTAMPTZ NOT NULL,
    fighters         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
