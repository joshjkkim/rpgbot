// Checks every starter pack points only at things that exist, and that adding
// one never overwrites a server's own content.
// Lives at the repo root because it spans both workspaces. Run: npx tsx scripts/check-starter-pack.ts
import assert from "node:assert/strict";
import { DEFAULT_GUILD_CONFIG } from "../havocish/src/types/guild.js";
import { applyPack, missingCount, STARTER_PACKS } from "../web/app/lib/starterPacks.js";
import { validateGuildConfig } from "../web/app/lib/validateConfig.js";

const RARITIES = ["poor", "common", "uncommon", "rare", "epic", "legendary"];
const SLOTS = ["head", "body", "legs", "feet", "hands", "weapon", "shield", "accessory", "aura"];
const QUEST_CONDITIONS = ["messages", "vcMinutes", "spendGold", "earnXp", "dailyClaim"];
const ACHIEVEMENT_CONDITIONS = ["stat", "level", "xp", "gold", "streak"];
const ACHIEVEMENT_CATEGORIES = ["xp", "social", "daily", "economy", "vc", "misc"];
// Keys of UserStats in havocish/src/types/userprofile.ts that achievements may read.
const STAT_KEYS = ["messagesSent", "itemsPurchased", "itemsUsed", "goldSpent", "goldEarned", "dailiesClaimed", "maxStreak", "enemiesDefeated", "fightsWon", "duelsWon"];
// statIds handled by giveStat in havocish/src/player/inventory.ts.
const GIVE_STATS = ["gold", "xp", "health"];

for (const pack of STARTER_PACKS) {
  const { shop, combat, quests, achievements } = pack.content;
  const itemIds = new Set(Object.keys(shop.items));
  const where = (kind: string, id: string) => `${pack.id} ${kind} ${id}`;

  for (const [section, map] of [["shop", "categories"], ["shop", "items"], ["combat", "enemies"], ["quests", "quests"], ["achievements", "achievements"]]) {
    for (const [id, entry] of Object.entries(pack.content[section][map])) {
      assert.equal(entry.id, id, `${where(map, id)}: id must match its key`);
      assert.match(id, /^[a-zA-Z0-9_-]{2,40}$/, `${where(map, id)}: the dashboard only accepts ids like this`);
    }
  }

  for (const [id, item] of Object.entries(shop.items)) {
    assert.ok(shop.categories[item.categoryId], `${where("item", id)}: unknown category ${item.categoryId}`);
    assert.ok(RARITIES.includes(item.rarity), `${where("item", id)}: bad rarity`);
    if (item.equipSlot) assert.ok(item.equipable && SLOTS.includes(item.equipSlot), `${where("item", id)}: bad slot`);
    if (item.effects?.stats || item.effects?.boosts) assert.ok(item.equipable, `${where("item", id)}: bonuses only apply when equipable`);
    for (const action of Object.values(item.actions ?? {})) {
      if (action.type === "giveStat") assert.ok(GIVE_STATS.includes(action.statId), `${where("item", id)}: bad statId`);
    }
  }

  for (const [id, enemy] of Object.entries(combat.enemies)) {
    assert.ok(enemy.maxLevel == null || enemy.minLevel <= enemy.maxLevel, `${where("enemy", id)}: level range`);
    for (const drop of enemy.drops) {
      assert.ok(itemIds.has(drop.itemId), `${where("enemy", id)}: drops unknown item ${drop.itemId}`);
      assert.ok(drop.chance > 0 && drop.chance <= 1, `${where("enemy", id)}: drop chance is 0-1`);
    }
  }

  for (const [id, quest] of Object.entries(quests.quests)) {
    assert.ok(QUEST_CONDITIONS.includes(quest.conditions.type), `${where("quest", id)}: bad condition`);
    for (const reward of Object.values(quest.reward ?? {})) {
      if (reward.itemId) assert.ok(itemIds.has(reward.itemId), `${where("quest", id)}: rewards unknown item`);
    }
  }

  for (const [id, a] of Object.entries(achievements.achievements)) {
    assert.ok(ACHIEVEMENT_CONDITIONS.includes(a.conditions.type), `${where("achievement", id)}: bad condition`);
    assert.ok(ACHIEVEMENT_CATEGORIES.includes(a.category), `${where("achievement", id)}: bad category`);
    if (a.conditions.type === "stat") assert.ok(STAT_KEYS.includes(a.conditions.statKey), `${where("achievement", id)}: bad statKey`);
    if (a.reward?.itemId) assert.ok(itemIds.has(a.reward.itemId), `${where("achievement", id)}: rewards unknown item`);
  }

  // A server made before the crit fix, with everything off and empty.
  const fresh = structuredClone(DEFAULT_GUILD_CONFIG) as any;
  fresh.combat.critChanceBase = 0.05;
  fresh.combat.critChancePerLevel = 0.01;
  const total = missingCount(fresh, pack);

  const { config: applied, added } = applyPack(fresh, pack);
  assert.equal(added, total);
  assert.equal(missingCount(applied, pack), 0);
  for (const f of ["shop", "combat", "quests", "achievements"]) assert.equal(applied[f].enabled, true);
  assert.deepEqual([applied.combat.critChanceBase, applied.combat.critChancePerLevel], [5, 0.5]);
  assert.deepEqual(validateGuildConfig(applied), { ok: true });
  assert.equal(fresh.shop.enabled, false, "applyPack must not mutate its input");

  // An owner's own entry with a pack id survives, and so does crit they chose.
  const firstItem = Object.keys(shop.items)[0];
  const owned = structuredClone(fresh);
  owned.shop.items[firstItem] = { id: firstItem, name: "Mine", categoryId: "x", price: 1 };
  owned.combat.critChancePerLevel = 0.02;
  const second = applyPack(owned, pack);
  assert.equal(second.added, total - 1);
  assert.equal(second.config.shop.items[firstItem].name, "Mine");
  assert.equal(second.config.combat.critChanceBase, 0.05);

  assert.equal(applyPack(applied, pack).added, 0, "adding twice adds nothing");

  console.log(`${pack.id}: ${total} entries, all references resolve, merge never overwrites`);
}
