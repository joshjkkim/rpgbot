export type EventCategory = 
    "economy" 
    | "xp" 
    | "daily" 
    | "streak" 
    | "level" 
    | "config" 
    | "inventory" 
    | "admin"
    | "quests";

export type EventType = 
    "buy" 
    | "sell" 
    | "use" 
    | "grantDaily"
    | "streakIncrement" 
    | "streakReset" 
    | "messageXp" 
    | "vcXp" 
    | "levelUp" 
    | "configChange" 
    | "giveitem" 
    | "removeitem" 
    | "clearinventory" 
    | "setxp"
    | "setlevel"
    | "setgold"
    | "setstreak"
    | "startQuest"
    | "claimQuest"
    | "giftItem";


export interface LogEvent {
    guildId: number;
    discordGuildId: string;
    userId: number;
    targetUserId?: number;

    category: EventCategory;
    eventType: EventType;
    source?: string | null;

    xpDelta?: number | null;
    goldDelta?: number | null;
    streakDelta?: number | null;
    levelDelta?: number | null;
    itemId?: string | null;
    itemQuantity?: number | null;

    oldLevel?: number | null;
    newLevel?: number | null;
    oldStreak?: number | null;
    newStreak?: number | null;

    questId?: string | null;

    metaData?: Record<string, unknown> | null;
    timestamp: Date;
}