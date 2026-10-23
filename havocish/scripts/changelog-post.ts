/**
 * Posts the newest CHANGELOG.md entry to the support server's announcements,
 * through a Discord webhook (CHANGELOG_WEBHOOK_URL in havocish/.env).
 *
 *   npm run changelog:post                        # prints what would be posted
 *   npm run changelog:post -- --send              # posts it
 *   npm run changelog:post -- --entry v0.5 --send # posts an older entry instead
 *
 * Printing first is the default on purpose: a webhook post goes straight to
 * every member, so it is read before it is sent.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CHANGELOG = fileURLToPath(new URL("../../CHANGELOG.md", import.meta.url));
const GOLD = 0xc4a462;
const AVATAR = "https://raw.githubusercontent.com/joshjkkim/rpgbot/main/havocish/assets/brand/avatar-pixel.png";

/**
 * The newest released "## " section (never "## Unreleased", where entries
 * collect between releases), or the one whose heading starts with `version`.
 */
export function newestEntry(markdown: string, version?: string): { title: string; body: string } | null {
    const sections = markdown.split(/^## /m).slice(1).filter((sec) => !sec.startsWith("Unreleased"));
    const first = version ? sections.find((sec) => sec.startsWith(`${version} `)) : sections[0];
    if (!first) return null;
    const [title = "", ...rest] = first.split("\n");
    // "### New" reads as a bold line in an embed; Discord renders the bullets as-is.
    const body = rest.join("\n").trim().replace(/^### (.+)$/gm, "**$1**");
    return { title: title.trim(), body };
}

/**
 * The Discord version: one line per change, its bold lead ("- **Party fights.** Press…"
 * becomes "- Party fights"), and only the first sentence of any paragraph. The
 * website has the full text.
 */
export function shortEntry(body: string): string {
    return body.split("\n").map((line) => {
        const lead = line.match(/^- \*\*(.+?)\.?\*\*/);
        if (lead) return `- ${lead[1]}`;
        if (!line.trim() || line.startsWith("**") || line.startsWith("- ")) return line;
        return line.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? line;
    }).join("\n");
}

async function main() {
    const at = process.argv.indexOf("--entry");
    const version = at > -1 ? process.argv[at + 1] : undefined;
    const entry = newestEntry(readFileSync(CHANGELOG, "utf8"), version);
    if (!entry) throw new Error(version ? `No CHANGELOG.md entry for ${version}.` : "CHANGELOG.md has no ## entry.");
    const description = `${shortEntry(entry.body)}\n\n**[Read the full notes →](https://havocish.com/changelog)**`;
    if (description.length > 4000) throw new Error(`Entry is ${description.length} characters; an embed holds 4096.`);

    const payload = {
        username: "havocish updates",
        avatar_url: AVATAR,
        embeds: [{
            title: `📜 ${entry.title}`,
            description,
            color: GOLD,
            url: "https://havocish.com/changelog",
        }],
    };

    if (!process.argv.includes("--send")) {
        console.log(`Would post:\n\n# ${payload.embeds[0]!.title}\n\n${description}\n\nRun with --send to post it.`);
        return;
    }

    const url = process.env.CHANGELOG_WEBHOOK_URL?.trim();
    if (!url) throw new Error("Set CHANGELOG_WEBHOOK_URL in havocish/.env first.");
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`Discord answered ${res.status}: ${await res.text()}`);
    console.log(`Posted "${entry.title}".`);
}

// Imported by the smoke tests for newestEntry; only run when called directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main().catch((err) => {
        console.error(err.message ?? err);
        process.exit(1);
    });
}
