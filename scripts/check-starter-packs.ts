// Checks every starter pack is complete: applied to a fresh server, the bot's
// own health check finds nothing, and quest enemies all exist.
// Run: npx tsx scripts/check-starter-packs.ts
import assert from "node:assert/strict";
import { applyPack, STARTER_PACKS } from "../web/app/lib/starterPacks.js";
import { checkGuild, type Access } from "../havocish/src/health/checkGuild.js";
import { mergeConfig } from "../havocish/src/db/guilds.js";

const allOk: Access = { channelName: () => "general", missingIn: () => [], roleName: () => "Hero", canManageRole: () => true };

for (const pack of STARTER_PACKS) {
  const config = mergeConfig(applyPack({}, pack).config as any);
  const issues = checkGuild(config, allOk);
  assert.deepEqual(issues.map((i) => i.message), [], `${pack.id} has issues`);

  for (const q of Object.values(config.quests.quests ?? {})) {
    if (q.conditions.type !== "defeatEnemies") continue;
    for (const id of q.conditions.enemyIds ?? []) assert.ok(config.combat.enemies[id], `${pack.id}: quest ${q.id} needs missing enemy ${id}`);
  }
  console.log(`✓ ${pack.name}`);
}
