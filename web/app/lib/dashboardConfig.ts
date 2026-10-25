import type { AchievementsConfig } from "@/app/components/achievements/achievementsEditor";
import type { CombatConfig } from "@/app/components/combat/combatEditor";
import type { GatheringConfig } from "@/app/components/gathering/gatheringEditor";
import type { CraftingConfig } from "@/app/components/crafting/craftingEditor";
import type { LevelsConfig } from "@/app/components/levels/levelsEditor";
import type { RoleRewardsConfig } from "@/app/components/levels/roleRewardsEditor";
import type { CollectionsConfig } from "@/app/components/collections/collectionsEditor";
import type { CharactersConfig } from "@/app/components/characters/charactersEditor";
import type { UnlocksConfig } from "@/app/components/combat/levelRolesEditor";
import type { LoggingConfig } from "@/app/components/logging/loggingEditor";
import type { QuestsConfig } from "@/app/components/quests/questsBasicEditor";
import type { ShopConfig } from "@/app/components/shop/shopBasicsEditor";
import type { StyleConfig } from "@/app/components/styles/styleBasicsEditor";

/**
 * A guild config as the dashboard holds it: each section typed by the editor
 * that owns it. Sections no editor owns yet (trading) stay unknown and pass
 * through saves untouched. XP's editor is untyped, so only its switch is typed.
 */
export type DashboardConfig = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the XP editor works on untyped JSON
  xp?: { enabled?: boolean } & Record<string, any>;
  levels?: LevelsConfig;
  roleRewards?: RoleRewardsConfig;
  collections?: CollectionsConfig;
  characters?: CharactersConfig;
  unlocks?: UnlocksConfig;
  /** Mirrored from havocish/src/types/guild.ts. */
  rareFinds?: { channelId?: string | null; minRarity?: string };
  shop?: ShopConfig;
  combat?: CombatConfig;
  gathering?: GatheringConfig;
  crafting?: CraftingConfig;
  quests?: QuestsConfig;
  achievements?: AchievementsConfig;
  style?: StyleConfig;
  logging?: LoggingConfig;
  [section: string]: unknown;
};
