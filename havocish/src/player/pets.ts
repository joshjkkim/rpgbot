import { randomUUID } from "node:crypto";
import type { GuildConfig } from "../types/guild.js";
import type { DbUserGuildProfile, item } from "../types/userprofile.js";
import type { EnemyMove } from "../content/fight.js";
import type { OwnedPet, PetSpecies, PetStats, PetsProgress } from "../types/pets.js";
import { skillLevel, skillProgress } from "./gathering.js";

/**
 * Pets' rules: what a server allows, a pet's level, stats, look and moves,
 * and the changes a member makes (getting, feeding, naming, switching,
 * releasing). These only change the profile object; callers commit it.
 * Pets level on the gathering skill curve, capped per species.
 */

export function petRules(config: GuildConfig) {
    const p = config.pets;
    const clamp = (n: unknown, fallback: number, min: number, max: number) =>
        typeof n === "number" && Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
    return {
        enabled: !!p?.enabled,
        maxOwned: clamp(p?.maxOwned, 10, 1, 50),
        xpShare: clamp(p?.xpShare, 50, 0, 200),
        canBeHit: !!p?.canBeHit,
        foods: p?.foods ?? {},
    };
}

export const speciesOf = (config: GuildConfig, id: string): PetSpecies | undefined => {
    const s = config.pets?.species?.[id];
    return s && s.enabled !== false ? s : undefined;
};

export const petsOf = (profile: DbUserGuildProfile): PetsProgress => profile.user_stats?.pets ?? { owned: [] };

export function petLevel(pet: OwnedPet, species: PetSpecies, config: GuildConfig) {
    return Math.min(maxLevelOf(species, config), skillLevel(pet.xp, config));
}
const maxLevelOf = (species: PetSpecies, config: GuildConfig) => Math.max(1, Math.min(config.gathering.skill.maxLevel, species.maxLevel ?? 30));

/** Level and progress to the next, for a bar. `span` is 0 at the species' cap. */
export function petProgress(pet: OwnedPet, species: PetSpecies, config: GuildConfig) {
    const level = petLevel(pet, species, config);
    const p = skillProgress(pet.xp, config);
    return level >= maxLevelOf(species, config) ? { level, into: 0, span: 0 } : p;
}

export function petStats(species: PetSpecies, level: number): PetStats {
    const n = Math.max(0, level - 1);
    const stat = (k: keyof PetStats) => Math.max(k === "hp" ? 1 : 0, Math.round((species.base?.[k] ?? 0) + (species.growth?.[k] ?? 0) * n));
    return { hp: stat("hp"), atk: stat("atk"), def: stat("def"), spd: stat("spd") };
}

/** How it looks at this level: the latest stage reached, over the species' own look. */
export function petLook(species: PetSpecies, level: number) {
    const stages = [...(species.stages ?? [])].filter((s) => s.atLevel <= level).sort((a, b) => a.atLevel - b.atLevel);
    const at = stages.at(-1);
    const image = at?.image ?? species.image;
    return { emoji: at?.emoji || species.emoji, stage: at?.name, ...(image && { image }) };
}

/** Its moves at this level: the species' own, plus every stage's reached so far. */
export function petMoves(species: PetSpecies, level: number): EnemyMove[] {
    return [...(species.moves ?? []), ...(species.stages ?? []).filter((s) => s.atLevel <= level).flatMap((s) => s.moves ?? [])];
}

export function activePet(profile: DbUserGuildProfile, config: GuildConfig) {
    const mine = petsOf(profile);
    const pet = mine.owned.find((p) => p.uid === mine.active);
    const species = pet && speciesOf(config, pet.speciesId);
    return pet && species ? { pet, species } : null;
}

function save(profile: DbUserGuildProfile, pets: PetsProgress, counters: { adopted?: boolean; level?: number } = {}) {
    const stats = { ...(profile.user_stats ?? {}), pets } as NonNullable<typeof profile.user_stats>;
    if (counters.adopted) stats.petsAdopted = (stats.petsAdopted ?? 0) + 1;
    if (counters.level && counters.level > (stats.petBestLevel ?? 0)) stats.petBestLevel = counters.level;
    profile.user_stats = stats;
}

/** Gives a pet. The first one becomes active. Returns the pet, or why not. */
export function addPet(profile: DbUserGuildProfile, config: GuildConfig, speciesId: string): OwnedPet | { refused: string } {
    const species = speciesOf(config, speciesId);
    if (!species) return { refused: "That pet no longer exists." };
    const mine = petsOf(profile);
    if (mine.owned.length >= petRules(config).maxOwned) return { refused: `You already have ${mine.owned.length} pets, the most this server allows. Release one with /pet first.` };
    const pet: OwnedPet = { uid: randomUUID().slice(0, 8), speciesId, name: species.name, xp: 0 };
    save(profile, { owned: [...mine.owned, pet], active: mine.active ?? pet.uid }, { adopted: true, level: 1 });
    return pet;
}

/** Feeds one of an item: takes it and adds its pet XP. Returns the levels before and after, or why not. */
export function feedPet(profile: DbUserGuildProfile, config: GuildConfig, uid: string, itemId: string): { before: number; after: number; xp: number } | { refused: string } {
    const xp = petRules(config).foods[itemId] ?? 0;
    if (xp <= 0) return { refused: "That isn't something pets eat here." };
    const have = profile.inventory?.[itemId]?.quantity ?? 0;
    if (have < 1) return { refused: "You don't have any of that." };
    const mine = petsOf(profile);
    const pet = mine.owned.find((p) => p.uid === uid);
    const species = pet && speciesOf(config, pet.speciesId);
    if (!pet || !species) return { refused: "That pet isn't here any more." };
    const before = petLevel(pet, species, config);
    const inv: Record<string, item> = { ...(profile.inventory ?? {}) };
    if (have > 1) inv[itemId] = { ...inv[itemId]!, quantity: have - 1 };
    else delete inv[itemId];
    profile.inventory = inv;
    const fed = { ...pet, xp: pet.xp + xp };
    const after = petLevel(fed, species, config);
    save(profile, { ...mine, owned: mine.owned.map((p) => (p.uid === uid ? fed : p)) }, { level: after });
    return { before, after, xp };
}

/** Adds XP to the active pet (a fight win). Returns the levels, or null without one. */
export function giveActivePetXp(profile: DbUserGuildProfile, config: GuildConfig, xp: number): { pet: OwnedPet; species: PetSpecies; before: number; after: number } | null {
    const active = activePet(profile, config);
    if (!active || xp <= 0) return null;
    const mine = petsOf(profile);
    const pet = { ...active.pet, xp: active.pet.xp + Math.round(xp) };
    const after = petLevel(pet, active.species, config);
    save(profile, { ...mine, owned: mine.owned.map((p) => (p.uid === pet.uid ? pet : p)) }, { level: after });
    return { pet, species: active.species, before: petLevel(active.pet, active.species, config), after };
}

export function renamePet(profile: DbUserGuildProfile, uid: string, name: string): string | null {
    const clean = name.replace(/[\n\r*_`~|<>@]/g, "").trim().slice(0, 32);
    if (!clean) return "Give it a name of at least one letter.";
    const mine = petsOf(profile);
    if (!mine.owned.some((p) => p.uid === uid)) return "That pet isn't here any more.";
    save(profile, { ...mine, owned: mine.owned.map((p) => (p.uid === uid ? { ...p, name: clean } : p)) });
    return null;
}

export function setActivePet(profile: DbUserGuildProfile, uid: string): boolean {
    const mine = petsOf(profile);
    if (!mine.owned.some((p) => p.uid === uid)) return false;
    save(profile, { ...mine, active: uid });
    return true;
}

/** Lets a pet go for good. The next one becomes active if it was. */
export function releasePet(profile: DbUserGuildProfile, uid: string): OwnedPet | null {
    const mine = petsOf(profile);
    const pet = mine.owned.find((p) => p.uid === uid);
    if (!pet) return null;
    const owned = mine.owned.filter((p) => p.uid !== uid);
    const active = mine.active === uid ? owned[0]?.uid : mine.active;
    save(profile, { owned, ...(active && { active }) });
    return pet;
}
