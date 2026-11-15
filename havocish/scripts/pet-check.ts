// Pets, without a database: levels, stats, looks, moves, owning, feeding, naming and hatching.
import assert from "node:assert/strict";
import { DEFAULT_GUILD_CONFIG } from "../src/types/guild.js";
import type { CraftingStation } from "../src/types/crafting.js";
import type { DbUserGuildProfile } from "../src/types/userprofile.js";
import type { PetSpecies } from "../src/types/pets.js";
import { activePet, addPet, feedPet, giveActivePetXp, petLevel, petLook, petMoves, petRules, petStats, petsOf, releasePet, renamePet, setActivePet } from "../src/player/pets.js";
import { harvestTimed, plantTimed, recipeState } from "../src/player/crafting.js";

const wolf: PetSpecies = {
    id: "wolf", name: "Wolf", emoji: "🐺", base: { hp: 40, atk: 5, def: 2, spd: 7 }, growth: { hp: 6, atk: 0.8, def: 0.5, spd: 0.4 }, maxLevel: 5,
    moves: [{ moveId: "bite", weight: 3 }],
    stages: [{ atLevel: 1, name: "Pup", emoji: "🐶" }, { atLevel: 3, name: "Grown", emoji: "🐺", moves: [{ moveId: "howl", weight: 1 }] }],
};
const config = structuredClone(DEFAULT_GUILD_CONFIG);
config.shop.items = { fish: { id: "fish", name: "Fish", emoji: "🐟", categoryId: "x", price: 1 }, egg: { id: "egg", name: "Egg", emoji: "🥚", categoryId: "x", price: 1 } } as unknown as NonNullable<typeof config.shop.items>;
config.pets = { enabled: true, species: { wolf, gone: { ...wolf, id: "gone", enabled: false } }, maxOwned: 2, foods: { fish: 25 } };
const profile = () => ({ user_id: 1, guild_id: 1, xp: "0", gold: "0", inventory: { fish: { id: "fish", name: "Fish", quantity: 2 }, egg: { id: "egg", name: "Egg", quantity: 1 } }, user_stats: {} }) as unknown as DbUserGuildProfile;

// Rules fall back and clamp.
assert.deepEqual({ ...petRules({ ...config, pets: { enabled: true, species: {}, maxOwned: 999, xpShare: -5 } }), foods: {} }, { enabled: true, maxOwned: 50, xpShare: 0, canBeHit: false, foods: {} });
const { pets: _off, ...noPets } = config;
assert.equal(petRules(noPets).enabled, false);

// Stats grow per level; looks and moves follow stages.
assert.deepEqual(petStats(wolf, 1), { hp: 40, atk: 5, def: 2, spd: 7 });
assert.deepEqual(petStats(wolf, 5), { hp: 64, atk: 8, def: 4, spd: 9 });
assert.deepEqual([petLook(wolf, 1).emoji, petLook(wolf, 1).stage, petLook(wolf, 4).emoji, petLook(wolf, 4).stage], ["🐶", "Pup", "🐺", "Grown"]);
assert.deepEqual(petMoves(wolf, 2).map((m) => m.moveId), ["bite"]);
assert.deepEqual(petMoves(wolf, 3).map((m) => m.moveId), ["bite", "howl"]);

// Owning: the first is active, the cap holds, a disabled species can't be given.
const p = profile();
const first = addPet(p, config, "wolf");
assert(!("refused" in first));
assert.equal(petsOf(p).active, first.uid);
const second = addPet(p, config, "wolf");
assert(!("refused" in second) && second.uid !== first.uid, "two of a species are told apart");
assert.equal(petsOf(p).active, first.uid, "a second pet doesn't take over");
assert("refused" in addPet(p, config, "wolf"), "the cap holds");
assert("refused" in addPet(profile(), config, "gone"), "a switched-off species can't be given");

// Feeding takes one food and adds XP; levels are capped by the species.
const fed = feedPet(p, config, first.uid, "fish");
assert(!("refused" in fed) && fed.xp === 25);
assert.equal(p.inventory!.fish!.quantity, 1);
assert("refused" in feedPet(p, config, first.uid, "egg"), "only foods feed");
feedPet(p, config, first.uid, "fish");
assert.equal(p.inventory!.fish, undefined, "the last one is used up");
assert("refused" in feedPet(p, config, first.uid, "fish"), "none left");
giveActivePetXp(p, config, 1e9);
assert.equal(petLevel(activePet(p, config)!.pet, wolf, config), 5, "capped at the species' max level");

// Naming strips markdown and mentions; switching and releasing keep one active.
assert.equal(renamePet(p, first.uid, "  **Fang** <@1> "), null);
assert.equal(activePet(p, config)!.pet.name, "Fang 1");
assert.notEqual(renamePet(p, first.uid, "   "), null);
assert.equal(setActivePet(p, second.uid), true);
assert.equal(setActivePet(p, "nope"), false);
releasePet(p, second.uid);
assert.equal(petsOf(p).active, first.uid, "releasing the active pet hands over to the next");
releasePet(p, first.uid);
assert.equal(petsOf(p).active, undefined);

// A nursery: a timed recipe that hatches a pet, once, and waits when the member is full.
const nursery: CraftingStation = {
    id: "nursery", name: "Nursery", emoji: "🪺", skillName: "Beastcraft", enabled: true, style: "timed", timed: { slots: 2 },
    recipes: { egg: { id: "egg", inputs: [{ itemId: "egg", quantity: 1 }], output: { itemId: "", quantity: 1, petId: "wolf" }, minSkill: 1, skillXp: 20, minutes: 60 } },
};
config.crafting = { enabled: true, stations: { nursery } };
const h = profile();
assert.equal(recipeState(nursery.recipes.egg!, h, config, 1, []).locked, null, "a pet output isn't a broken recipe");
assert.equal(plantTimed(h, config, nursery, nursery.recipes.egg!, { now: 0 }), null);
const hatched = harvestTimed(h, config, nursery, 60 * 60_000);
assert.deepEqual([hatched.pets, hatched.xp, petsOf(h).owned.length], [["Wolf"], 20, 1]);
assert.deepEqual(harvestTimed(h, config, nursery, 60 * 60_000).pets, [], "hatches once");
assert.equal(h.user_stats!.craftsMade, 1);
const full = profile();
addPet(full, config, "wolf"); addPet(full, config, "wolf");
plantTimed(full, config, nursery, nursery.recipes.egg!, { now: 0 });
const waiting = harvestTimed(full, config, nursery, 60 * 60_000);
assert(waiting.petsFull && waiting.pets.length === 0, "full: it says so");
assert.equal(full.user_stats!.crafting!.nursery!.slots!.length, 1, "full: the egg keeps waiting, ready");
assert.equal(recipeState({ ...nursery.recipes.egg!, output: { itemId: "", quantity: 1, petId: "gone" } }, h, config, 1, []).locked, "broken");

console.log("Pet checks passed: stats, stages, moves, owning, the cap, feeding, naming, releasing and hatching.");
