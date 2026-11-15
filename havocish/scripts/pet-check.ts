// Pets, without a database: levels, stats, looks, moves, owning, feeding, naming and hatching.
import assert from "node:assert/strict";
import { DEFAULT_GUILD_CONFIG } from "../src/types/guild.js";
import type { CraftingStation } from "../src/types/crafting.js";
import type { DbUserGuildProfile } from "../src/types/userprofile.js";
import type { PetSpecies } from "../src/types/pets.js";
import { activePet, addPet, feedPet, giveActivePetXp, petLevel, petLook, petMoves, petRules, petStats, petsOf, releasePet, renamePet, setActivePet } from "../src/player/pets.js";
import { harvestTimed, plantTimed, recipeState } from "../src/player/crafting.js";
import { newFighterState, pickIntent, playTurn, type Fight, type FightConfig, type FightPet } from "../src/content/fight.js";

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

assert.equal(p.user_stats!.petsAdopted, 2, "every pet given counts, for achievements");
assert.equal(p.user_stats!.petBestLevel, 5, "the best level reached counts, for achievements");
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

// ─── In fights ───────────────────────────────────────────────────────────────
const fightConfig: FightConfig = { combat: { moves: {
    attack: { id: "attack", name: "Attack", emoji: "⚔️", effects: [{ type: "hit", power: 1 }], players: {} },
    lick: { id: "lick", name: "Lick", emoji: "👅", effects: [{ type: "heal", percent: 30 }] },
    nip: { id: "nip", name: "Nip", emoji: "🦷", effects: [{ type: "hit", power: 1 }] },
} } };
const stats = (atk: number, maxHp = 100) => ({ maxHp, atk, def: 0, spd: 10, critChance: 0, critMultiplier: 1.5 });
const pet = (moves: FightPet["moves"]): FightPet => ({ name: "Fang", emoji: "🐺", stats: stats(10, 40), hp: 40, state: newFighterState(), moves });
const fight = (p?: FightPet, canBeHit = false, ownerHp = 100): Fight => ({
    members: [{ userId: "u1", name: "Ann", stats: stats(10), hp: ownerHp, state: newFighterState(), dealt: 0, taken: 0, ...(p && { pet: p }) }],
    enemy: { name: "Rat", emoji: "🐀", atk: 10, def: 0, spd: 1, critChance: 0, critMultiplier: 1.5, moves: [{ moveId: "attack" }] },
    enemyMaxHp: 500, enemyCurrentHp: 500, foe: newFighterState(), enemyIntent: "attack", enemyTarget: "u1", round: 0,
    ...(canBeHit && { petsCanBeHit: true }), seed: 7,
});

// A pet acts right after its owner, and its damage counts as theirs.
const withPet = fight(pet([{ moveId: "nip" }]));
const turn1 = playTurn(withPet, { u1: { kind: "move", moveId: "attack" } }, fightConfig);
const annAt = turn1.log.findIndex((l) => l.includes("**You** used **Attack**"));
assert(annAt >= 0 && turn1.log[annAt + 1]?.includes("**🐺 Fang** used **Nip**"), "the pet acts straight after its owner");
assert.equal(500 - withPet.enemyCurrentHp, withPet.members[0]!.dealt, "the pet's damage counts as its owner's");
assert.equal(500 - fight().enemyCurrentHp, 0);
const alone = fight(); playTurn(alone, { u1: { kind: "move", moveId: "attack" } }, fightConfig);
assert(withPet.members[0]!.dealt > alone.members[0]!.dealt, "a pet adds damage");

// "Self" means its owner: a heal only when the owner is low, landing on the owner.
const healer = fight(pet([{ moveId: "lick", when: { type: "selfHpBelow", percent: 50 } }, { moveId: "nip", weight: 0 }]), false, 30);
playTurn(healer, { u1: { kind: "pass" } }, fightConfig);
assert(healer.members[0]!.hp > 30 - 10, "its heal lands on its owner when they're low");
const healthy = fight(pet([{ moveId: "lick", when: { type: "selfHpBelow", percent: 50 } }]), false, 100);
const quiet = playTurn(healthy, { u1: { kind: "pass" } }, fightConfig);
assert(!quiet.log.some((l) => l.includes("Lick")), "the condition is about its owner: no heal at full HP");

// Can't be hit (the default): never aimed at, and never worn down.
const safe = fight(pet([{ moveId: "nip" }]));
for (let i = 0; i < 300; i++) { pickIntent(safe, fightConfig); assert(!safe.enemyTargetPet); }
// Can be hit: sometimes aimed at; it takes the blow instead of its owner, and sits out at 0 HP.
const exposed = fight(pet([{ moveId: "nip" }]), true);
let aimed = 0;
for (let i = 0; i < 300; i++) { pickIntent(exposed, fightConfig); if (exposed.enemyTargetPet) aimed++; }
assert(aimed > 40 && aimed < 200, `pets are aimed at some of the time (${aimed}/300)`);
const tank = fight({ ...pet([{ moveId: "nip" }]), hp: 5 }, true);
tank.enemyTargetPet = true;
playTurn(tank, { u1: { kind: "pass" } }, fightConfig);
assert.equal(tank.members[0]!.hp, 100, "the owner takes nothing when their pet is hit");
assert(tank.members[0]!.pet!.out, "a pet at 0 HP sits out");
const after = playTurn(tank, { u1: { kind: "pass" } }, fightConfig);
assert(!after.log.some((l) => l.includes("Fang")), "and doesn't act again that fight");

console.log("Pet checks passed: stats, stages, moves, owning, the cap, feeding, naming, releasing, hatching, and fights: acting after the owner, owner-aimed effects, and being hit only when allowed.");
