import type { AchievementsConfig } from "@/app/components/achievements/achievementsEditor";
import type { CombatConfig } from "@/app/components/combat/combatEditor";
import type { GatheringConfig } from "@/app/components/gathering/gatheringEditor";
import type { CraftingConfig } from "@/app/components/crafting/craftingEditor";
import type { LevelsConfig } from "@/app/components/levels/levelsEditor";
import type { LoggingConfig } from "@/app/components/logging/loggingEditor";
import type { QuestsConfig } from "@/app/components/quests/questsBasicEditor";
import type { ShopConfig } from "@/app/components/shop/shopBasicsEditor";
import type { StyleConfig } from "@/app/components/styles/styleBasicsEditor";

/**
 * A guild config as the dashboard holds it: each section typed by the editor
 * that owns it. Sections no editor owns yet (trading, and XP, whose editor is
 * untyped) stay unknown and pass through saves untouched.
 */
export type DashboardConfig = {
  levels?: LevelsConfig;
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
