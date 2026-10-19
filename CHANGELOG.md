# Changelog

What's new in havocish, newest first. Posted to the support server and shown at havocish.com/changelog.

## Unreleased

### New
- **Gathering.** Mine, fish and forage with `/gather`, each its own minigame. Mining: swing at a grid of rocks, and leave before a cave-in takes half your haul. Fishing: cast, wait for the bite, and reel in time; rare fish fight back. Foraging: spot the herb among the weeds before time runs out. Each activity has its own energy bar of 10 runs that refills over an hour, so you can settle in for a proper session.
- **Skills and tools.** Each activity has its own skill, from 1 to 50. Higher skill opens better locations with better finds, and makes the game a little easier. Pickaxes, rods and sickles from the new Tools shop help too, and the best spots need one. See your skills on `/me`. Everything you find sells in `/inventory`.
- **For server owners: make your own gathering.** On the new Gathering page of the dashboard, create any activity you like (salvaging, baking, stargazing), pick one of three minigames for it, and write every word players see. Set its locations, what each one finds and how often. Any shop item can be a tool. Classic Fantasy now includes Mining, Fishing and Foraging, and if you added it before, click **Add to my server** on Starter packs to get them.

### Improved
- **See what an item does before you buy it.** The shop now lists each item's stats, equip bonuses and use effects, like *+12 Attack · Equip: Fights award 10% more gold* or *Use: Gives 30 health.*
- **For server owners: your moderators can use the dashboard.** Anyone with **Manage Server** in Discord can now open and edit your server on havocish.com, not just the owner. They could already change settings with commands, so this gives them the easier way to do it.
- **For server owners: `/config` is now a row of switches.** Click Shop, Quests, Duels, World bosses and the rest to turn them on or off, right in Discord. Setting things up (items, enemies, quests, levels) happens on the dashboard.
- **For server owners: `/set` and `/admin-inv` are now `/admin set` and `/admin items`.** Same options, one command.

### Fixed
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
