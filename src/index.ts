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

setInterval(() => {
    pruneCaches();
}, 5 * 60 * 1000);

setInterval(() => {
    void flushDirtyProfiles();
    void flushLogBuffer();
  }, 30 * 1000);

const token = process.env.DISCORD_TOKEN;
if (!token) {
  throw new Error("DISCORD_TOKEN is not set in environment");
}

process.on("exit", () => {
  void flushDirtyProfiles();
  void flushLogBuffer();
});

client.login(token);
