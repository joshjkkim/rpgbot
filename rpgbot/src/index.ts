import "dotenv/config"; // if you're using dotenv for DISCORD_TOKEN, DATABASE_URL, etc.
import {
  Client,
  Events,
  GatewayIntentBits,
} from "discord.js";
import { registerMessageCreate } from "./events/messageCreate.js";
import { registerGuildCreate } from "./events/guildCreate.js";
import { registerInteractionCreate } from "./events/interactionCreate.js";
import { registerVoiceStateUpdate } from "./events/voiceStateUpdate.js";
import { flushDirtyProfiles, pruneCaches } from "./cache/caches.js";
import { flushLogBuffer } from "./db/events.js";
import { cleanupStaleFights } from "./player/fight.js";
import { cleanupExpiredDuels } from "./commands/user/duel.js";
import { closePool } from "./db/index.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user?.tag}!`);
});

registerMessageCreate(client);
registerGuildCreate(client);
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

const token = process.env.DISCORD_TOKEN;
if (!token) {
  throw new Error("DISCORD_TOKEN is not set in environment");
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Up to 30s of XP and gold lives only in the write-back cache at any moment.
// `process.on("exit")` cannot await anything, so it was never actually flushing
// on restart -- every deploy dropped whatever was buffered. These handlers do
// the final flush before the process goes away.

let shuttingDown = false;

async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`Received ${signal}, flushing caches before exit...`);

    clearInterval(pruneTimer);
    clearInterval(flushTimer);

    // Don't hang forever if the DB is unreachable.
    const timeout = setTimeout(() => {
        console.error("Shutdown flush timed out after 10s, exiting anyway.");
        process.exit(1);
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
    process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

client.login(token);
