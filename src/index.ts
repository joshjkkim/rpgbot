import "dotenv/config"; // if you're using dotenv for DISCORD_TOKEN, DATABASE_URL, etc.
import {
  Client,
  Events,
  GatewayIntentBits,
} from "discord.js";
import { registerMessageCreate } from "./events/messageCreate.js";
import { registerGuildCreate } from "./events/guildCreate.js";
import { registerInteractionCreate } from "./events/interactionCreate.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user?.tag}!`);
});

// register all your event handlers here
registerMessageCreate(client);
registerGuildCreate(client);
registerInteractionCreate(client);

const token = process.env.DISCORD_TOKEN;
if (!token) {
  throw new Error("DISCORD_TOKEN is not set in environment");
}

client.login(token);
