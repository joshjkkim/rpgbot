import type { ActionRowBuilder, ButtonBuilder, Message } from "discord.js";
import type { GatheringActivity, GatheringLocation } from "../../types/gathering.js";
import type { GuildConfig } from "../../types/guild.js";

/**
 * What every gathering minigame shares. A game only decides what a run looks
 * like and what a click does; commands/user/gather.ts owns starting, timing out
 * and paying out runs, so adding a game never touches that.
 */

export type Run = {
    ownerId: string;
    discordGuildId: string;
    userId: number;
    guildId: number;
    activity: GatheringActivity;
    location: GatheringLocation;
    skill: number;
    /** The tool in use, if any, and its bonus (0 without one). */
    toolId: string | null;
    toolBonus: number;
    /** "⚡ 6/10": energy left after this run's point was spent. */
    energyLabel: string;
    /** Item id -> quantity found so far. */
    found: Record<string, number>;
    /** What just happened, shown under the header. */
    status: string | null;
    message: Message | null;
    /** The game's own timer (a bite, a round's deadline). One at a time. */
    timer: NodeJS.Timeout | null;
    /** Ends a run nobody finishes. */
    deadline: NodeJS.Timeout | null;
    // Each game keeps its own state here.
    state: any;
};

export type EndReason = "leave" | "out" | "hazard" | "timeout";

export type Words = Record<string, string>;

export interface Ctx {
    config: GuildConfig;
    /** False once the run has ended; timers check it before touching anything. */
    alive(): boolean;
    /** Re-draws the run's message (for changes made by timers, not clicks). */
    refresh(): Promise<void>;
    end(why: EndReason): Promise<void>;
    /** Runs `fn` after `ms`, replacing the game's previous timer. */
    later(ms: number, fn: () => void | Promise<void>): void;
}

export interface Game<S = any> {
    /** Defaults for every word players see; owners override any per activity. */
    words: Words;
    /** The game's starting state for this run. */
    start(run: Run, w: Words, ctx: Ctx): S;
    /** Lines under the header, and the game's button rows. Leave is added after them. */
    body(run: Run, s: S, w: Words, config: GuildConfig): { text: string; rows: ActionRowBuilder<ButtonBuilder>[] };
    /** A click. Returns why the run ends, or nothing to keep going. `at` is when the player clicked. */
    click(run: Run, s: S, w: Words, action: string, arg: string, at: number, ctx: Ctx): EndReason | void | Promise<EndReason | void>;
}

export const itemLabel = (config: GuildConfig, id: string, n?: number) => {
    const def = config.shop?.items?.[id];
    return `${def?.emoji ? `${def.emoji} ` : ""}${def?.name ?? id}${n != null ? ` ×${n}` : ""}`;
};

export const addFind = (run: Run, drop: { itemId: string; quantity: number }) => {
    run.found[drop.itemId] = (run.found[drop.itemId] ?? 0) + drop.quantity;
};

/** A word with "{name}" placeholders filled in. */
export const fill = (word: string, values: Record<string, string>) =>
    word.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
