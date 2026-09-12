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
import { flushDirtyProfiles, pruneCaches } from "./cache/caches.js";
import { flushLogBuffer } from "./db/events.js";
import { cleanupStaleFights } from "./player/fight.js";
import { cleanupExpiredDuels } from "./commands/user/duel.js";
import { closePool } from "./db/index.js";
import { assertBotEnv } from "./env.js";

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

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user?.tag}!`);
});

registerMessageCreate(client);
registerGuildCreate(client);
registerGuildDelete(client);
registerInteractionCreate(client);
registerVoiceStateUpdate(client);

const pruneTimer = setInterval(() => {
    void pruneCaches();
    cleanupStaleFights();
    cleanupExpiredDuels();
}, 5 * 60 * 1000);

const flushTimer = setInterval(() => {
    void flushDirtyProfiles();
    void flushLogBuffer();
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
        await flushDirtyProfiles(true);
        await flushLogBuffer();
    } catch (err) {
        console.error("Error during shutdown flush:", err);
    }

    clearTimeout(timeout);

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

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
    void shutdown("Unhandled rejection", 1);
});

process.on("uncaughtException", (err) => {
    console.error("Uncaught exception:", err);
    void shutdown("Uncaught exception", 1);
});

client.login(token);
