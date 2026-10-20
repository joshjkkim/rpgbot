import type { Metadata } from "next";
import { C, DocTitle, H2, List, Note, P, Table, Where } from "../ui";

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
        stats, which enemies they meet, and which gear they can use. It follows the same level curve and cap as chat
        levels (set on the Levels page), so enemy rewards keep their meaning.
      </P>
      <Note>
        When Combat split off from chat level, every member started with Combat XP equal to their chat XP at the time, so
        nobody got weaker. From then on the two grow separately. Members see their Combat level on <C>/me</C>.
      </Note>

      <H2>How a fight works</H2>
      <List>
        <li><C>/fight</C> picks an enemy suited to the member&apos;s level, or one they name.</li>
        <li>Each round they choose an action: <b>Attack</b>, drink a healing potion from their bag, or <b>Flee</b>. Drinking uses the turn, so the enemy still swings.</li>
        <li>A win pays the enemy&apos;s Combat XP and gold, and rolls its drops.</li>
        <li><b>HP carries over</b> between fights. Members heal with <C>/daily</C> or a potion.</li>
        <li>One fight at a time. While fighting, other commands wait, and <C>/fight</C> brings the fight back if it scrolled away.</li>
        <li>Walking away, or a bot restart, counts as fleeing: no penalty, but the damage taken stays.</li>
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

      <H2>Enemies</H2>
      <P>Each enemy is a slot on the Combat page. Enemies are what make combat work, so start from a starter pack if you&apos;re unsure.</P>
      <Table
        head={["Field", "What it does"]}
        rows={[
          ["HP, attack, defence, speed, crit", "How tough it is."],
          ["Min and max Combat level", <>Which members can meet it in <C>/fight</C> and encounters. A max of 0 means no upper limit.</>],
          ["Combat XP and gold reward", "What beating it pays."],
          ["Drops", "Items it can drop, each with a chance from 0 to 1 and a quantity."],
          ["World boss", "Makes it a server-wide boss instead (below)."],
        ]}
      />

      <H2>Losing</H2>
      <P>
        Death penalties are separate for enemies and for duels. Each can take a percentage of gold, a flat amount (whichever
        is larger), and a percentage of Combat XP. Combat XP loss is off by default, since it can undo a level.
      </P>

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
      <Table
        head={["Setting", "Default"]}
        rows={[
          ["Spawn on their own", "Off"],
          ["Chance per XP-earning message", "0.2%"],
          ["Shortest gap between random bosses", "6 hours"],
          ["Time to kill before it escapes", "30 minutes"],
          ["How often one member can attack", "Every 20 s"],
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
