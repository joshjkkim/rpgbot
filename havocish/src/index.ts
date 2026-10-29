import "dotenv/config"; // if you're using dotenv for DISCORD_TOKEN, DATABASE_URL, etc.
import {
  Client,
  Events,
  GatewayIntentBits,
} from "discord.js";
import { registerMessageCreate } from "./events/messageCreate.js";
import { registerGuildCreate } from "./events/guildCreate.js";
import { registerGuildDelete } from "./events/guildDelete.js";
import { registerInteractionCreate } from "./events/interactionCreate.js";
import { registerVoiceStateUpdate } from "./events/voiceStateUpdate.js";
import { registerLevelUps } from "./events/levelUp.js";
import { registerRoleRewards } from "./events/roleRewards.js";
import { flushDirtyProfiles, pruneCaches } from "./cache/caches.js";
import { flushLogBuffer, pruneOldEvents } from "./db/events.js";
import { abandonFight, allActiveFights, cleanupStaleFights } from "./player/fight.js";
import { cleanupExpiredDuels } from "./commands/user/duel.js";
import { closePool } from "./db/index.js";
import { assertBotEnv } from "./env.js";
import { alertsEnabled, crashMessage, postAlert } from "./alert.js";
import { startPreviewServer } from "./http/previewServer.js";
import { restoreBosses, saveLiveBosses } from "./player/bosses.js";
import { convertLegacyCombat } from "./player/combatLevel.js";
import { startBotListStats } from "./botLists.js";

// Refuse to start on missing configuration, before a single event handler is
// registered. An unset DATABASE_URL does not throw -- pg falls back to
// localhost -- so without this the bot comes up, logs in, and silently fails
// every write. See src/env.ts.
assertBotEnv();

// MessageContent is deliberately NOT requested. XP is awarded per message
// event, never from what the message says -- nothing in this codebase reads
// `message.content`. Asking for it anyway would make the invite prompt look
// invasive and would force a justification during Discord's verification review
// at 100 servers, for a permission we do not use. Keep it out unless a feature
// genuinely needs to read message text.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once(Events.ClientReady, (ready) => {
    console.log(`Logged in as ${client.user?.tag}!`);
    startBotListStats(ready);
    void restoreBosses(client)
        .then((n) => n && console.log(`Restored ${n} live world boss${n === 1 ? "" : "es"}.`))
        .catch((err) => console.error("Restoring world bosses failed:", err));
    console.log(alertsEnabled()
        ? "Crash alerts: on."
        : "Crash alerts: off (ALERT_WEBHOOK_URL unset).");
});

registerMessageCreate(client);
registerGuildCreate(client);
registerGuildDelete(client);
registerInteractionCreate(client);
registerVoiceStateUpdate(client);
registerLevelUps(client);
registerRoleRewards(client);
const previewServer = startPreviewServer(client);

let eventsPrunedAt = 0;
const pruneTimer = setInterval(() => {
    void pruneCaches();
    cleanupExpiredDuels();
    // Once a day: the activity log keeps 90 days.
    if (Date.now() - eventsPrunedAt > 24 * 60 * 60 * 1000) {
        eventsPrunedAt = Date.now();
        void pruneOldEvents().catch((err) => console.error("Failed to prune old events:", err));
    }
}, 5 * 60 * 1000);

const flushTimer = setInterval(() => {
    void flushDirtyProfiles();
    void flushLogBuffer();
    // Here and not in the 5-minute prune, so a walked-away fight ends close to its timeout.
    cleanupStaleFights(client);
}, 30 * 1000);

// Non-null: assertBotEnv() above has already exited if this is unset.
const token = process.env.DISCORD_TOKEN!;

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Up to 30s of XP and gold lives only in the write-back cache at any moment.
// `process.on("exit")` cannot await anything, so it was never actually flushing
// on restart -- every deploy dropped whatever was buffered. These handlers do
// the final flush before the process goes away.

let shuttingDown = false;

async function shutdown(reason: string, exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`${reason}, flushing caches before exit...`);

    clearInterval(pruneTimer);
    clearInterval(flushTimer);

    // Don't hang forever if the DB is unreachable.
    const timeout = setTimeout(() => {
        console.error("Shutdown flush timed out after 10s, exiting anyway.");
        process.exit(exitCode || 1);
    }, 10_000);
    timeout.unref();

    try {
        await saveLiveBosses();
        // Before the flush: ending a fight writes the HP it cost into the cache.
        await Promise.all(allActiveFights().map((f) => abandonFight(f, client, "restart").catch((err) => console.error("Failed to end a fight on shutdown:", err))));
        await flushDirtyProfiles(true);
        await flushLogBuffer();
    } catch (err) {
        console.error("Error during shutdown flush:", err);
    }

    clearTimeout(timeout);

    previewServer?.close();
    await client.destroy().catch(() => null);
    await closePool().catch(() => null);

    console.log("Shutdown complete.");
    process.exit(exitCode);
}

process.on("SIGINT", () => void shutdown("Received SIGINT"));
process.on("SIGTERM", () => void shutdown("Received SIGTERM"));

// ─── Crash paths ──────────────────────────────────────────────────────────────
// A signal is the *polite* way this process dies; it is not the likely one. An
// unhandled rejection or a thrown exception terminates Node without touching
// the handlers above, which silently discarded up to 30s of everyone's buffered
// XP and gold on every crash. Route those through the same flush.
//
// Both exit non-zero so a supervisor (Docker restart policy, systemd) treats it
// as a failure and restarts, rather than seeing a clean exit and staying down.
// The process is not trusted after either event -- we flush and leave, never
// continue running on a corrupt state.

// The alert goes out *before* the flush, not after: shutdown() ends in
// process.exit(), which would kill an in-flight request. It is capped at 3s and
// can never reject, so it cannot cost us the flush. See src/alert.ts.
function crashed(reason: string, detail: unknown) {
    console.error(`${reason}:`, detail);
    void postAlert(crashMessage(reason, detail)).finally(() => shutdown(reason, 1));
}

process.on("unhandledRejection", (reason) => crashed("Unhandled rejection", reason));
process.on("uncaughtException", (err) => crashed("Uncaught exception", err));

// Once only (a no-op afterwards): Combat splits from chat level. Before login, so
// no cached profile can overwrite it; see convertLegacyCombat.
convertLegacyCombat()
    .then((n) => { if (n) console.log(`Combat split: converted ${n} profiles.`); })
    .catch((err) => console.error("Combat split failed; existing members start at Combat 1 until it runs:", err))
    .finally(() => client.login(token));
