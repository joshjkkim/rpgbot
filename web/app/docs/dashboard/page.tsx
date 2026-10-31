import type { Metadata } from "next";
import { C, DocTitle, H2, List, Note, P, Table } from "../ui";

export const metadata: Metadata = { title: "Dashboard and tools" };

export default function Dashboard() {
  return (
    <>
      <DocTitle
        path="dashboard"
        title="Dashboard and tools"
        lead="The dashboard at havocish.com is where you set things up. A few commands cover what's quicker from Discord."
      />

      <H2>Who can use it</H2>
      <P>
        Sign in with Discord. You&apos;ll see every server where you&apos;re the owner or have <b>Manage Server</b> (or
        Administrator). Moderators with that permission can set things up alongside you. Removing the permission takes
        away access within a minute.
      </P>

      <H2>Pages</H2>
      <P>
        The sidebar is in four parts: <b>Start</b> to get going, <b>World</b> for the things members meet, <b>Rules</b> for
        switches you set once, and <b>Activity</b> to see what happened.
      </P>
      <Table
        head={["Page", "What's there"]}
        rows={[
          ["Overview", "Each feature in a sentence, a setup checklist, and the health check."],
          ["Library", "Ready-made content: a whole starter pack in one click, or single pieces with what they need. Also where the AI writes a world from your description."],
          ["Helper", "Ask about your setup in plain words, or ask for a change. Every change is shown to you first."],
          ["Combat", "Enemies, the places they're met, and fight moves and statuses. New enemies fill in fair numbers from a level and a kind."],
          ["Items", "Every item: where it comes from, what it's for, and all its settings. Gear fills in fair stats from its slot, level and rarity."],
          ["Gathering, Crafting", "Activities with their minigames, locations and loot; stations with their recipes."],
          ["Quests, Achievements, Collections", "As described in their guides."],
          ["Characters", "The people and creatures who post your announcements under their own name and picture."],
          ["Leveling", "Message, voice and daily XP, streaks, the level curve and level rewards."],
          ["Combat rules", "Combat on or off, player stats, health and losing, roles at Combat and skill levels, parties, duels, wild encounters and world bosses."],
          ["Shop", "The shop switch, its categories, gifting, and a live preview of /shop."],
          ["Announcements", "Everything havocish posts for the server, in one list: the channel, the message and who says it."],
          ["Style", "Your theme colour, profile card style, and what XP and gold are called (with their icons), with live previews."],
          ["Logging, Logs", "Which events get posted to which log channel, and their history."],
        ]}
      />
      <List>
        <li><b>Simple and Advanced:</b> pages open in Simple mode with the settings most servers need. Switch to Advanced at the top of a page for everything else. Your choice is remembered.</li>
        <li><b>Saving:</b> changes are kept until you save, from the bar at the bottom or with <C>Ctrl+S</C> / <C>⌘S</C>. If someone else saved in the meantime, you&apos;re asked to reload rather than overwrite them.</li>
      </List>

      <H2>Worlds written by AI</H2>
      <P>
        On the Library page, or with <b>Describe my own world</b> in <C>/setup</C>, describe the world your server plays in
        and the AI writes a pack for it: enemies with their moves, places, a world boss, gear for every slot, potions and
        loot, hunting quests, two gathering activities with their tools, crafting stations, collections and achievements.
      </P>
      <List>
        <li><b>The words are the AI&apos;s, the numbers aren&apos;t.</b> Stats, prices, drop rates and rewards come from the same balance tables as the starter packs.</li>
        <li><b>Nothing changes until you add it.</b> Add the whole world or single pieces, like a starter pack; it never overwrites what you have.</li>
        <li><b>Writing one takes about a minute.</b> Each server can make <b>3 worlds</b>; made ones stay in the Library to add again.</li>
      </List>

      <H2>The Helper</H2>
      <P>
        The Helper page answers questions about your server&apos;s setup (&ldquo;why can&apos;t anyone reach the Deep
        Vein?&rdquo;) and makes changes you ask for (&ldquo;put fights in #arena&rdquo;). It sees your settings, channel and
        role names and the health check, never your members or their messages. Changes come back as a list you check and
        apply with one click. Each server gets <b>20 messages a day</b>.
      </P>

      <H2>Requirements</H2>
      <P>
        Items, gathering locations, crafting recipes, enemies and quests each have a <b>Requirements</b> block that decides
        who can use them. Everything set there must be met:
      </P>
      <Table
        head={["Condition", "Use it for"]}
        rows={[
          ["Combat level", "The RPG's own level, earned by fighting."],
          ["Has any of these roles", "Gating by another bot's level roles, or by roles you hand out yourself."],
          ["Skill levels", "Mining 15 for the Old Quarry, Smithing 25 for a blade."],
          ["Days in the server", "Rewards for members who stuck around."],
          ["Server boosters only", "A perk or cosmetic for boosters."],
          ["Chat level", "havocish's own level, for servers that use it."],
        ]}
      />
      <Note>
        <b>Already use MEE6, Arcane or another leveling bot?</b> Those bots give roles at levels. Pick that role in a
        requirement, and havocish gates its content by your existing levels without knowing anything about the other bot.
      </Note>
      <P>When a member doesn&apos;t qualify, the bot tells them exactly what&apos;s missing: <i>Needs Mining 15 and the @Veteran role.</i></P>

      <H2>The health check</H2>
      <P>
        The Overview checks your setup for things that would fail quietly, and links to the page that fixes each one:
      </P>
      <List>
        <li>Channels havocish can&apos;t post in, or that were deleted.</li>
        <li>Roles it can&apos;t hand out (usually because they sit above its own role).</li>
        <li>Requirements that name a deleted role or skill.</li>
        <li>Rewards and drops pointing at deleted items.</li>
        <li>Features switched on with nothing in them, like combat with no enemies or a gathering location with nothing to find.</li>
      </List>

      <H2>Commands for managers</H2>
      <Table
        head={["Command", "Use it to"]}
        rows={[
          [<C key="c">/config</C>, "Switch features on and off with one click each: the shop, gifting, quests, achievements, voice XP, combat, duels, encounters, world bosses, gathering, crafting and logging."],
          [<C key="c">/admin set</C>, "Set a member's XP, level, gold, streak, Combat level or a skill level."],
          [<C key="c">/admin items</C>, "View, give, remove or clear a member's items."],
          [<C key="c">/fight</C>, "Pick any enemy, whatever its level or requirements, to try it out. Pick a world boss to summon it for the whole server."],
          [<C key="c">/boss dismiss</C>, "Send the current world boss away, with no rewards."],
        ]}
      />
      <Note>
        <C>/config</C> changes one setting at a time, so it can&apos;t undo dashboard edits made a moment before.
      </Note>

      <H2>Getting help</H2>
      <P>
        Stuck, or found a bug? Ask in the{" "}
        <a href="https://discord.gg/9dV5NnV9tq" target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">support server</a>
        . What&apos;s new is on the <a href="/changelog" className="text-[var(--accent)] underline">changelog</a>.
      </P>
    </>
  );
}
