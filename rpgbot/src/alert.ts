/**
 * Crash alerting, over a Discord webhook.
 *
 * The bot already flushes and exits non-zero on a crash, and the host restarts
 * it -- but the only trace is a log line nobody is watching, so the first
 * signal that anything broke is a user saying the bot is down. This posts the
 * crash into Discord instead, which is where we already are.
 *
 * Unset ALERT_WEBHOOK_URL = no alerts, and the bot runs exactly as before. It
 * is deliberately not in REQUIRED_ENV: a missing alert channel is not a reason
 * to refuse to start.
 *
 * Create the webhook in the target channel's Integrations settings, then
 * `fly secrets set ALERT_WEBHOOK_URL=...` (bare, no quotes -- see OPERATIONS.md).
 *
 * Verify it end to end with `npm --workspace rpgbot run alert:test`.
 */

import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";

/** Discord's hard limit on `content`; the rest is the header and code fence. */
const MAX_DETAIL = 1800;

/** The message posted for a crash. Pure, so the formatting is checkable. */
export function crashMessage(reason: string, detail: unknown): string {
    const text = detail instanceof Error
        ? (detail.stack ?? `${detail.name}: ${detail.message}`)
        : typeof detail === "string" ? detail
        : safeStringify(detail);

    return `🔴 **rpgbot crashed** — ${reason}\n\`\`\`\n${text.slice(0, MAX_DETAIL)}\n\`\`\``;
}

/** String(x), except objects get their shape shown instead of "[object Object]". */
function safeStringify(value: unknown): string {
    try {
        return typeof value === "object" && value !== null
            ? JSON.stringify(value, null, 2)
            : String(value);
    } catch {
        return String(value);
    }
}

/**
 * Posts to the webhook, if one is configured. Never throws, and never rejects:
 * this runs on the crash path, where a second failure would be the one that
 * actually loses data.
 *
 * The 3s cap matters. This is awaited *before* the shutdown flush, because
 * process.exit() would kill an in-flight request -- 3s here plus the flush's
 * own 10s ceiling stays well inside the host's 20s kill timeout.
 */
export async function postAlert(content: string): Promise<void> {
    const url = process.env.ALERT_WEBHOOK_URL?.trim();
    if (!url) return;

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
            signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) console.error(`Crash alert rejected: ${res.status} ${res.statusText}`);
    } catch (err) {
        // Never echo `url`: it is a credential.
        console.error("Could not post crash alert:", err);
    }
}

/** True when alerting is wired up, for the startup log line. */
export const alertsEnabled = (): boolean => Boolean(process.env.ALERT_WEBHOOK_URL?.trim());

// ─── Self-check: `npm --workspace rpgbot run alert:test` ──────────────────────
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    await import("dotenv/config");

    const long = new Error("boom");
    long.stack = "x".repeat(5000);
    assert.ok(crashMessage("Uncaught exception", long).length < 2000, "must fit Discord's 2000-char limit");
    assert.match(crashMessage("Unhandled rejection", "plain string"), /plain string/);
    assert.match(crashMessage("Unhandled rejection", { code: 42 }), /"code": 42/);
    assert.match(crashMessage("Unhandled rejection", undefined), /undefined/);
    console.log("ok  crashMessage formatting");

    if (!alertsEnabled()) {
        console.log("--  ALERT_WEBHOOK_URL unset, skipping the live post.");
    } else {
        await postAlert(crashMessage("test alert, nothing is wrong", new Error("This is a drill.")));
        console.log("ok  posted a test alert -- check the channel.");
    }
}
