// Checks the dashboard setup wizard turns answers into the right settings and
// never removes what a server already made. Run: npx tsx scripts/check-setup-wizard.ts
import assert from "node:assert/strict";
import { buildSetup, PACES, type Answers } from "../web/app/lib/setupWizard.js";
import { STARTER_PACKS } from "../web/app/lib/starterPacks.js";

const answers: Answers = {
  pace: "hardcore",
  features: { shop: true, combat: true, encounters: true, duels: false, quests: false, achievements: true },
  levelUpChannelId: "123",
  levelRoles: [{ level: 5, roleId: "regular" }, { level: 10, roleId: "" }],
  packId: STARTER_PACKS[0]!.id,
};

const existing = {
  shop: { enabled: false, items: { "my-sword": { id: "my-sword", name: "Mine", price: 1 } } },
  levels: { levelActions: { 5: [{ type: "sendMessage", message: "gg" }, { type: "assignRole", roleId: "regular" }] } },
  style: { mainThemeColor: "#ff00ff" },
};

const out = buildSetup(existing as never, answers, STARTER_PACKS) as any;

assert.equal(out.xp.basePerMessage, PACES.hardcore.basePerMessage, "pace sets XP per message");
assert.equal(out.levels.curveType, "polynomial", "pace sets the curve");
assert.equal(out.levels.announceLevelUpInChannelId, "123", "level-up channel set");
assert.ok(out.shop.items["my-sword"], "the server's own item is kept");
assert.ok(Object.keys(out.shop.items).length > 1, "the pack's items were added");
assert.equal(out.quests.enabled, false, "a feature turned off stays off even though the pack turns it on");
assert.equal(out.combat.enabled, true);
assert.equal(out.combat.encounters.enabled, true);
assert.equal(out.combat.pvp.enabled, false, "duels follow the answer");
assert.equal(out.levels.levelActions[5].length, 2, "an existing level role isn't added twice");
assert.equal(out.levels.levelActions[5][0].type, "sendMessage", "existing level actions are kept");
assert.equal(out.levels.levelActions[10], undefined, "a row with no role is skipped");
assert.equal(out.style.mainThemeColor, "#ff00ff", "unrelated settings are untouched");

const empty = buildSetup(null, { ...answers, packId: null }, STARTER_PACKS) as any;
assert.equal(empty.shop.items, undefined, "Start empty adds no content");

console.log("setup wizard: ok");
