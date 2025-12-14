import * as daily from "./user/daily.js";
import * as profile from "./user/profile.js";
import * as configXp from "./admin/configXp.js";
import * as configLevels from "./admin/configLevels.js";
import * as levels from "./user/leveling.js";
import * as set from "./admin/set.js";
import * as configStyle from "./admin/configStyles.js";
import * as configStreak from "./admin/configStreak.js";
import * as config from "./admin/configGeneral.js";
import * as leaderboard from "./user/leaderboard.js";
import * as configShop from "./admin/configShop.js";
import * as shop from "./user/shop.js";
import * as inventory from "./user/inventory.js";
import * as adminInventory from "./admin/adminInventory.js";
import * as use from "./user/use.js";
import * as configLogging from "./admin/configLogging.js";
import * as configAchievements from "./admin/configAchievements.js";

export const commandList = [
    daily.data,
    profile.data,
    configXp.data,
    configLevels.data,
    levels.data,
    set.data,
    configStyle.data,
    configStreak.data,
    config.data,
    leaderboard.data,
    configShop.data,
    shop.data,
    inventory.data,
    adminInventory.data,
    use.data,
    configLogging.data,
    configAchievements.data,
]

export const commands = new Map<string, any>([
    [daily.data.name, daily],
    [profile.data.name, profile],
    [configXp.data.name, configXp],
    [configLevels.data.name, configLevels],
    [levels.data.name, levels],
    [set.data.name, set],
    [configStyle.data.name, configStyle],
    [configStreak.data.name, configStreak],
    [config.data.name, config],
    [leaderboard.data.name, leaderboard],
    [configShop.data.name, configShop],
    [shop.data.name, shop],
    [inventory.data.name, inventory],
    [adminInventory.data.name, adminInventory],
    [use.data.name, use],
    [configLogging.data.name, configLogging],
    [configAchievements.data.name, configAchievements],
])