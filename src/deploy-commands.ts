import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commandList } from "./commands/index.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const serverId = process.env.SERVER_ID;

if (!token) {
  throw new Error("DISCORD_TOKEN is not set in environment");
}
if (!clientId) {
  throw new Error("CLIENT_ID is not set in environment");
}
if (!serverId) {
  throw new Error("SERVER_ID is not set in environment");
}

const rest = new REST({ version: "10" }).setToken(token);

export async function main() {
    if(!clientId || !serverId) {
        throw new Error("CLIENT_ID or SERVER_ID is not set in environment");
    }

    try {
        console.log("Started refreshing application (/) commands.");
        await rest.put(Routes.applicationGuildCommands(clientId, serverId), { body: commandList.map(cmd => cmd.toJSON()) });
        console.log("Successfully reloaded application (/) commands.");
    } catch (error) {
        console.error(error);
    }
}

main();