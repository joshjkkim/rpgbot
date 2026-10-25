import type { Metadata } from "next";
import Link from "next/link";
import { inviteUrl } from "@/app/lib/invite";
import { C, DocTitle, H2, List, Note, P, Steps, Table, Where } from "./ui";

export const metadata: Metadata = { title: "Getting started" };

export default function GettingStarted() {
  const invite = inviteUrl();
  return (
    <>
      <DocTitle
        path="getting-started"
        title="Getting started"
        lead="Add havocish to your server, run /setup, and your members can start playing. About a minute in Discord, or five on the dashboard."
      />

      <H2>Add the bot</H2>
      <Steps>
        <li>{invite ? <a href={invite} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">Invite havocish</a> : "Invite havocish"} to a server where you have <b>Manage Server</b>.</li>
        <li>Keep the permissions it asks for. Each one is used:</li>
      </Steps>
      <Table
        head={["Permission", "Used for"]}
        rows={[
          ["View Channels, Read Message History", "Seeing the channels it gives XP in and answers commands in."],
          ["Send Messages, Embed Links", "Level-ups, fight results, announcements."],
          ["Attach Files", "Profile cards, level-up banners and item cards are images."],
          ["Manage Roles", "Roles you hand out at levels, from items, as quest rewards, and roles that unlock places."],
          ["Manage Webhooks", "Characters: villains, quest givers and the shopkeeper post under their own name and picture. Without it they still post, as the bot with their name on top."],
        ]}
      />
      <Note kind="warning">
        Discord only lets a bot give roles that sit <b>below its own role</b>. In Server Settings → Roles, drag the
        havocish role above every role you want it to hand out.
      </Note>

      <H2>Set it up</H2>
      <P>
        Run <C>/setup</C> in your server, or press <b>Set up here</b> on the message havocish posts when it joins. Only you
        see it, and it takes about a minute. The dashboard&apos;s Overview has the same setup if you prefer the website.
      </P>
      <Table
        head={["Question", "What it sets"]}
        rows={[
          ["Who handles leveling?", "havocish levels members as they chat, or it works beside a leveling bot you already have and runs only the RPG."],
          ["How fast should people level up?", <>The XP per message, the message cooldown, daily rewards and the level curve, and the Combat level curve to match. <b>Standard</b> (the default) is 5 XP per message, the first level-up after about 16 messages and level 10 after about 1,260; in Combat, about 60 fights to Combat 10 and some 12 hours of fighting to Combat 40. Relaxed is about twice as fast, Hardcore about 1.4 times slower.</>],
          ["What world should it start with?", "A starter pack (below), or blank to build your own."],
          ["What do you call money and XP?", "Keep gold and XP, or rename them: credits and rep, coins and stars."],
          ["Where should level-ups go?", "A channel for level-up banners, or wherever the member was chatting."],
        ]}
      />
      <P>Setup never deletes anything you made yourself, so it&apos;s safe to run again later.</P>

      <H2>Pick a starting world</H2>
      <Table
        head={["Pack", "What's in it"]}
        rows={[
          [<b key="b">Classic Fantasy</b>, "A tavern-and-dungeon world: giant rats to a lich, the Hollow King as world boss, mining, fishing and foraging, smithing, alchemy and cooking."],
          [<b key="b">Frontier Station</b>, "A station at the edge of known space: drones to a rogue AI, the Hive Mind as world boss, salvaging, hacking and scanning, a fabricator and a research lab."],
        ]}
      />
      <List>
        <li>Each pack comes with enemies and their moves, places, gear for every slot, gathering and crafting, quests, achievements, collections and a cast of characters.</li>
        <li>In the <Where>Library</Where> you can add a whole pack, or <b>tick single pieces</b>: one enemy, a crafting station, a quest. Anything a piece needs (an enemy&apos;s moves and drops, a recipe&apos;s ingredients) comes along, and the Library shows the full list before adding.</li>
        <li>A pack <b>never overwrites</b> your own content: anything with the same ID as yours stays yours. When a pack gets new content, add it again and only the new parts come in.</li>
        <li>Places need their channels picked (Combat → Places), since a pack can&apos;t know your channels.</li>
      </List>

      <H2>Make your own</H2>
      <List>
        <li><b>Fair numbers in one click:</b> on any enemy, pick a level and a kind (weak, normal, tough, rare elite or world boss) and press <b>Fill in the numbers</b>. Gear does the same from its slot, level and rarity. The numbers follow Classic Fantasy&apos;s balance, and stay editable.</li>
        <li><b>Make items where you need them:</b> any item list on Combat, Gathering, Crafting or Quests ends with <b>+ New item…</b>, so a drop or ingredient that doesn&apos;t exist yet is one name away.</li>
        <li><b>Give it voices:</b> make <Link href="/docs/characters" className="text-[var(--accent)] underline">characters</Link> for your villains, quest givers and shopkeeper.</li>
        <li><b>Open places as members grow:</b> give a role at a Combat or skill level, and hide a place&apos;s channels behind it: they appear when it&apos;s earned (see <Link href="/docs/combat#unlocking-places" className="text-[var(--accent)] underline">Unlocking places</Link>).</li>
      </List>

      <H2>Try it</H2>
      <P>Chat a little, then try these in your server:</P>
      <Table
        head={["Command", "What it does"]}
        rows={[
          [<C key="c">/me</C>, "Your character sheet: level, HP, stats, gear and skills."],
          [<C key="c">/daily</C>, "Claim a daily reward. Come back every day to build a streak."],
          [<C key="c">/fight</C>, "Battle an enemy for XP, gold and loot."],
          [<C key="c">/gather</C>, "Mine, fish, forage, or whatever activities your server has."],
          [<C key="c">/shop</C>, "Browse and buy items."],
          [<C key="c">/help</C>, "A short in-Discord guide, adapted to how your server is set up."],
        ]}
      />
      <P>
        Every command is listed in the <Link href="/docs/commands" className="text-[var(--accent)] underline">command reference</Link>.
      </P>

      <H2>Already have a leveling bot?</H2>
      <P>
        havocish works alongside it. Gate any item, location, recipe, enemy or quest behind the roles your leveling bot
        gives at each level, using a requirement (see <Link href="/docs/dashboard#requirements" className="text-[var(--accent)] underline">Requirements</Link>).
      </P>

      <H2>Who can configure havocish</H2>
      <P>
        The server owner and anyone with <b>Manage Server</b> (or Administrator) can use the dashboard and the manager
        commands (<C>/setup</C>, <C>/config</C>, <C>/admin</C>, <C>/boss</C>). Everyone else only sees the player commands.
      </P>
    </>
  );
}
