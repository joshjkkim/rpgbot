import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commandList } from "./commands/index.js";

// Two registration scopes, picked by argv:
//
//   --global   registers to the application itself. This is what real users
//              get. Discord caches global commands, so a change can take up to
//              an hour to appear -- fine for releases, painful for iteration.
//   --guild    registers to SERVER_ID only, and appears instantly. This is the
//              development path.
//   --clear    removes every command from the chosen scope.
//
// A command registered in both scopes shows up *twice* in that server, so once
// you have deployed globally, clear the guild-scoped copies from your test
// server: `npm run deploy-commands -- --guild --clear`.

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const serverId = process.env.SERVER_ID;

if (!token) throw new Error("DISCORD_TOKEN is not set in environment");
if (!clientId) throw new Error("CLIENT_ID is not set in environment");

const args = process.argv.slice(2);
const clear = args.includes("--clear");
const global = args.includes("--global");

if (!global && !args.includes("--guild")) {
    throw new Error(
        "Pass --global (all servers) or --guild (SERVER_ID only). " +
        "Add --clear to remove commands instead of registering them."
    );
}

// Only the guild scope needs SERVER_ID, so a production deploy does not have to
// carry a test-server id in its environment just to satisfy a startup check.
if (!global && !serverId) {
    throw new Error("SERVER_ID is not set in environment (required for --guild)");
}

const rest = new REST({ version: "10" }).setToken(token);

export async function main() {
    const route = global
        ? Routes.applicationCommands(clientId!)
        : Routes.applicationGuildCommands(clientId!, serverId!);

    const scope = global ? "global" : `guild ${serverId}`;
    const body = clear ? [] : commandList.map((cmd) => cmd.toJSON());

    try {
        console.log(
            clear
                ? `Clearing all application (/) commands from ${scope}...`
                : `Registering ${body.length} application (/) commands to ${scope}...`
        );

        await rest.put(route, { body });

        console.log(
            clear
                ? `Cleared ${scope}.`
                : `Registered ${body.length} commands to ${scope}.` +
                  (global ? " Global commands can take up to an hour to propagate." : "")
        );
    } catch (error) {
        console.error(error);
        // A failed registration must not look like a success in CI or a deploy log.
        process.exitCode = 1;
    }
}

main();
