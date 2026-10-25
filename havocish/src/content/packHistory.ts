import { KINDS } from "./library.ts";
import type { GuildConfigJson, StarterPack } from "./packs.ts";

/**
 * Updating a pack a server already has, without touching what the owner made
 * theirs. A field that still holds a value some version of the pack gave it
 * was never edited, so it follows the pack; any other value is the owner's
 * and stays. Nothing is stored per server: the pack's past values come from
 * its history file (scripts/pack-history.ts, from git).
 */

export const PACK_KINDS = KINDS;

/** For each "kind:id", fingerprints of each field's past values (valueHash), the current version's left out. */
export type PackHistory = Record<string, Record<string, string[]>>;

/** JSON with object keys sorted, so the same value always compares equal however it was saved. */
export function stableJson(v: unknown): string {
    if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
    if (v && typeof v === "object") {
        return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
    }
    return JSON.stringify(v) ?? "null";
}

/** A short fingerprint of a value (FNV-1a over its stableJson): history stays small enough to ship to the Library page. */
export function valueHash(v: unknown): string {
    const s = stableJson(v);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(36);
}

type Entry = Record<string, unknown>;
export type FieldChange = { kind: keyof typeof KINDS; id: string; field: string; entry: Entry; value: unknown };

/**
 * What re-adding `pack` would do to entries the server already has: `updates`
 * are fields still as some pack version left them, now different; `kept` are
 * fields the owner changed, left alone.
 */
export function packChanges(config: GuildConfigJson | null, pack: StarterPack): { updates: FieldChange[]; kept: number } {
    const updates: FieldChange[] = [];
    let kept = 0;
    const history = pack.history ?? {};
    for (const [kind, [section, map]] of Object.entries(KINDS) as Array<[keyof typeof KINDS, readonly [string, string]]>) {
        const theirs = (config?.[section]?.[map] ?? {}) as Record<string, Entry>;
        const ours = ((pack.content as unknown as Record<string, Record<string, Record<string, Entry>>>)[section]?.[map]) ?? {};
        for (const [id, packEntry] of Object.entries(ours)) {
            const entry = theirs[id];
            if (!entry) continue;
            for (const [field, value] of Object.entries(packEntry)) {
                // Fields a server's entry doesn't have at all are the fill step's (packs.ts FILLS).
                if (field === "id" || entry[field] === undefined) continue;
                if (stableJson(entry[field]) === stableJson(value)) continue;
                if (history[`${kind}:${id}`]?.[field]?.includes(valueHash(entry[field]))) updates.push({ kind, id, field, entry, value });
                else kept++;
            }
        }
    }
    return { updates, kept };
}
