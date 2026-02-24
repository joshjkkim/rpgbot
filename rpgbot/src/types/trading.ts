import type { DbUserGuildProfile } from "./userprofile.js";

export interface Trade {
    asker: DbUserGuildProfile; // dbUser Id
    askerDiscordId: string; // Discord ID of the asker
    receiver: DbUserGuildProfile; // dbUser Id
    receiverDiscordId: string; // Discord ID of the receiver
    askerItems: Record<string, number>; // items being traded by the asker
    askerGold: number; // gold being traded by the asker
    receiverItems: Record<string, number>; // items being traded by the responder
    receiverGold: number; // gold being traded by the responder
}

export type TradeStatus = "pending" | "accepted" | "denied" | "cancelled" | "expired";

export interface DbTrade extends Trade {
    id?: string;
    guildId: string;
    discordGuildId: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
    status: TradeStatus;
}

/** Raw DB row from the trades table (snake_case column names) */
export interface DbTradeRow {
    id: string;
    guild_id: string;
    discord_guild_id: string;
    asker_profile_id: number;
    asker_discord_id: string;
    receiver_profile_id: number;
    receiver_discord_id: string;
    asker_items: Record<string, number> | null;
    receiver_items: Record<string, number> | null;
    asker_gold: string | null;
    receiver_gold: string | null;
    status: TradeStatus;
    created_at: string;
    updated_at: string;
    expires_at: string;
}