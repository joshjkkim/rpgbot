# Diff Details

Date : 2026-02-22 22:40:52

Directory /Users/joshuakim/Documents/yeayea

Total : 39 files,  1717 codes, 31 comments, 213 blanks, all 1961 lines

[Summary](results.md) / [Details](details.md) / [Diff Summary](diff.md) / Diff Details

## Files
| filename | language | code | comment | blank | total |
| :--- | :--- | ---: | ---: | ---: | ---: |
| [rpgbot/src/cache/caches.ts](/rpgbot/src/cache/caches.ts) | TypeScript | 2 | 0 | 0 | 2 |
| [rpgbot/src/commands/admin/configLevels.ts](/rpgbot/src/commands/admin/configLevels.ts) | TypeScript | 1 | 0 | 0 | 1 |
| [rpgbot/src/commands/admin/configLogging.ts](/rpgbot/src/commands/admin/configLogging.ts) | TypeScript | 1 | 0 | 0 | 1 |
| [rpgbot/src/commands/admin/configQuests.ts](/rpgbot/src/commands/admin/configQuests.ts) | TypeScript | 85 | 0 | 20 | 105 |
| [rpgbot/src/commands/admin/configShop.ts](/rpgbot/src/commands/admin/configShop.ts) | TypeScript | -12 | 0 | 0 | -12 |
| [rpgbot/src/commands/admin/configStreak.ts](/rpgbot/src/commands/admin/configStreak.ts) | TypeScript | 1 | 0 | 0 | 1 |
| [rpgbot/src/commands/admin/configStyles.ts](/rpgbot/src/commands/admin/configStyles.ts) | TypeScript | 1 | 0 | 0 | 1 |
| [rpgbot/src/commands/admin/configTrading.ts](/rpgbot/src/commands/admin/configTrading.ts) | TypeScript | 1 | 0 | 0 | 1 |
| [rpgbot/src/commands/admin/configXp.ts](/rpgbot/src/commands/admin/configXp.ts) | TypeScript | 1 | 0 | 0 | 1 |
| [rpgbot/src/commands/admin/set.ts](/rpgbot/src/commands/admin/set.ts) | TypeScript | 1 | 0 | 0 | 1 |
| [rpgbot/src/commands/index.ts](/rpgbot/src/commands/index.ts) | TypeScript | 3 | 0 | 0 | 3 |
| [rpgbot/src/commands/user/daily.ts](/rpgbot/src/commands/user/daily.ts) | TypeScript | 9 | 0 | 0 | 9 |
| [rpgbot/src/commands/user/gift.ts](/rpgbot/src/commands/user/gift.ts) | TypeScript | 14 | 0 | 2 | 16 |
| [rpgbot/src/commands/user/profile.ts](/rpgbot/src/commands/user/profile.ts) | TypeScript | 46 | 4 | 10 | 60 |
| [rpgbot/src/commands/user/quests.ts](/rpgbot/src/commands/user/quests.ts) | TypeScript | 2 | 0 | 0 | 2 |
| [rpgbot/src/commands/user/shop.ts](/rpgbot/src/commands/user/shop.ts) | TypeScript | 1 | 0 | 0 | 1 |
| [rpgbot/src/commands/user/trade.ts](/rpgbot/src/commands/user/trade.ts) | TypeScript | 291 | 8 | 51 | 350 |
| [rpgbot/src/db/activeVC.ts](/rpgbot/src/db/activeVC.ts) | TypeScript | 1 | 0 | 0 | 1 |
| [rpgbot/src/db/events.ts](/rpgbot/src/db/events.ts) | TypeScript | 4 | 0 | 0 | 4 |
| [rpgbot/src/db/trade.ts](/rpgbot/src/db/trade.ts) | TypeScript | 221 | 9 | 43 | 273 |
| [rpgbot/src/db/userGuildProfiles.ts](/rpgbot/src/db/userGuildProfiles.ts) | TypeScript | 2 | 0 | 1 | 3 |
| [rpgbot/src/events/interactionCreate.ts](/rpgbot/src/events/interactionCreate.ts) | TypeScript | 5 | 0 | 0 | 5 |
| [rpgbot/src/player/inventory.ts](/rpgbot/src/player/inventory.ts) | TypeScript | 4 | 0 | 0 | 4 |
| [rpgbot/src/player/quests.ts](/rpgbot/src/player/quests.ts) | TypeScript | 8 | -1 | 3 | 10 |
| [rpgbot/src/types/economy.ts](/rpgbot/src/types/economy.ts) | TypeScript | -2 | 0 | 0 | -2 |
| [rpgbot/src/types/logging.ts](/rpgbot/src/types/logging.ts) | TypeScript | 1 | 0 | 0 | 1 |
| [rpgbot/src/types/trading.ts](/rpgbot/src/types/trading.ts) | TypeScript | 38 | 1 | 4 | 43 |
| [rpgbot/src/ui/canvas/drawEmojis.ts](/rpgbot/src/ui/canvas/drawEmojis.ts) | TypeScript | 0 | -1 | -1 | -2 |
| [web/app/api/discord/guilds/\[guildId\]/config/route.ts](/web/app/api/discord/guilds/%5BguildId%5D/config/route.ts) | TypeScript | 0 | 0 | -1 | -1 |
| [web/app/components/logging/loggingEditor.tsx](/web/app/components/logging/loggingEditor.tsx) | TypeScript JSX | 2 | 0 | 0 | 2 |
| [web/app/components/quests/questsBasicEditor.tsx](/web/app/components/quests/questsBasicEditor.tsx) | TypeScript JSX | 513 | 6 | 53 | 572 |
| [web/app/components/shop/shopBasicsEditor.tsx](/web/app/components/shop/shopBasicsEditor.tsx) | TypeScript JSX | 346 | 5 | 12 | 363 |
| [web/app/components/sidebar/sidebar.tsx](/web/app/components/sidebar/sidebar.tsx) | TypeScript JSX | 67 | 0 | 5 | 72 |
| [web/app/components/styles/styleBasicsEditor.tsx](/web/app/components/styles/styleBasicsEditor.tsx) | TypeScript JSX | 37 | 0 | 3 | 40 |
| [web/app/dashboard/\[guildId\]/layout.tsx](/web/app/dashboard/%5BguildId%5D/layout.tsx) | TypeScript JSX | -25 | 0 | -3 | -28 |
| [web/app/dashboard/\[guildId\]/logging/loggingPageClient.tsx](/web/app/dashboard/%5BguildId%5D/logging/loggingPageClient.tsx) | TypeScript JSX | 2 | 0 | 0 | 2 |
| [web/app/dashboard/\[guildId\]/quests/page.tsx](/web/app/dashboard/%5BguildId%5D/quests/page.tsx) | TypeScript JSX | 5 | 0 | 2 | 7 |
| [web/app/dashboard/\[guildId\]/quests/questsPageClient.tsx](/web/app/dashboard/%5BguildId%5D/quests/questsPageClient.tsx) | TypeScript JSX | 38 | 0 | 9 | 47 |
| [web/app/hooks/useGuildConfig.ts](/web/app/hooks/useGuildConfig.ts) | TypeScript | 2 | 0 | 0 | 2 |

[Summary](results.md) / [Details](details.md) / [Diff Summary](diff.md) / Diff Details