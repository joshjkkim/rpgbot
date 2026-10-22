# Changelog

What's new in havocish, newest first. Posted to the support server and shown at havocish.com/changelog.

## Unreleased

### New
- **Rare-find announcements.** Loot, gather or craft something rare and the server hears about it: "✨ @you found 🌠 Starmetal Shard at Deep Veins!" Server owners pick the channel and how rare an item has to be (Epic and up by default) at the top of the Items page.
- **Recipe scrolls.** Some recipes are now secrets: they show as ??? in `/craft` until you read the scroll that teaches them, which you might loot from a world boss, find while gathering or earn from a quest. In Classic Fantasy, the Starforged Blade's recipe drops from the Hollow King, and rarely from liches.
- **For server owners: hidden recipes.** Turn on "Hidden until learned" on any recipe, then give an item the "Teach a recipe" use action and drop, sell or reward it wherever you like. The Crafting page shows which item teaches each hidden recipe, and the health check warns when nothing does.

## v0.13 · October 20, 2026

### New
- **For server owners: keep your leveling bot.** havocish can now run just the RPG next to the leveling bot you already use. Switch havocish's leveling off on the dashboard's new Leveling page or with Leveling in `/config`: members earn no chat or voice XP from havocish and dailies pay only gold, while fights, gathering, crafting, quests and the shop keep working. Lock gear and content behind the roles your leveling bot gives, under Requirements. The setup wizard now asks about this first.
- **For server owners: role rewards.** Give gold, an item or Combat XP when a member gets a role, from any bot or a mod: reward the level roles your leveling bot hands out, and leveling up there pays off in the RPG here. Each member is paid once per role, and `/admin reset-role-reward` lets someone get it again. They work with havocish's leveling on or off.
- **For server owners: level rewards can give gold, items and Combat XP.** Besides roles and messages, reaching a chat level can now pay into the RPG: a gold bonus at level 10, a weapon at 25, a Combat XP boost at 50. What a member got is listed under their level-up message.
- **Chatting makes you stronger.** Every chat level adds a little HP and attack on top of your Combat stats (+2 HP and +0.5 attack per level by default), so being active pays off in fights too. `/me` shows what your chat level adds. Server owners can tune it or turn it off on the Combat page.
- **Level-up cards for Combat and skills.** Every new Combat level shows a level-up card on the fight result, and every 10th level of a skill (and its cap) posts one under your gathering or crafting. Server owners can switch either off on the Style page.

### Changed
- **For server owners: one Leveling page.** XP and Levels are now a single page, in tabs: Earning XP, Dailies & streaks, Levels, and Rewards. Old links still work.

### Fixed
- Duels ignored Combat level: both sides fought as Combat 1 plus their gear. Duels now use each side's real Combat level.

## v0.12 · October 19, 2026

### New
- **Combat level.** The RPG now has its own level, from Combat 1 to 99, separate from chat level. Fights, world bosses, quests, achievements and items that give XP pay Combat XP, and your Combat level sets your stats, which enemies you meet and which gear you can use. Chat level is for chatting. Nobody gets weaker: your Combat level starts at your chat level today, and from there it grows only by fighting. See it on `/me`.
- **Crafting.** Turn what you gather and loot into better things with `/craft`. Each crafting station is its own skill: better recipes open as it grows. Most stations use the forge meter: strike as the bar crosses the zone to make the item, hit the centre for a masterwork (sometimes something rarer than the recipe's usual result), or miss and lose some of your materials. Higher skill widens the zone.
- **For server owners: requirements on anything.** Items, gathering spots, recipes, enemies and quests can now require any mix of skill levels, roles, days in the server or boosting. Already use another leveling bot? Require the role it gives at a level, and havocish follows your existing levels. Members are told exactly what they're missing.
- **For server owners: build your own stations.** On the dashboard's new Crafting page, create any station (smithing, cooking, engineering), write its recipes, and decide what a masterwork can turn into. Pick the forge meter for skill and risk, or a plain Craft button, and tune how forgiving the forge is. Every item's page now shows which recipes make it and which use it.
- **Classic Fantasy: Smithing, Alchemy and Cooking.** The starter pack now comes with three stations and twelve recipes built from what you gather: forge pickaxes and swords (some weapons only a smith can make), brew healing draughts and a Charm of the Grove, and cook your catch into healing food. Servers that already added the pack can add it again from Starter packs to get them; nothing you changed is touched.

### Changed
- **For server owners: a tidier dashboard.** The sidebar is grouped into Server, Leveling, RPG and Analytics, and Economy is now called Shop.

### Fixed
- Equipping an item ignored its level and role requirements. It now checks them, like buying and using do.

## v0.11 · October 18, 2026

### New
- **Gathering.** A new kind of activity, played with `/gather`. Each one is a short button minigame: push your luck on a grid, react to a signal in time, or spot the target among look-alikes. Every server makes its own, so it might be mining in a fantasy server, salvaging in a sci-fi one or baking in a cozy one. Each activity has an energy bar of 10 runs that refills over an hour, so you can settle in for a proper session.
- **Skills and tools.** Every activity has its own skill, from 1 to 50. Higher skill opens better locations with better finds, and makes the game a little easier. Tools from the shop help too, and the best spots need one. See your skills on `/me`. Everything you find sells in `/inventory`.
- **For server owners: build your own.** On the dashboard's new Gathering page, create any activity, pick its minigame and write every word players see. Set its locations, what each one finds and how often, and make any item a tool. Want a head start? Classic Fantasy now comes with three ready-made activities to use as they are or reword. If you added the pack before, click **Add to my server** on Starter packs to get them.

### Improved
- **A new home on the web.** havocish.com/features shows everything the bot does (you can even play a round of a gathering minigame there), and havocish.com/docs has setup guides for every feature and a list of every command.
- **See what an item does before you buy it.** The shop now lists each item's stats, equip bonuses and use effects, like *+12 Attack · Equip: Fights award 10% more gold* or *Use: Gives 30 health.*
- **For server owners: your moderators can use the dashboard.** Anyone with **Manage Server** in Discord can now open and edit your server on havocish.com, not just the owner. They could already change settings with commands, so this gives them the easier way to do it.
- **For server owners: `/config` is now a row of switches.** Click Shop, Quests, Duels, World bosses and the rest to turn them on or off, right in Discord. Setting things up (items, enemies, quests, levels) happens on the dashboard.
- **For server owners: `/set` and `/admin-inv` are now `/admin set` and `/admin items`.** Same options, one command.
- **For server owners: items have their own page.** On the dashboard's new Items page, every item shows where it comes from (the shop, which enemies drop it and how often, where it's gathered, which quests reward it) and what it's for, with links to each. It also warns you about items nothing gives. Economy now shows a live preview of `/shop` as members see it.

### Fixed
- Shop categories now follow their sort order, and hidden categories and categories limited to a role are kept from members who shouldn't see them. All three settings were ignored before.
- Voice XP was paid even with Voice XP turned off. The switch now works. If your server wants voice XP, turn it on in `/config`.
- Renaming an item, or changing its emoji or description, now shows up everywhere. Items people already owned kept the old name in `/inventory`, `/me` and `/trade`.

## v0.10 · October 18, 2026

### New
- **Hunting quests.** Quests can now ask you to defeat enemies (any, or specific ones like *"Defeat Grey Wolf ×10"*) or win duels. World bosses count, so *Topple the Throne* pays out when the Hollow King falls. The kill that finishes a quest says so on the spot: *"📜 Quest complete: The Wolf Problem. Claim it in `/quests`."*
- **A much bigger Classic Fantasy pack.** Fifteen enemies instead of five, a gear upgrade every few levels in every slot (now including legs and hands), loot to sell, two rare drops to chase, eight new hunting quests and two new achievements. Already added it? Click **Add to my server** again on the Starter packs page to get just the new parts. Nothing you've changed is touched.

### Improved
- **Drink potions mid-fight.** Healing potions in your bag show up as buttons next to Attack and Flee. Drinking one heals you but uses your turn, so the enemy still swings.
- **Lost your fight in a busy channel?** Run `/fight` again and it comes back to you, right where you left it.
- **For server owners: new servers level at a pace that lasts.** The default is now the wizard's Standard pace: 5 XP per message on a curve where each level costs a bit more than the last. The first level-up comes after about 16 messages and level 10 after about 1,260, so each level and each upgrade feels earned, and fights and quests still matter next to chatting. The wizard's Relaxed and Hardcore paces were rescaled around it. Servers that already set their own levels are unchanged.
- **For server owners: Simple and Advanced settings.** Dashboard pages now open in Simple mode, showing just the settings most servers need. Switch to **Advanced** at the top of any page (or click **Show** at the bottom) for everything else, like per-channel rates, role bonuses and player stats. havocish remembers your choice.

### Fixed
- Quests to spend gold in the shop now count your purchases. They never moved before.
- **Your first level-up comes much sooner.** Level 1 took two steps of the level curve instead of one, up to four times longer than every other level. Now every level takes what the server's curve says. If you already had some XP, you'll find yourself one level higher.
- Walking away from a fight, or the bot restarting mid-fight, now counts as fleeing: no penalty, but you keep the damage you took. It used to quietly restore your HP, which made ignoring a losing fight better than fleeing.
- Using a potion with `/use` during a fight wasted it. Now, while you're in a fight, everything except `/fight` and `/help` waits until it's over, and links you back to the fight.

## v0.9 · October 18, 2026

### New
- **For server owners: a setup wizard.** Answer five questions (how fast people level up, which features you want, where level-ups go, which roles to give at which levels, and whether to start with a pack) and havocish sets itself up. Find it on the dashboard Overview, or from the button when havocish joins a server.

## v0.8 · October 18, 2026

### Improved
- Using and equipping items now tells you what happened: *"Used 🧪 Healing Draught. ❤️ 20 → 70 / 220 HP. 1 left."* or *"Equipped 🗡️ Iron Sword (weapon). ⚔️ ATK 26 → 34."* No more checking `/me` to see if it worked.

## v0.7 · October 18, 2026

### New
- **For server owners: a setup check on the dashboard.** The Overview now tells you about anything that would quietly fail, like a channel havocish can't post in, a reward role it can't give, combat with no enemies, or a quest reward pointing at a deleted item. Each comes with a **Fix** link to the right page.

## v0.6 · October 17, 2026

### Improved
- **`/quests` is now a quest log.** Every quest shows what to do ("Send 25 messages in #general"), your progress bar, how often it repeats and exactly what it pays, items included.
- Accept and claim quests with one button. No more typing quest IDs.

### Fixed
- **Claim all** actually claims your finished quests now.

## v0.5 · October 17, 2026

### New
- **`/me`**: your character at a glance. HP, attack, defence, speed, crit, every piece of gear and what it adds, all in one place. `/me @someone` to inspect a friend.

### Fixed
- The profile card's XP bar now adds up: 115 XP reads **115 / 200**, not 15 / 100.
- `/set level` gives the right amount of XP for that level instead of 0.
- `/daily`, `/inventory`, duels and more no longer fail when the bot can't post in a log or announcement channel.
- You can't be challenged to a duel at 0 HP anymore, so nobody can farm your gold. Heal with `/daily` or a potion first.
- Duel results show names instead of raw `<@…>` text.
- The Stats, Achievements and Combat buttons on someone's `/profile` now show *their* stats, not yours.
- Signing in on havocish.com works again after a change on Discord's side.

## v0.4 · October 14, 2026

### New
- **`/help`**: a short guide to everything havocish does, with a page for server owners.
- New servers get a **⚡ Set up with a starter pack** button when havocish joins, so there's something to play right away.

### Improved
- World bosses survive bot restarts. A fight in progress picks up where it left off.

## v0.3 · October 13, 2026

### New
- **World bosses**: a huge enemy the whole server fights together. Rewards are split by damage dealt, and the top damage dealer rolls the loot. Owners can `/boss summon` one, or let them appear on their own.
- **Random encounters**: wild enemies sometimes appear while you chat. First to click **Fight** takes it on.
- **The Hollow King** 👑, a world boss in the Classic Fantasy starter pack.
- Owners see a **live preview** of the profile card and level-up banner while changing colours on the dashboard.

### Improved
- The dashboard got a full rework: items, enemies, quests and achievements as an inventory grid with tooltips, a save bar that follows you, Ctrl/⌘+S to save, a plain-language overview and pixel art throughout.
- A new havocish.com, with a pixel-art night scene and the bot's real cards.

## v0.2 · October 10, 2026

### New
- **Level-up banners**: levelling up posts an image in your server's colours.
- **Sell items** straight from `/inventory`.
- Owners pick channels, roles and items from dropdowns on the dashboard instead of pasting IDs.

### Fixed
- XP from voice, fights, items, quests and achievements now triggers level-ups and level rewards, not just chatting.

## v0.1 · September 2026

### New
- havocish launches: levels, gold, a shop, gear, turn-based fights, duels, quests, achievements and trading, all set up from a web dashboard.
- Items show as tooltip cards, like an MMO.
- The **Classic Fantasy** starter pack fills a server with items, enemies and quests in one click.
- A setup quest log walks owners through getting their server ready.
