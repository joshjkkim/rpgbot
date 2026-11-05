-- 014: Where setup changes come from.
--
-- config_history gets a source (dashboard, or discord for everything the bot
-- writes), set by the dashboard's save through the havocish.source setting.
-- And a purchase taking an item's stock, which rewrites the config, no longer
-- counts as a setup change: the shop sets havocish.history to 'skip'.

BEGIN;

ALTER TABLE public.config_history ADD COLUMN IF NOT EXISTS source TEXT;

CREATE OR REPLACE FUNCTION public.track_guild() RETURNS trigger AS $$
DECLARE
    src TEXT := coalesce(nullif(current_setting('havocish.source', true), ''), 'discord');
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.guild_log (discord_guild_id, event) VALUES (NEW.discord_guild_id, 'joined');
        RETURN NEW;
    END IF;
    IF OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL THEN
        INSERT INTO public.guild_log (discord_guild_id, event) VALUES (NEW.discord_guild_id, 'left');
    ELSIF OLD.removed_at IS NOT NULL AND NEW.removed_at IS NULL THEN
        INSERT INTO public.guild_log (discord_guild_id, event) VALUES (NEW.discord_guild_id, 'rejoined');
    END IF;
    -- A write that sets havocish.history to 'skip' (a purchase taking an item's stock) isn't a setup change.
    IF NEW.config IS DISTINCT FROM OLD.config AND NEW.config IS NOT NULL
       AND coalesce(current_setting('havocish.history', true), '') <> 'skip' THEN
        -- The first tracked change also keeps the version before it, so it has something to compare with.
        IF OLD.config IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.config_history WHERE discord_guild_id = NEW.discord_guild_id) THEN
            INSERT INTO public.config_history (discord_guild_id, config) VALUES (NEW.discord_guild_id, OLD.config);
        END IF;
        INSERT INTO public.config_history (discord_guild_id, config, source) VALUES (NEW.discord_guild_id, NEW.config, src);
        DELETE FROM public.config_history WHERE discord_guild_id = NEW.discord_guild_id AND id <= (
            SELECT id FROM public.config_history WHERE discord_guild_id = NEW.discord_guild_id ORDER BY id DESC OFFSET 50 LIMIT 1);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
