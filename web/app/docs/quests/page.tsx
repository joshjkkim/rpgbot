import type { Metadata } from "next";
import { C, DocTitle, H2, List, Note, P, Table, Where } from "../ui";

export const metadata: Metadata = { title: "Quests and achievements" };

export default function Quests() {
  return (
    <>
      <DocTitle
        path="quests"
        title="Quests, achievements and collections"
        lead="Quests are goals members take on and claim. Achievements unlock on their own when a member reaches a milestone. Collections are sets to complete, with rewards along the way."
      />

      <H2>Quests</H2>
      <P>
        Members open <C>/quests</C>, take on a quest, and claim its reward once it&apos;s done. The fight or message that
        finishes a quest says so on the spot. Build quests at <Where>Quests</Where>.
      </P>
      <Table
        head={["Goal type", "Counts"]}
        rows={[
          [<C key="c">messages</C>, "Messages sent, optionally only in chosen channels."],
          [<C key="c">vcMinutes</C>, "Minutes in voice, optionally only in chosen channels."],
          [<C key="c">earnXp</C>, "XP earned from any source."],
          [<C key="c">spendGold</C>, "Gold spent in the shop."],
          [<C key="c">dailyClaim</C>, <><C>/daily</C> claims.</>],
          [<C key="c">defeatEnemies</C>, "Fights won, against any enemy or only chosen ones (Defeat Grey Wolf ×10). World bosses count."],
          [<C key="c">winDuels</C>, "Duels won."],
          [<C key="c">gatherItems</C>, "Items found gathering, any or only chosen ones."],
          [<C key="c">craftItems</C>, "Items crafted, any or only chosen ones."],
        ]}
      />
      <List>
        <li><b>Target:</b> how many it takes.</li>
        <li><b>Rewards:</b> any mix of Combat XP, gold, items, a role and a message to a channel. Quest XP is Combat XP; it never raises chat level.</li>
        <li><b>Repeat cooldown:</b> how long after claiming before it can be taken again. 86400 seconds reads as daily, 604800 as weekly.</li>
        <li><b>Active:</b> switch a quest off to take it off the board without deleting it.</li>
      </List>
      <P>
        Completions can be announced in a channel with your own message, which accepts <C>{"{user}"}</C>,{" "}
        <C>{"{questName}"}</C> and <C>{"{questDescription}"}</C>. A quest can post to its own channel instead.
      </P>

      <H2>Achievements</H2>
      <P>Achievements check a member after anything that changes their progress, and unlock once the condition is true. Build them at <Where>Achievements</Where>.</P>
      <Table
        head={["Condition", "Compares"]}
        rows={[
          [<C key="c">level</C>, "The member's level."],
          [<C key="c">xp</C>, "Total XP."],
          [<C key="c">gold</C>, "Current gold."],
          [<C key="c">streak</C>, "Current daily streak."],
          [<C key="c">stat</C>, <>A tracked stat, like <C>messagesSent</C>, <C>fightsWon</C>, <C>partyWins</C>, <C>gatherRuns</C>, <C>craftsMade</C>, <C>collectionsCompleted</C>, <C>duelsWon</C>, <C>dailiesClaimed</C> or <C>timeSpentInVC</C>.</>],
        ]}
      />
      <List>
        <li>Each condition uses a comparison (<C>{">="}</C>, <C>{"=="}</C>, <C>{"<"}</C> and so on) and a value, like <C>level {">="} 10</C>.</li>
        <li><b>Rewards</b> work like quest rewards: XP, gold, an item, a role or a message.</li>
        <li><b>Secret</b> achievements stay hidden until someone unlocks them.</li>
        <li>Unlocks can be announced server-wide, or per achievement in its own channel.</li>
      </List>
      <Note>Members see their achievements with the button on <C>/profile</C>.</Note>

      <H2>Collections</H2>
      <P>
        Groups of things to find and beat that you make at <Where>Collections</Where>: every ore and gem, a bestiary, a set
        of crafted arms. Items count once a member has ever had one; enemies once they&apos;ve beaten one. Members see their
        progress in <C>/collection</C>, with missing entries as ???. Servers without collections show none.
      </P>
      <List>
        <li><b>Milestones</b> pay at counts you choose (gold, items, Combat XP, a role), each once. Put the best one at the full count, and an early one so nobody needs the whole set for a first reward.</li>
        <li>Recipes, moves, places and quests can require a finished collection (Requirements → Has completed).</li>
        <li>Milestones are announced in a channel you pick, or where the find happened.</li>
      </List>
    </>
  );
}
