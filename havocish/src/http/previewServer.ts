import { createServer, type IncomingMessage } from "node:http";
import type { Client } from "discord.js";
import { checkGuild, discordAccess } from "../health/checkGuild.js";
import { timingSafeEqual } from "node:crypto";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { calculateTotalXpForLevel } from "../leveling/levels.js";
import { buildFantasyProfileCard, buildProfileCard } from "../commands/user/profile.js";
import { renderLevelUpBanner } from "../ui/canvas/levelUpBanner.js";
import type { GuildConfig } from "../types/guild.js";

/**
 * Renders profile cards and level-up banners for the dashboard's Style page, so
 * owners see the real image while they edit, drawn by the same code /profile uses.
 *
 * The dashboard checks that the caller owns the server, then forwards here with
 * PREVIEW_SECRET. Without that secret set the server does not start at all.
 *
 *   POST /preview  { guildId, kind: "profile" | "levelup", style, user: { username, avatarUrl } }
 *   -> image/png
 *
 * It also answers the Overview's health check (src/health/checkGuild.ts), which
 * needs the bot's own view of the server's channels, roles and permissions:
 *
 *   POST /health   { guildId }  ->  { inGuild: false } | { inGuild: true, issues: Issue[] }
 */

const MAX_BODY = 16 * 1024;
const PREVIEW_LEVEL = 12;
const DEFAULT_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";

/** The caller's fault: answered 400. Anything else is ours: 500. */
class BadRequest extends Error {}

function secretMatches(given: string | undefined, secret: string) {
    const a = Buffer.from(given ?? "");
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(req: IncomingMessage): Promise<any> {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) throw new BadRequest("body too large");
        chunks.push(chunk);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw new BadRequest("invalid JSON");
    }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

function label(saved: { icon?: string; name?: string } | undefined, draft: any) {
    const icon = str(draft?.icon, 64), name = str(draft?.name, 32);
    return { ...saved, ...(icon !== undefined && { icon }), ...(name !== undefined && { name }) };
}

/** Only the style fields the cards read, each a short string. Everything else keeps the saved value. */
function draftStyle(saved: GuildConfig["style"], draft: any): GuildConfig["style"] {
    return {
        ...saved,
        template: draft?.template === "fantasy" ? "fantasy" : "default",
        mainThemeColor: str(draft?.mainThemeColor, 32) ?? saved.mainThemeColor,
        mainTextColor: str(draft?.mainTextColor, 32) ?? saved.mainTextColor,
        gold: label(saved.gold, draft?.gold),
        xp: label(saved.xp, draft?.xp),
    };
}

async function render(body: any): Promise<Buffer> {
    const guildId = str(body?.guildId, 32);
    if (!guildId || !/^\d+$/.test(guildId)) throw new BadRequest("bad guildId");

    const { config: saved } = await getOrCreateGuildConfig({ discordGuildId: guildId });
    const config: GuildConfig = { ...saved, style: draftStyle(saved.style, body.style) };

    // The bot fetches this URL, so only Discord's CDN is allowed.
    const avatar = str(body?.user?.avatarUrl, 512);
    const who = {
        username: str(body?.user?.username, 64) || "Adventurer",
        avatarUrl: avatar?.startsWith("https://cdn.discordapp.com/") ? avatar : DEFAULT_AVATAR,
    };

    if (body.kind === "levelup") {
        const banner = await renderLevelUpBanner({
            name: who.username, avatarUrl: who.avatarUrl, level: PREVIEW_LEVEL, accent: config.style.mainThemeColor,
        });
        return banner.attachment as Buffer;
    }

    // A sample member two-thirds of the way through level 12 on this server's curve.
    const from = calculateTotalXpForLevel(PREVIEW_LEVEL, config);
    const to = calculateTotalXpForLevel(PREVIEW_LEVEL + 1, config);
    const profile: any = {
        xp: String(Math.round(from + (to - from) * 0.68)), level: PREVIEW_LEVEL, gold: "1840", streak_count: 7,
        inventory: {}, equips: {}, user_stats: {}, achievements: {}, quests: {}, temp_roles: {},
    };
    const card = config.style.template === "fantasy"
        ? await buildFantasyProfileCard(who, profile, config)
        : await buildProfileCard(who, profile, config);
    return card.attachment as Buffer;
}

async function health(body: any, client: Client) {
    const guildId = str(body?.guildId, 32);
    if (!guildId || !/^\d+$/.test(guildId)) throw new BadRequest("bad guildId");
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return { inGuild: false };
    const { config } = await getOrCreateGuildConfig({ discordGuildId: guildId });
    return { inGuild: true, issues: checkGuild(config, discordAccess(guild)) };
}

export function startPreviewServer(client: Client) {
    const secret = process.env.PREVIEW_SECRET?.trim();
    if (!secret) {
        console.log("Style previews: off (PREVIEW_SECRET unset).");
        return null;
    }
    const port = Number(process.env.PORT) || 8080;

    const server = createServer(async (req, res) => {
        if (req.method !== "POST" || (req.url !== "/preview" && req.url !== "/health")) {
            res.writeHead(404).end();
            return;
        }
        if (!secretMatches(req.headers["x-preview-secret"] as string | undefined, secret)) {
            res.writeHead(401).end();
            return;
        }
        try {
            if (req.url === "/health") {
                const report = await health(await readJson(req), client);
                res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(report));
                return;
            }
            const png = await render(await readJson(req));
            res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" }).end(png);
        } catch (err) {
            if (!(err instanceof BadRequest)) console.error("Preview render failed:", err);
            if (!res.headersSent) res.writeHead(err instanceof BadRequest ? 400 : 500).end();
        }
    });
    server.listen(port, () => console.log(`Style previews: listening on :${port}.`));
    return server;
}
