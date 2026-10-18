import { totalXpForLevel, type CurveLevels } from "./levelCurve";
import { applyPack, type GuildConfigJson, type StarterPack } from "./starterPacks";

/**
 * The setup wizard's answers, and how they turn into a guild config. Kept out
 * of the page so the mapping is one readable place: the wizard only collects
 * answers, and this decides which settings they mean.
 */

export type Pace = "relaxed" | "standard" | "hardcore";

type PaceSettings = {
  label: string;
  blurb: string;
  basePerMessage: number;
  xpMessageCooldown: number;
  dailyXp: number;
  dailyGold: number;
  curve: CurveLevels;
};

export const PACES: Record<Pace, PaceSettings> = {
  relaxed: {
    label: "Relaxed",
    blurb: "Levels come quickly. Good for small or casual servers.",
    basePerMessage: 20, xpMessageCooldown: 30, dailyXp: 100, dailyGold: 50,
    curve: { curveType: "polynomial", curveParams: { factor: 100, degree: 2 } },
  },
  standard: {
    label: "Standard",
    blurb: "A steady climb that keeps regulars busy for weeks.",
    basePerMessage: 15, xpMessageCooldown: 60, dailyXp: 50, dailyGold: 20,
    // Also the bot's default for a new server (DEFAULT_GUILD_CONFIG).
    curve: { curveType: "polynomial", curveParams: { factor: 233, degree: 2 } },
  },
  hardcore: {
    label: "Hardcore",
    blurb: "High levels are rare and mean something. Good for big, active servers.",
    basePerMessage: 10, xpMessageCooldown: 60, dailyXp: 30, dailyGold: 10,
    curve: { curveType: "polynomial", curveParams: { factor: 240, degree: 2.2 } },
  },
};

/** How many XP-earning messages reach `level` at this pace, ignoring dailies and bonuses. */
export function messagesToLevel(pace: Pace, level: number) {
  const p = PACES[pace];
  return Math.ceil(totalXpForLevel(level, { ...p.curve, xpOverrides: {} }) / p.basePerMessage);
}

export type Answers = {
  pace: Pace;
  features: { shop: boolean; combat: boolean; duels: boolean; encounters: boolean; quests: boolean; achievements: boolean };
  levelUpChannelId: string;
  levelRoles: Array<{ level: number; roleId: string }>;
  packId: string | null;
};

type Section = Record<string, unknown> & { enabled?: boolean };

/**
 * The wizard's answers applied on top of the server's current config. Content
 * the owner already made (items, enemies, quests) is never removed; a starter
 * pack only adds what's missing.
 */
export function buildSetup(current: GuildConfigJson | null, a: Answers, packs: StarterPack[]): GuildConfigJson {
  const pack = packs.find((p) => p.id === a.packId);
  let next: GuildConfigJson = structuredClone(current ?? {});
  // A pack switches its features on; the answers below then decide them.
  if (pack) next = applyPack(next, pack).config;

  const section = (key: string): Section => (next[key] ??= {}) as Section;
  const pace = PACES[a.pace];

  Object.assign(section("xp"), {
    basePerMessage: pace.basePerMessage,
    xpMessageCooldown: pace.xpMessageCooldown,
    dailyXp: pace.dailyXp,
    dailyGold: pace.dailyGold,
  });

  const levels = section("levels");
  Object.assign(levels, { curveType: pace.curve.curveType, curveParams: pace.curve.curveParams, xpOverrides: {} });
  levels.announceLevelUpInChannelId = a.levelUpChannelId || null;

  // Level roles are added beside existing level actions, never replacing them.
  const actions = { ...((levels.levelActions as Record<number, Array<{ type: string; roleId?: string }>>) ?? {}) };
  for (const { level, roleId } of a.levelRoles) {
    if (!roleId || !(level > 0)) continue;
    const list = [...(actions[level] ?? [])];
    if (!list.some((x) => x.type === "assignRole" && x.roleId === roleId)) list.push({ type: "assignRole", roleId });
    actions[level] = list;
  }
  levels.levelActions = actions;

  const f = a.features;
  section("shop").enabled = f.shop;
  section("quests").enabled = f.quests;
  section("achievements").enabled = f.achievements;
  const combat = section("combat");
  combat.enabled = f.combat;
  combat.pvp = { ...((combat.pvp as object) ?? {}), enabled: f.combat && f.duels };
  combat.encounters = { ...((combat.encounters as object) ?? {}), enabled: f.combat && f.encounters };

  return next;
}
