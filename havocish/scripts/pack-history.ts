/**
 * Writes each starter pack's history: for every entry and field, the values it
 * has had in any released version of the pack, from git. applyPack uses it to
 * tell a field nobody touched (it still holds some version's value) from one
 * the owner changed, so re-adding a pack updates the first and keeps the second.
 *
 *   npm run pack-history     # after changing a pack, commit the .history.json files
 *
 * Only fingerprints of past values are kept (today's are left out), so the files stay a few KB.
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PACK_KINDS, valueHash } from "../src/content/packHistory.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACK_DIR = join(REPO, "havocish", "src", "content", "packs");
// Where packs have lived over time, newest first.
const OLD_DIRS = ["havocish/src/content/packs", "web/app/lib/packs"];

const git = (cmd: string) => execSync(`git ${cmd}`, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });

for (const file of readdirSync(PACK_DIR).filter((f) => f.endsWith(".json") && !f.endsWith(".history.json"))) {
    const id = file.replace(/\.json$/, "");
    const versions: unknown[] = [];
    for (const dir of OLD_DIRS) {
        const path = `${dir}/${file}`;
        for (const sha of git(`log --format=%H -- ${path}`).split("\n").filter(Boolean)) {
            try { versions.push(JSON.parse(git(`show ${sha}:${path}`))); } catch { /* deleted in that commit */ }
        }
    }
    // Fingerprints of each field's past values: { "items:iron-sword": { price: ["1x9k2a"] } }.
    // Today's values are left out: a field already equal to the pack needs no update.
    const current = JSON.parse(readFileSync(join(PACK_DIR, file), "utf8")).content ?? {};
    const history: Record<string, Record<string, string[]>> = {};
    for (const v of versions) {
        const content = (v as { content?: Record<string, Record<string, Record<string, Record<string, unknown>>>> }).content ?? {};
        for (const [kind, [section, map]] of Object.entries(PACK_KINDS)) {
            for (const [entryId, entry] of Object.entries(content[section]?.[map] ?? {})) {
                const now = current[section]?.[map]?.[entryId] ?? {};
                for (const [field, value] of Object.entries(entry)) {
                    const h = valueHash(value);
                    if (field === "id" || h === valueHash(now[field])) continue;
                    const seen = ((history[`${kind}:${entryId}`] ??= {})[field] ??= []);
                    if (!seen.includes(h)) seen.push(h);
                }
            }
        }
    }
    writeFileSync(join(PACK_DIR, `${id}.history.json`), JSON.stringify(history) + "\n");
    console.log(`${id}: ${versions.length} versions, ${Object.keys(history).length} entries`);
}
