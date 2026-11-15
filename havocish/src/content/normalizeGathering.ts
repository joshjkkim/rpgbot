/** Read compatibility for the former Dig id and retired one-click Grid settings. */
export function gridRule(rule: string): string {
    if (rule.startsWith("dig.")) return `grid.${rule.slice(4)}`;
    if (rule === "grid.clustered") return "grid.seams";
    if (rule === "grid.unstable") return "grid.loose";
    return rule;
}

type Effects = { rules?: string[] };
type Location = { difficulty?: Record<string, number>; traits?: { effects: Effects }[] };
type Activity = { game: string; words?: Record<string, string>; locations: Record<string, Location> };

const effects = <T extends Effects>(e: T): T => ({ ...e, ...(e.rules && { rules: [...new Set(e.rules.map(gridRule))] }) });

export function normalizeGathering<T extends { activities: Record<string, Activity>; conditions?: Record<string, { effects: Effects }> }>(g: T): T {
    return {
        ...g,
        activities: Object.fromEntries(Object.entries(g.activities ?? {}).map(([id, a]) => {
            if (a.game !== "grid" && a.game !== "dig") return [id, a];
            const words = { ...a.words };
            if (!words.rock && words.tile) words.rock = words.tile;
            if (!words.loose && words.hazard) words.loose = words.hazard;
            return [id, {
                ...a, game: "grid", words,
                locations: Object.fromEntries(Object.entries(a.locations ?? {}).map(([lid, l]) => {
                    const d = { ...l.difficulty };
                    // Old reveal-grid tries (one tile each) aren't swings; dropping them gives the default 12.
                    delete d.tries;
                    for (const [old, current] of [["finds", "ores"], ["hazards", "loose"]]) {
                        if (d[current!] === undefined && d[old!] !== undefined) d[current!] = d[old!]!;
                        delete d[old!];
                    }
                    return [lid, { ...l, difficulty: d, ...(l.traits && { traits: l.traits.map((t) => ({ ...t, effects: effects(t.effects) })) }) }];
                })),
            }];
        })),
        ...(g.conditions && { conditions: Object.fromEntries(Object.entries(g.conditions).map(([id, c]) => [id, { ...c, effects: effects(c.effects) }])) }),
    } as T;
}
