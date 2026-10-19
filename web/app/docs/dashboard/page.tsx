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
      <Table
        head={["Page", "What's there"]}
        rows={[
          ["Overview", "Each feature in a sentence, a setup checklist, and the health check."],
          ["Starter packs", "Ready-made content to add in one click."],
          ["Style", "Your theme colour, profile card style, and what XP and gold are called (with their icons), with live previews."],
          ["XP", "Message, voice and daily XP, streaks, and channel and role bonuses."],
          ["Economy", "The shop, its categories and items, and gifting."],
          ["Achievements, Levels, Quests", "As described in their guides."],
          ["Combat", "Enemies, player stats, death penalties, encounters, bosses and duels."],
          ["Gathering", "Activities, their minigames, locations and loot."],
          ["Logging", "Which events get posted to which log channel."],
          ["Logs", "A history of the events your server logs."],
        ]}
      />
      <List>
        <li><b>Simple and Advanced:</b> pages open in Simple mode with the settings most servers need. Switch to Advanced at the top of a page for everything else. Your choice is remembered.</li>
        <li><b>Saving:</b> changes are kept until you save, from the bar at the bottom or with <C>Ctrl+S</C> / <C>⌘S</C>. If someone else saved in the meantime, you&apos;re asked to reload rather than overwrite them.</li>
      </List>

      <H2>The health check</H2>
      <P>
        The Overview checks your setup for things that would fail quietly, and links to the page that fixes each one:
      </P>
      <List>
        <li>Channels havocish can&apos;t post in, or that were deleted.</li>
        <li>Roles it can&apos;t hand out (usually because they sit above its own role).</li>
        <li>Rewards and drops pointing at deleted items.</li>
        <li>Features switched on with nothing in them, like combat with no enemies or a gathering location with nothing to find.</li>
      </List>

      <H2>Commands for managers</H2>
      <Table
        head={["Command", "Use it to"]}
        rows={[
          [<C key="c">/config</C>, "Switch features on and off with one click each: the shop, gifting, quests, achievements, voice XP, combat, duels, encounters, world bosses, gathering and logging."],
          [<C key="c">/admin set</C>, "Set a member's XP, level, gold or streak."],
          [<C key="c">/admin items</C>, "View, give, remove or clear a member's items."],
          [<C key="c">/boss summon</C>, "Call a world boss right now."],
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
