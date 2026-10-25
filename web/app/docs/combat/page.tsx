import type { Metadata } from "next";
import { C, DocTitle, H2, H3, List, Note, P, Table, Where } from "../ui";

export const metadata: Metadata = { title: "Combat" };

export default function Combat() {
  return (
    <>
      <DocTitle
        path="combat"
        title="Combat"
        lead="Turn-based fights against enemies you write, wild encounters in chat, world bosses for the whole server, and duels between members."
      />

      <H2>Combat level</H2>
      <P>
        Combat is the RPG&apos;s own level, separate from chat level. Fights, world bosses, quest and achievement rewards,
        and items that give XP all pay <b>Combat XP</b>; none of it raises chat level. Combat level sets a member&apos;s
        stats, which enemies they meet, and which gear they can use. It has its own curve, from Combat 1 to 99 by default,
        tuned for fighting: about 60 early fights to Combat 10. Change it under Combat (Advanced).
      </P>
      <Note>
        When Combat split off from chat level, every existing member started at the Combat level matching their chat level
        (capped at 99), so nobody got weaker. New members start at Combat 1, and from then on the two grow separately. Members see their Combat level on <C>/me</C>.
      </Note>

      <H2>How a fight works</H2>
      <List>
        <li><C>/fight</C> picks an enemy suited to the member&apos;s level (from the channel&apos;s place, if it has one), or one they name.</li>
        <li><b>The enemy shows its next move</b> before the member picks theirs: a heavy blow coming, a wind-up, a guard. Reading it is the game: guard the big hit, strike while it winds up.</li>
        <li>Each round the member picks one of their <b>moves</b>, drinks a potion (which uses the turn), or flees.</li>
        <li><b>Speed decides who acts first</b>, and the fight says so under the buttons. Some moves always go first.</li>
        <li>A win pays the enemy&apos;s Combat XP and gold, and rolls its drops. An enemy well below the member&apos;s level pays less XP (10% less per level past its max, down to 25%), and the result says where fairer fights are.</li>
        <li>One fight at a time. <C>/fight</C> brings it back if it scrolled away. Walking away, or a bot restart, counts as fleeing.</li>
        <li>Fights show a drawn <b>battle scene</b> of both sides and their statuses. Turn it off under Combat if you prefer text.</li>
      </List>

      <H2>Moves</H2>
      <P>
        Players and enemies use the same moves, built at <Where>Combat → Moves</Where> from blocks: <b>hit</b> (power,
        several hits, pierce, lifesteal), <b>guard</b>, <b>counter</b>, <b>heal</b>, <b>boost</b> a stat, apply a{" "}
        <b>status</b>, <b>stun</b> and <b>cleanse</b>. Blocks can aim at yourself, which is how drawbacks work (a heavy hit
        that lowers your defence), and can need a condition (if the target is bleeding) or a chance.
      </P>
      <List>
        <li><b>Wind-up:</b> takes turns to charge first, and the other side sees it coming.</li>
        <li><b>Cooldown</b> and <b>uses per fight</b> keep strong moves from being spammed.</li>
        <li><b>Who gets it:</b> players by Combat level and any requirements, only once learned from a <b>move scroll</b>, or from gear that grants it.</li>
        <li>Members choose four with <C>/moves</C>. A level-up that opens a move says so.</li>
        <li>Enemies pick from their own move list by weight. Without one they attack, sometimes hit hard, sometimes guard.</li>
      </List>
      <H3>Statuses</H3>
      <P>
        Owner-made effects that last some turns: a share of max HP lost or gained each turn (bleed, regen), stat changes
        (−25% attack), and how many times they stack. The defaults are Bleeding, Poisoned, Burning, Regenerating and Wounded.
      </P>

      <H2>Parties</H2>
      <P>
        Anyone can press <b>Join</b> on a fight to help. Each member picks their move and the round plays once everyone has
        picked or the timer runs out. Each extra player adds the enemy&apos;s HP again, and each player rolls their own drops.
        A knocked-out member gets half rewards and no drops.
      </P>
      <Table
        head={["Setting", "Default"]}
        rows={[
          ["Players per fight", "3"],
          ["Time to pick a move", "30 s"],
          ["Enemy HP per extra player", "+100%"],
          ["Joiners must be in the enemy's level range", "On"],
        ]}
      />
      <P>An enemy can be set solo only.</P>

      <H2>Places</H2>
      <P>
        Places map channels (or whole categories) to enemy pools: wolves in #the-woods, the Lich only in #the-crypt. Each
        enemy in a pool has a weight, and an enemy&apos;s own <b>spawn weight</b> makes rare elites rare everywhere. Fights in
        a place open in a thread by default, to keep chat clear. Channels outside every place meet any enemy that suits the level.
      </P>

      <H2>Unlocking places</H2>
      <P>
        A place can be <b>earned</b>. Give it an unlock on the Places tab: the role it gives, and who earns it, using the usual
        requirements (Combat level, a gathering or crafting skill, a finished collection, items found, days in the server).
        Then, in Discord, hide the place&apos;s channels from everyone without that role. The moment a member qualifies,
        havocish gives the role, the channels appear in their list, and it&apos;s announced: “🗺️ @member unlocked ⚰️ The
        Barrow Crypt!”
      </P>
      <List>
        <li>Roles are given, never taken away: a member who earned the Crypt keeps it.</li>
        <li>It&apos;s checked after fights, gathering, crafting, buying and world bosses, and when a manager sets a level with <C>/admin set</C>.</li>
        <li>Both starter packs come with unlocks for their tougher places. Roles belong to your server, so you pick the role; the health check reminds you until you do.</li>
        <li>havocish can only give roles below its own: drag its role above the unlock roles in Server Settings → Roles.</li>
      </List>

      <H2>Health and losing</H2>
      <List>
        <li><b>HP carries over</b> between fights and refills on its own: from 0 to full in 2 hours. Food and potions heal right away.</li>
        <li>A loss, or a knockout in a party or by a world boss, brings you back at <b>25% HP</b>.</li>
        <li>It also leaves you <b>Wounded</b> for 10 minutes: −20% attack and defence, in and out of fights. Pick another status, change the time, or set it to 0 under Combat → Health.</li>
        <li>Losing to an enemy drops <b>5% of carried gold</b> (at least 10). Duels have their own penalty, off by default. Each can also take Combat XP, off by default since it can undo a level.</li>
      </List>

      <H2>Player stats</H2>
      <P>Every member&apos;s stats are a base plus a bit per Combat level, plus whatever their gear adds. Tune them at <Where>Combat</Where> (Advanced).</P>
      <Table
        head={["Stat", "Base", "Per level"]}
        rows={[
          ["Health", "100", "+10"],
          ["Attack", "10", "+2"],
          ["Defence", "5", "+1"],
          ["Speed", "5", "+1"],
          ["Crit chance", "5%", "+0.5%"],
          ["Crit multiplier", "1.5×", "+0.1×"],
        ]}
      />

      <H3>Chat level bonus</H3>
      <P>
        Chatting makes members a little stronger too: each chat level adds <b>+2 HP</b> and <b>+0.5 attack</b> by default,
        on top of the Combat-level stats. A member at chat level 40 gets +80 HP and +20 attack, shown on <C>/me</C>. It is
        kept well below the per-Combat-level values so fighting stays the main way up. Change it, or set it to 0, at <Where>Combat</Where>.
      </P>

      <H2>Enemies</H2>
      <P>Each enemy is a slot on the Combat page. Enemies are what make combat work, so start from a starter pack if you&apos;re unsure.</P>
      <Table
        head={["Field", "What it does"]}
        rows={[
          ["HP, attack, defence, speed, crit", "How tough it is."],
          ["Min and max Combat level", <>Which members can meet it in <C>/fight</C> and encounters. A max of 0 means no upper limit.</>],
          ["Combat XP and gold reward", "What beating it pays."],
          ["Drops", "Items it can drop, each with a chance from 0 to 1 and a quantity."],
          ["Moves", "What it can do, with weights. Bosses and elites deserve their own."],
          ["Spawn weight", "How often it turns up compared with others. 0.2 makes an elite rare."],
          ["World boss", "Makes it a server-wide boss instead (below)."],
        ]}
      />

      <H2>Wild encounters</H2>
      <P>While people chat, an enemy sometimes turns up in the channel. The first member to click <b>Fight</b> takes it on.</P>
      <Table
        head={["Setting", "Default"]}
        rows={[
          ["Chance per XP-earning message", "2%"],
          ["Shortest gap between encounters", "600 s"],
          ["Leaves if nobody fights it after", "120 s"],
          ["Channels", "Any channel that gives XP"],
        ]}
      />

      <H2>World bosses</H2>
      <P>
        Mark an enemy as a <b>world boss</b> and the whole server fights it together. Rewards are split by damage dealt, and
        the top damage dealer rolls its drops. Managers can summon one any time with <C>/boss summon</C>.
      </P>
      <P>
        The boss acts in <b>waves</b>. Its next move is shown on the message with a countdown, and it lands on everyone who
        attacked since the last wave. <b>Guard</b> takes 70% off, without using an attack. Each member is told privately
        what the wave did to them. Its guard moves make it harder to hurt until the next wave; heals heal it.
      </P>
      <Table
        head={["Setting", "Default"]}
        rows={[
          ["Spawn on their own", "Off"],
          ["Chance per XP-earning message", "0.2%"],
          ["Shortest gap between random bosses", "6 hours"],
          ["Time to kill before it escapes", "30 minutes"],
          ["How often one member can attack", "Every 20 s"],
          ["Time between waves", "25 s"],
        ]}
      />
      <Note>Give bosses lots of HP. They&apos;re meant to take many members several minutes.</Note>

      <H2>Duels</H2>
      <P><C>/duel @member</C> challenges someone to an automatic fight, optionally with gold on the line.</P>
      <Table
        head={["Setting", "Default", "What it does"]}
        rows={[
          ["Min / max wager", "0 / no limit", "0 minimum allows friendly duels."],
          ["Rake", "0%", "A cut of the pot that's removed from the economy."],
          ["Challenge timeout", "120 s", "How long the challenge waits for an answer."],
          ["Cooldown", "300 s", "Stops a strong member re-challenging a weak one back to back."],
          ["Round cap", "50", "Reaching it is a draw and no gold moves."],
        ]}
      />
    </>
  );
}
