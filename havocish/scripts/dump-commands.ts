/**
 * Writes every slash command's name, description and options to
 * web/app/docs/commands.json, for the docs' command reference. It reads the
 * same commandList that deploy-commands registers, so the reference can't drift
 * from what Discord shows. CI runs it and fails if the committed file is stale.
 *
 *   npm run docs:commands
 */
import { writeFileSync } from "node:fs";
import { commandList } from "../src/commands/index.js";

type Opt = { type: number; name: string; description: string; required?: boolean; options?: Opt[] };

// Discord's option type numbers: 1 subcommand, 2 subcommand group, the rest are values.
const TYPE_NAMES: Record<number, string> = { 3: "text", 4: "number", 5: "true/false", 6: "user", 7: "channel", 8: "role", 10: "number" };

const simplify = (o: Opt): object =>
    o.type === 1 || o.type === 2
        ? { name: o.name, description: o.description, ...(o.options?.length ? { options: o.options.map(simplify) } : {}), kind: o.type === 1 ? "subcommand" : "group" }
        : { name: o.name, description: o.description, type: TYPE_NAMES[o.type] ?? "value", required: !!o.required };

const commands = commandList
    .map((c) => c.toJSON() as unknown as { name: string; description: string; default_member_permissions?: string | null; options?: Opt[] })
    .map((c) => ({
        name: c.name,
        description: c.description,
        // Commands hidden from members without a permission (all of them Manage Server here).
        managersOnly: c.default_member_permissions != null,
        options: (c.options ?? []).map(simplify),
    }))
    .sort((a, b) => Number(a.managersOnly) - Number(b.managersOnly) || a.name.localeCompare(b.name));

writeFileSync(new URL("../../web/app/docs/commands.json", import.meta.url), JSON.stringify(commands, null, 2) + "\n");
console.log(`Wrote ${commands.length} commands.`);
