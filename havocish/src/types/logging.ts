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

/** What players did, recorded for /admin only (recordActivity): never posted to a log channel, so no switch for it there. */
export type ActivityCategory = "combat" | "gathering" | "crafting";

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
    | "giftItem"
    | "duel"
    | "fight"
    | "gather"
    | "craft"
    | "upgrade";


export interface LogEvent {
    guildId: number;
    /** Looked up from guildId when the event is written, if left out. */
    discordGuildId?: string;
    userId: number;
    targetUserId?: number;

    category: EventCategory | ActivityCategory;
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