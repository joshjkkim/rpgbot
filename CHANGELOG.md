# Changelog

What's new in havocish, newest first. Posted to the support server and shown at havocish.com/changelog.

## Unreleased

### New
- **Upgrade your gear.** `/upgrade` takes a piece of your gear from +1 to +5 for gold (and, on some servers, a material). Each step costs more and is less sure, and a good strike on the forge bar raises your chance. A failed step costs what it cost, never the item. Upgrades show on `/me` and your character pane.

### For server owners
- **Gear upgrades are yours to tune.** On the Shop page: turn them on or off, rename them (Enhance, Overclock…), set the chance of each step and how many there are, what each + adds, the gold cost, the strike bonus, and an optional material, so gathering has another use.

## v0.17 · October 25, 2026

A polish update from playtesting: your character drawn on /me, gold that's worth chasing, sturdier early fights, and starter packs that update without undoing your work.

### Improved
- **Starter packs update without undoing your work.** Adding a pack you already have now brings its latest numbers to everything you haven't changed, and keeps anything you edited exactly as you left it. The Library says how much will update and how much it keeps before you add. Add Classic Fantasy or Frontier Station again to get this update's new balance.
- **Gold is worth chasing.** In both starter packs, late gear costs more (about double by Combat 40), crafting costs a little gold, and collections and quests pay more in items and XP than in gold. Fighting alone no longer buys everything; gathering, crafting and questing do their part.
- **`/me` draws your character.** A character pane like the classic RPGs: your avatar with your gear in slots around it, each in its rarity's colour, and your Combat level, HP and XP. Wounded shows on your portrait. Server owners can turn it off on Style.
- **`/me` catches up with Combat v2.** Your character sheet now shows your four fight moves, your title from gear next to your name, and when you're Wounded (and when it wears off). New **Moves** and **Collection** buttons sit beside Inventory and Change gear.
- **Fight threads tidy themselves away.** A fight's thread now leaves the channel list as soon as the fight ends, instead of an hour later. The result line stays in chat, and opens the thread if you want to look back.

### Fixed
- **Early enemies last more than one hit.** Giant rats, slimes and their sci-fi cousins now take a few turns, so even a first fight has a move to read. New enemies made with Fill in the numbers start the same way.
- **The chat bonus can't skip the early game.** Chat levels still make you stronger, but count up to 5 + twice your Combat level: a long-time chatter starts with a head start, not a free pass, and gets the full bonus by around Combat 18.
- **Running `/setup` again with "Start blank" no longer turns features off.** Blank adds nothing, so a server that's already playing keeps combat, the shop, quests and achievements exactly as they were.

## v0.16 · October 24, 2026

Easy to start, and part of your Discord: set up in a minute without leaving it, a second world to start in, characters who speak in their own name, and new areas that open as members grow.

### New
- **New areas open as you grow.** Reach the Combat level a place asks for (or a skill level, or finish a collection) and you earn its role: on servers that hide the channel behind it, a new channel appears in your list. "🗺️ @you unlocked ⚰️ The Barrow Crypt!"
- **Characters.** Villains, quest givers and shopkeepers now speak in their own name. A world boss arrives saying one of its lines, the quest giver announces your quest done, the merchant shouts about your rare find. Both starter packs come with a cast: re-add yours from the Library to get it.

### For server owners
- **Set up havocish without leaving Discord.** Run `/setup`, or press **Set up here** on the welcome message. It asks who handles leveling, how fast members level, which world to start with (a starter pack, or blank to build your own), what to call money and XP, and where level-ups go. The dashboard's setup still works the same.
- **The Library: take only the pieces you want.** The Starter packs page is now the Library. Add a whole pack, or tick single pieces (one enemy, a crafting station, a quest), and anything they need comes along. Before adding, it shows exactly what you'll get, and it never touches what you've already made.
- **A second starting world: Frontier Station.** A sci-fi station at the edge of known space: drones, scavengers and rogue AIs to fight, salvaging, hacking and scanning to gather, a fabricator and a research lab, EMP bursts that break an enemy's wind-up, and the Hive Mind as the world boss. Pick it in `/setup`, or take pieces of it from the Library.
- **Make your own characters.** The new Characters page: a name, a picture (an emoji, a link, or upload one) and lines they say. Pick who speaks for the shop and for announcements, and choose a character on any enemy or quest. For the full effect, give havocish the Manage Webhooks permission; without it, their name and picture sit at the top of the bot's posts.
- **Roles at Combat and skill levels.** On Combat rules, give a role at any Combat level or gathering and crafting skill level: "At Combat 14 give @Crypt Dweller". Hide a place's channels behind that role in Discord and it opens as members grow. Both starter packs come with levels set for their tougher places; you pick the roles.
- **Every announcement on one page.** The new Announcements page lists everything havocish posts for the server (level-ups, rare finds, quests, achievements, milestones, places opening, dailies, streaks, gifts, role rewards) with its channel, message and who says it. Point them all at #adventure-log in one go.
- **Fair numbers in one click.** Making an enemy? Pick a level and a kind (weak, normal, tough, rare elite or world boss) and press **Fill in the numbers**: its stats, level range and rewards are set the way Classic Fantasy's are balanced. Gear works the same way, from its slot, level and rarity. Everything stays editable.
- **A tidier dashboard.** The sidebar is now Start, World (what members meet) and Rules (switches you set once). Combat's player stats, parties, duels, encounters and bosses moved to their own **Combat rules** page.
- **Make an item where you need it.** Picking a drop, an ingredient or a reward that doesn't exist yet? Choose **+ New item…** in the list, name it, and it's made on the spot.
- **See which tools open a location.** A gathering location that needs a tool now lists the tools that open it, right under the tier, so planning it doesn't mean a trip to the Items page.
- **Materials in their own category.** In both starter packs, ores, herbs, fish, data and monster parts now sit apart from charms, rings and scrolls, so the shop and the Library are easier to browse. Items you already have stay where you put them.
- **Send a world boss away.** `/boss dismiss` ends the current world boss at once, with no rewards, for when one was summoned by mistake or at a bad time.

## v0.15 · October 22, 2026

Combat v2: fights you read and answer, party play, places, collections and losses that sting. Fights are now a read of what's coming, not a click on Attack: enemies show their next move, you pick from moves you've earned, and friends can jump in. Around it, the rest of the game got reasons to play: places with their own enemies, gathering that changes with the weather, collections to complete, crafted gear that beats bought, and losses that sting.

### Fights
- **Enemies show their next move.** Every round you see what's coming: "👁️ Grey Wolf crouches low…", or a red ❗ when a big hit is winding up. Guard the heavy blow, strike while it charges, interrupt it with a stun.
- **Moves to choose each turn, and `/moves` to pick them.** Fights now use moves, not just Attack: Heavy Strike, Guard and Counter to start, and more that unlock with Combat level, from gear, or from move scrolls you find. Pick the four you take in with the new `/moves`. When a level-up opens a new move, the fight tells you.
- **Speed decides who acts first.** The faster side acts first, and the fight says who goes first under the buttons. Some moves always strike first.
- **Statuses that tick, change stats and stack.** Bleeding, poison, burning and regeneration tick each turn; others lower or raise stats, and some stack. The battle shows them with turns left.
- **Battle scenes, drawn every round.** Each fight is drawn: you, the enemy, HP bars and statuses, updated every round. Server owners can turn it off.
- **Party fights: join someone's fight, up to 3 of you.** Press **Join** on someone's fight to help, up to 3 of you. Everyone picks a move, the round plays when you've all picked (or after 30 seconds), and each player rolls their own drops. The enemy gets tougher for each extra player.
- **Places: channels with their own enemies.** Channels can be places with their own enemies: wolves in #the-woods, the dead in #the-crypt. Fights there open in a thread so chat stays clear.
- **Every result shows what you're working toward.** Every fight, gathering run and craft ends with what you're working toward: the next move, location or recipe, and how many levels away it is. Outgrown an enemy? It says where fairer fights are.
- **Easy enemies pay less.** Beating something far below your level gives less XP, so it pays to move on.
- **Rare elite enemies.** Some enemies turn up only now and then, and they hit harder.

### Health and losing
- **HP refills on its own.** From empty to full over two hours. Food and potions still heal right away.
- **Losing drops some gold and leaves you Wounded.** You drop 5% of the gold you're carrying (at least 10), come back on 25% HP, and are 🩹 Wounded for 10 minutes: lower attack and defence until it wears off. A good time to gather or craft.

### World bosses
- **Bosses fight back in waves.** The boss shows its next move with a countdown, then it lands on everyone who attacked since the last wave. Press 🛡️ **Guard** to take 70% less. Each fighter is told privately what hit them. Some bosses guard or heal between waves.

### Gathering and crafting
- **Gathering locations with traits that change how they play.** Some have traits that change how they play: only digging next to what you've opened, false alarms, a glimpse before it hides.
- **Conditions that change every few hours.** Every few hours each location rolls a condition, the same for everyone: richer finds, harder going, rare loot, or calm. Runs show what's on and when it ends.
- **Daily stock on some shop items.** Some shop items now have a daily limit, so the best ones are worth crafting.
- **Gathering and crafting quests.** Quests can now ask you to gather or craft items, any or specific ones.

### Collections
- **`/collection`: sets to complete, with rewards along the way.** Server-made sets to complete: every ore and gem, a bestiary, a set of crafted arms. Items count once you've had one, enemies once you've beaten one, and missing ones show as ???. Rewards come at milestones along the way, with the best at the end, and finishing one can unlock recipes, moves or places.

### Classic Fantasy
- **A slower, fairer pace.** XP retuned so each area lasts longer, and gathering and crafting matter: 8 armour pieces crafted from monster parts, stronger forged swords, and three locations that need Combat 15.
- **New moves, places, elites, quests, achievements and 7 collections.** Moves for every enemy, places, rare elites, the Hollow King's four moves, 7 collections, new quests (a prospector's contract, kitchen duty, a smith's commission, a herb run) and achievements for parties, gathering, crafting and collections. Server owners: re-apply the pack on the dashboard to get it. Nothing you've changed is overwritten.

### Your settings
- **Quiet mode: no pings from the bot.** `/settings quiet` stops the bot pinging you. You still see everything, just without the notification.
- **One-time tips for your first fight, loss and party.** The first time you fight, lose or join a party, a short tip explains what's going on.

### For server owners
- **Build your own moves and statuses.** On the Combat page, from blocks: hit, guard, counter, heal, boost, status, stun, cleanse. Add drawbacks, wind-ups, cooldowns, uses per fight and conditions. Give enemies their own moves with weights.
- **Map channels to enemy pools.** Places on the Combat page map channels or categories to enemy pools, each enemy with a weight, plus a spawn weight per enemy for rare elites.
- **Party settings.** Players per fight, the turn timer, how much tougher the enemy gets, and whether joiners must be in the enemy's level range.
- **Health settings.** How fast HP refills, where a loss leaves members, and how long they're wounded (and with which status). Losing to an enemy now costs 5% of carried gold by default; set your own under Death penalty.
- **Gathering traits and conditions.** On the Gathering page, built from the same effects, and how many hours a condition lasts.
- **A Collections page.** Pick items and enemies, set milestone rewards, and lock recipes, moves, places or quests behind finishing one.
- **New quest goals and achievement stats.** Gather items, craft items, party wins, gathering runs, crafts made and collections completed.
- **Daily limits per shop item.**
- **A level-up channel for the RPG.** Combat and skill level-up cards can now also be posted in a channel you pick, like #level-ups, as well as under the fight or gathering result. Set it on the Style page, under Level-up cards.
- **Set Combat and skill levels.** `/admin set combat` and `/admin set skill` put a member at any Combat, gathering or crafting level, for fixing mistakes or moving players over.

### Fixed
- **`/admin set` changed the wrong member.** Setting someone's XP, level, gold or streak changed the admin's own instead. It now changes the member you pick.

## v0.14 · October 21, 2026

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
