// Timed crafting stations, without a database: start, wait, collect, refunds and the scene.
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { DEFAULT_GUILD_CONFIG } from "../src/types/guild.js";
import type { CraftingStation } from "../src/types/crafting.js";
import type { DbUserGuildProfile } from "../src/types/userprofile.js";
import { harvestTimed, plantTimed, recipeMinutes, slotReady, timedSlotCount } from "../src/player/crafting.js";
import { readyLine } from "../src/player/nextSteps.js";
import { durationText } from "../src/commands/user/craft.js";
import { drawStationScene, stationSlotXY } from "../src/content/stationScene.js";
import { W, H, PAD } from "../src/content/gridDraw.js";

const item = (id: string, emoji: string) => ({ id, name: id, emoji, rarity: "common", categoryId: "test", price: 1 });
const config = structuredClone(DEFAULT_GUILD_CONFIG);
config.shop.items = { seed: item("seed", "🌰"), herb: item("herb", "🌿"), rare: item("rare", "🌸"), ore: item("ore", "🪨") } as unknown as NonNullable<typeof config.shop.items>;
const garden: CraftingStation = {
    id: "garden", name: "Garden", emoji: "🌱", skillName: "Farming", enabled: true, style: "timed", timed: { slots: 2 },
    recipes: {
        herb: { id: "herb", inputs: [{ itemId: "seed", quantity: 2 }], output: { itemId: "herb", quantity: 3 }, minSkill: 1, skillXp: 10, minutes: 30, masterwork: [{ itemId: "rare", chance: 1, quantity: 1 }] },
        dig: { id: "dig", inputs: [], output: { itemId: "ore", quantity: 1 }, minSkill: 1, skillXp: 5, minutes: 60, gold: 4 },
    },
};
config.crafting = { enabled: true, stations: { garden } };
const profile = () => ({ user_id: 1, guild_id: 1, xp: "0", gold: "10", inventory: { seed: { id: "seed", name: "seed", emoji: "🌰", quantity: 5 } }, user_stats: {} }) as unknown as DbUserGuildProfile;
const t0 = Date.UTC(2026, 10, 14);

// Settings fall back and clamp.
assert.equal(timedSlotCount({ ...garden, timed: {} }), 3);
assert.equal(timedSlotCount({ ...garden, timed: { slots: 99 } }), 12);
const { minutes: _unset, ...noMinutes } = garden.recipes.herb!;
assert.equal(recipeMinutes(noMinutes), 60);
assert.equal(recipeMinutes({ ...garden.recipes.herb!, minutes: 0 }), 1);
assert.equal(slotReady({ recipeId: "x", doneAt: "garbage", inputs: [] }, t0), true, "an unreadable time never sticks");
assert.deepEqual([durationText(45), durationText(90), durationText(1440 * 2 + 240)], ["45m", "1h 30m", "2d 4h"]);

// Start takes the inputs; a full station refuses.
const p = profile();
assert.equal(plantTimed(p, config, garden, garden.recipes.herb!, { now: t0 }), null);
assert.equal(p.inventory!.seed!.quantity, 3);
assert.equal(plantTimed(p, config, garden, garden.recipes.dig!, { now: t0 }), null, "a recipe with no inputs starts");
assert.equal(p.gold, "6", "gold is taken at the start");
assert.equal(plantTimed(p, config, garden, garden.recipes.herb!, { now: t0, full: "FULL" }), "FULL");
assert.equal(p.inventory!.seed!.quantity, 3, "a refused start takes nothing");
assert.equal(plantTimed(profile(), config, garden, { ...garden.recipes.herb!, inputs: [{ itemId: "seed", quantity: 9 }] }, { now: t0 }), "You don't have everything this needs.");

// Collect: nothing early, everything ready once, and never twice.
assert.deepEqual(harvestTimed(p, config, garden, t0 + 29 * 60_000).gave, []);
assert.equal(readyLine(p, config, t0 + 29 * 60_000), null);
assert.match(readyLine(p, config, t0 + 30 * 60_000)!, /Garden.*1×/);
const first = harvestTimed(p, config, garden, t0 + 30 * 60_000, () => 0.99);
assert.deepEqual(first.gave, [{ itemId: "herb", quantity: 3, masterwork: false }]);
assert.equal(first.xp, 10);
assert.equal(p.inventory!.herb!.quantity, 3);
assert.equal(p.user_stats!.crafting!.garden!.slots!.length, 1, "the unfinished slot stays");
assert.deepEqual(harvestTimed(p, config, garden, t0 + 30 * 60_000).gave, [], "collecting twice gives nothing");
const second = harvestTimed(p, config, garden, t0 + 60 * 60_000);
assert.deepEqual(second.gave.map((g) => g.itemId), ["ore"]);
assert.equal(p.user_stats!.crafting!.garden!.crafts, 2);
assert.equal(p.user_stats!.craftsMade, 2);

// Masterwork uses the station's chance and the recipe's table.
const lucky = profile();
plantTimed(lucky, config, { ...garden, masterworkChance: 100 }, garden.recipes.herb!, { now: t0 });
assert.deepEqual(harvestTimed(lucky, config, { ...garden, masterworkChance: 100 }, t0 + 30 * 60_000, () => 0).gave, [{ itemId: "rare", quantity: 1, masterwork: true }]);

// A recipe removed mid-wait gives back what it took, gold included.
const refund = profile();
plantTimed(refund, config, garden, { ...garden.recipes.herb!, gold: 3 }, { now: t0 });
const gone = { ...garden, recipes: { dig: garden.recipes.dig! } };
const back = harvestTimed(refund, config, gone, t0 + 30 * 60_000);
assert.equal(back.refunded, 1);
assert.deepEqual(back.gave, []);
assert.equal(refund.inventory!.seed!.quantity, 5);
assert.equal(refund.gold, "10");

// The scene draws every slot count inside the frame, in every setting and stage.
for (const n of [1, 3, 6, 7, 12]) {
    for (let i = 0; i < n; i++) {
        const { x, y, size } = stationSlotXY(i, n);
        assert(x >= PAD && x + size <= W - PAD && y >= PAD && y + size + 16 <= H - PAD, `slot ${i} of ${n} fits`);
    }
}
for (const scene of ["garden", "nursery", "workshop"] as const) {
    const canvas = createCanvas(W, H);
    drawStationScene(canvas.getContext("2d"), { scene, slots: [{ stage: "empty", progress: 0 }, { stage: "growing", progress: 0.5 }, { stage: "ready", progress: 1 }] });
}
console.log("Timed station checks passed: start, full, collect once, masterwork, refunds, hints and scene layout.");
