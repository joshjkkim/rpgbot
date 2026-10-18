# Changelog

What's new in havocish, newest first. Posted to the support server and shown at havocish.com/changelog.

## Unreleased

### New
- **Hunting quests.** Quests can now ask you to defeat enemies (any, or specific ones like *"defeat 10 Grey Wolves"*) or win duels. World bosses count, so *Topple the Throne* pays out when the Hollow King falls.
- **A much bigger Classic Fantasy pack.** Fifteen enemies instead of five, a gear upgrade every few levels in every slot (now including legs and hands), loot to sell, two rare drops to chase, eight new hunting quests and two new achievements.

### Improved
- **For server owners: Simple and Advanced settings.** Dashboard pages now open in Simple mode, showing just the settings most servers need. Switch to **Advanced** at the top of any page (or click **Show** at the bottom) for everything else, like per-channel rates, role bonuses and player stats. havocish remembers your choice.

### Fixed
- Quests to spend gold in the shop now count your purchases. They never moved before.

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
