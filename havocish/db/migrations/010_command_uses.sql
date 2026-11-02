-- 010: Command use counts.
--
-- How many times each slash command was used in each server, a row per server,
-- command and day. Counts only: no users, no options. /admin's server page
-- reads it to see what a server actually does with the bot.

BEGIN;

CREATE TABLE IF NOT EXISTS public.command_uses (
    discord_guild_id BIGINT  NOT NULL,
    command          TEXT    NOT NULL,
    day              DATE    NOT NULL DEFAULT CURRENT_DATE,
    uses             INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (discord_guild_id, command, day)
);

COMMIT;
