export type EventCategory = 
    "economy" 
    | "xp" 
    | "daily" 
    | "streak" 
    | "level" 
    | "config" 
    | "inventory" 
    | "admin";

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
    | "setstreak";


export interface LogEvent {
    guildId: number;
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

    metaData?: Record<string, unknown> | null;
    timestamp: Date;
}