import { query } from "../db/index.js";
import type { GuildConfig } from "../types/guild.js";
import type { LogEvent } from "../types/logging.js";
import { EmbedBuilder, type BaseInteraction, type ColorResolvable, type Guild, type GuildTextBasedChannel } from "discord.js";

export async function logEvent(opts: LogEvent): Promise<void> {
    const { guildId, userId, targetUserId, category, eventType, source, xpDelta, goldDelta, streakDelta, levelDelta, itemId, itemQuantity, oldLevel, newLevel, oldStreak, newStreak, metaData } = opts;

    await query(
        `INSERT INTO events
        (guild_id, user_id, target_user_id, category, event_type, source,
         xp_delta, gold_delta, streak_delta, level_delta,
         item_id, quantity,
         old_level, new_level,
         old_streak, new_streak,
         metadata, timestamp)
        VALUES
        ($1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12,
         $13, $14,
         $15, $16,
         $17, NOW())`,
        [
            guildId,
            userId,
            targetUserId ?? null,
            category,
            eventType,
            source ?? null,
            xpDelta ?? null,
            goldDelta ?? null,
            streakDelta ?? null,
            levelDelta ?? null,
            itemId ?? null,
            itemQuantity ?? null,
            oldLevel ?? null,
            newLevel ?? null,
            oldStreak ?? null,
            newStreak ?? null,
            metaData ? JSON.stringify(metaData) : null,
        ]
    );
}

export type LogContext = BaseInteraction | Guild | null;

export async function sendServerLogEvent(ctx: LogContext, event: LogEvent, config: GuildConfig): Promise<void> {
    if (!config.logging?.enabled) return;
    if (!ctx) return;

    let guild: Guild | null = null;

    if ("guild" in ctx) {
        guild = ctx.guild ?? null;
    } else {
        guild = ctx;
    }

    if (!guild) return;

    const loggingCfg = config.logging!;

    const categoryCfg = loggingCfg.allowedCategories?.[event.category];

    if (categoryCfg === false) {
        return;
    }

    const channelId =
        typeof categoryCfg === "string"
        ? categoryCfg
        : loggingCfg.mainChannelId;

    if (!channelId) {
        return;
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !channel.isSendable()) {
        return;
    }

    const themeColor = (config.style.mainThemeColor || "#00AE86") as ColorResolvable;

    const deltas: string[] = [];
    if (event.goldDelta != null) deltas.push(`Gold: ${event.goldDelta >= 0 ? "+" : ""}${event.goldDelta}`);
    if (event.xpDelta != null) deltas.push(`XP: ${event.xpDelta >= 0 ? "+" : ""}${event.xpDelta}`);
    if (event.streakDelta != null) deltas.push(`Streak: ${event.streakDelta >= 0 ? "+" : ""}${event.streakDelta}`);
    if (event.levelDelta != null) deltas.push(`Level: ${event.levelDelta >= 0 ? "+" : ""}${event.levelDelta}`);

    const deltasLine = deltas.length > 0 ? deltas.join(" • ") : "No numeric changes recorded";

    const embed = new EmbedBuilder()
        .setColor(themeColor)
        .setTitle(`📜 ${event.category} • ${event.eventType}`)
        .setTimestamp(event.timestamp ?? new Date());

    const actorDiscordId = event.metaData && (event.metaData["actorDiscordId"] as string | undefined);
    const targetDiscordId = event.metaData && (event.metaData["targetDiscordId"] as string | undefined);

    let userFieldValue = actorDiscordId
    ? `<@${actorDiscordId}>`
    : `User ID: ${event.userId}`;

    if (event.targetUserId) {
        userFieldValue += targetDiscordId
        ? ` → <@${targetDiscordId}>`
        : ` → User ID: ${event.targetUserId}`;
    }

    embed.addFields({
        name: "User",
        value: userFieldValue,
    });

    if (event.itemId) {
        embed.addFields({
        name: "Item",
        value: `\`${event.itemId}\`${event.itemQuantity ? ` x${event.itemQuantity}` : ""}`,
        });
    }

    embed.addFields({
        name: "Source",
        value: event.source ? `\`${event.source}\`` : "N/A",
    })

    embed.addFields({
        name: "Changes",
        value: deltasLine,
    });

    embed.addFields({
        name: "Metadata",
        value: `\`\`\`json\n${event.metaData ? JSON.stringify(event.metaData, null, 2) : "N/A"}\n\`\`\``,
    });


    if (event.source) {
        embed.setFooter({ text: `Source: ${event.source}` });
    }

  await (channel as GuildTextBasedChannel).send({ embeds: [embed] });
}

const LOG_BUFFER: LogEvent[] = [];
const MAX_SIZE = 100;
let isFlushing = false;

export function enqueueLogEvent(event: LogEvent): void {
    LOG_BUFFER.push(event);
}

export async function logAndBroadcastEvent(ctx: LogContext, event: LogEvent, config: GuildConfig): Promise<void> {
    
    await sendServerLogEvent(ctx, event, config);

    enqueueLogEvent(event);

    if (LOG_BUFFER.length >= MAX_SIZE) {
        void flushLogBuffer();
    }
}

export async function flushLogBuffer(): Promise<void> {
    if(isFlushing) return;
    if(LOG_BUFFER.length === 0) return;

    isFlushing = true;

    try {
        const batch = LOG_BUFFER.splice(0, LOG_BUFFER.length);
        if (batch.length === 0) return;

        const values: any[] = [];
        const valuePlaceholders: string[] = [];

        let idx = 1;

        for (const event of batch) {
            valuePlaceholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++},
                                    $${idx++}, $${idx++}, $${idx++}, $${idx++},
                                    $${idx++}, $${idx++},
                                    $${idx++}, $${idx++},
                                    $${idx++}, $${idx++},
                                    $${idx++}, $${idx++})`);
            values.push(
                event.guildId,
                event.userId,
                event.targetUserId ?? null,
                event.category,
                event.eventType,
                event.source ?? null,
                event.xpDelta ?? null,
                event.goldDelta ?? null,
                event.streakDelta ?? null,
                event.levelDelta ?? null,
                event.itemId ?? null,
                event.itemQuantity ?? null,
                event.oldLevel ?? null,
                event.newLevel ?? null,
                event.oldStreak ?? null,
                event.newStreak ?? null,
                event.metaData ? JSON.stringify(event.metaData) : null,
                event.timestamp ?? new Date()
            );
        }

        const sql = `
            INSERT INTO events
            (guild_id, user_id, target_user_id, category, event_type, source,
             xp_delta, gold_delta, streak_delta, level_delta,
             item_id, quantity,
             old_level, new_level,
             old_streak, new_streak,
             metadata, timestamp)
            VALUES
            ${valuePlaceholders.join(", ")}
        `;

        await query(sql, values);
    } catch (err) {
        console.error("Error flushing log buffer:", err);
    } finally {
        isFlushing = false;
    }
}