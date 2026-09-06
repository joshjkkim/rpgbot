/**
 * Structural validation for a guild config posted by the dashboard.
 *
 * This is deliberately not a full schema check -- the config tree is large and
 * still moving, and `mergeConfig` on the bot side fills in anything absent. What
 * it does catch is the shape being wrong in ways that break the bot for a whole
 * guild: a section arriving as an array, a string, or null where the bot will
 * index into it, or a payload large enough to be a problem on its own.
 */

/** Sections the bot reads as plain objects. Any of them may be absent. */
const OBJECT_SECTIONS = [
    "xp", "levels", "shop", "quests", "combat",
    "achievements", "logging", "style", "trading",
] as const;

/** Maps keyed by id, which break loudly if they arrive as arrays. */
const KEYED_MAPS: ReadonlyArray<readonly [string, string]> = [
    ["shop", "items"],
    ["shop", "categories"],
    ["combat", "enemies"],
    ["xp", "xpChannelIds"],
];

const MAX_CONFIG_BYTES = 1_000_000;

export type ConfigValidation = { ok: true } | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateGuildConfig(config: unknown): ConfigValidation {
    if (!isPlainObject(config)) {
        return { ok: false, error: "config must be a JSON object" };
    }

    let serialized: string;
    try {
        serialized = JSON.stringify(config);
    } catch {
        return { ok: false, error: "config is not serializable" };
    }

    if (serialized.length > MAX_CONFIG_BYTES) {
        return { ok: false, error: `config is too large (${serialized.length} bytes, limit ${MAX_CONFIG_BYTES})` };
    }

    for (const section of OBJECT_SECTIONS) {
        if (!(section in config)) continue;
        if (!isPlainObject(config[section])) {
            return { ok: false, error: `config.${section} must be an object` };
        }
    }

    for (const [section, key] of KEYED_MAPS) {
        const parent = config[section];
        if (!isPlainObject(parent)) continue;
        if (!(key in parent)) continue;
        if (parent[key] === null || parent[key] === undefined) continue;
        if (!isPlainObject(parent[key])) {
            return { ok: false, error: `config.${section}.${key} must be an object keyed by id` };
        }
    }

    return { ok: true };
}
