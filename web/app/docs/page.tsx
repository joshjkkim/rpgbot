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
        lead="Add havocish to your server, answer five questions, and your members can start levelling up. About five minutes."
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
          ["Manage Roles", "Roles you hand out at levels, from items and as quest rewards."],
        ]}
      />
      <Note kind="warning">
        Discord only lets a bot give roles that sit <b>below its own role</b>. In Server Settings → Roles, drag the
        havocish role above every role you want it to hand out.
      </Note>

      <H2>Run the setup wizard</H2>
      <P>
        When havocish joins, it posts a message with a button to the setup wizard. You can also open it any time from the
        dashboard&apos;s Overview. It asks five questions and configures the bot from your answers:
      </P>
      <Table
        head={["Question", "What it sets"]}
        rows={[
          ["How fast should people level up?", <>The XP per message, the message cooldown, daily rewards and the level curve. <b>Standard</b> (the default) is 5 XP per message, the first level-up after about 16 messages and level 10 after about 1,260.</>],
          ["Which features do you want?", "Turns the shop, combat, quests and achievements on or off."],
          ["Where should level-ups go?", "A channel for level-up banners, or the channel the member was chatting in."],
          ["Which roles at which levels?", "Role rewards, handed out automatically as members level up."],
          ["Start with a pack?", "Fills your server with ready-made content in one click (see below)."],
        ]}
      />
      <P>The wizard never deletes anything you made yourself, so it&apos;s safe to run again later to change the pace.</P>

      <H2>Add a starter pack</H2>
      <P>
        A starter pack fills your shop, enemies, quests, achievements and gathering activities in one go. <b>Classic
        Fantasy</b> comes with 16 enemies from giant rats to a lich, gear for every slot, potions, hunting quests, and
        Mining, Fishing and Foraging with their tools. Find it at <Where>Starter packs</Where>.
      </P>
      <List>
        <li>A pack <b>never overwrites</b> your own content. Anything with the same ID as yours is skipped.</li>
        <li>When a pack gets new content, open the page again and click <b>Add to my server</b>. Only the new parts are added.</li>
        <li>Everything a pack adds is yours to rename, reprice or delete afterwards.</li>
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

      <H2>Who can configure havocish</H2>
      <P>
        The server owner and anyone with <b>Manage Server</b> (or Administrator) can use the dashboard and the manager
        commands (<C>/config</C>, <C>/admin</C>, <C>/boss summon</C>). Everyone else only sees the player commands.
      </P>
    </>
  );
}
