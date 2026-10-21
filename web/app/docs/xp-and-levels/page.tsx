import type { Metadata } from "next";
import { C, DocTitle, H2, H3, List, Note, P, Table, Where } from "../ui";

export const metadata: Metadata = { title: "XP and levels" };

export default function XpAndLevels() {
  return (
    <>
      <DocTitle
        path="xp-and-levels"
        title="XP and levels"
        lead="Members earn chat XP by chatting, talking in voice and claiming dailies. Chat XP adds up to levels, and levels can hand out roles. Fights, quests and the rest of the RPG pay Combat XP instead (see Combat)."
      />

      <H2>Already have a leveling bot?</H2>
      <P>
        Turn off <b>Use havocish for leveling</b> at the top of <Where>Leveling</Where>, or press Leveling in <C>/config</C>.
        Members then earn no chat or voice XP from havocish, see no level-ups, and dailies pay only gold. Everything in the
        RPG keeps working. To tie it to your other bot&apos;s levels, require the role it gives at a level on any item,
        recipe, gathering spot, enemy or quest (see Requirements).
      </P>
      <H3>Role rewards</H3>
      <P>
        Give gold, an item or Combat XP when a member gets a role, whoever gave it: another leveling bot&apos;s level
        role, a booster role, a mod. Set them under <b>Role rewards</b> at <Where>Leveling</Where>; they work whether
        havocish&apos;s own leveling is on or off. Each member is paid once per role, so losing and regaining it pays
        nothing; <C>/admin reset-role-reward</C> lets a member get one (or all) again. Members who already had the role
        when you set its reward get it the next time they chat. Pick a
        channel to announce them in, or leave it empty and rewards arrive quietly.
      </P>

      <H2>Message XP</H2>
      <P>
        Each message can earn XP, at most once per cooldown. Edit these at <Where>Leveling</Where>.
      </P>
      <Table
        head={["Setting", "Default", "What it does"]}
        rows={[
          ["XP per message", "5", "XP for a message, before bonuses."],
          ["Message cooldown", "60 s", "A member earns XP for at most one message in this window, so spamming doesn't pay."],
        ]}
      />
      <H3>Channel and role bonuses</H3>
      <P>A message&apos;s XP is worked out in this order:</P>
      <List>
        <li>Start with <b>XP per message</b>.</li>
        <li>Add the channel&apos;s <b>flat bonus</b>, then multiply by the channel&apos;s <b>multiplier</b>. A channel can also have its own cooldown, or give no XP at all.</li>
        <li>For each of the member&apos;s roles with a bonus: add its <b>extra XP</b>, then apply its <b>multiplier</b>. A role can also shorten the cooldown (the shortest one wins).</li>
      </List>
      <Note>
        Channel and role bonuses live under Advanced settings on the Leveling page. Switch to <b>Advanced</b> at the top of the page to see them.
      </Note>

      <H2>Voice XP</H2>
      <P>
        Members in voice channels earn XP per minute, paid when they leave. It&apos;s <b>off by default</b>: turn it on at{" "}
        <Where>Leveling</Where> or with <C>/config</C>.
      </P>
      <Table
        head={["Setting", "Default", "What it does"]}
        rows={[
          ["XP per minute", "2", "XP for each minute spent in voice."],
          ["Minimum minutes", "0", "Sessions shorter than this earn nothing."],
          ["Per channel", "none", "Turn voice XP off in a channel, or give it its own minimum."],
          ["Per role", "none", "Extra voice XP for members with a role."],
        ]}
      />

      <H2>Daily rewards and streaks</H2>
      <P>
        <C>/daily</C> gives XP and gold once a day. Claiming on consecutive days builds a streak, and each streak day makes
        the reward bigger.
      </P>
      <Table
        head={["Setting", "Default", "What it does"]}
        rows={[
          ["Daily XP / gold", "50 / 20", "The base reward."],
          ["Streak bonus", "0.1", "Each streak day adds 10% to the reward, so day 5 pays 1.4×."],
          ["Streak rewards", "none", <>Extra XP and gold on chosen days, like a bonus on day 7 and day 30, with an optional announcement.</>],
          ["Role bonuses", "none", "Extra daily XP or gold, or a bigger streak bonus, for members with a role."],
        ]}
      />
      <P><C>/daily</C> also restores a member&apos;s HP to full, which matters once combat is on.</P>

      <H2>Levels</H2>
      <P>
        Levels come from total XP on a curve you choose at <Where>Leveling</Where>. The page draws the curve as you change it.
      </P>
      <Table
        head={["Curve", "Feels like"]}
        rows={[
          [<C key="c">polynomial</C>, "Each level costs a bit more than the last. The default (factor 78, degree 2), and what the setup wizard uses."],
          [<C key="c">linear</C>, "Every level costs the same."],
          [<C key="c">exponential</C>, "Late levels get very expensive. Use with care."],
          [<C key="c">logarithmic</C>, "Fast early, then flattens out."],
        ]}
      />
      <List>
        <li><b>Max level</b> is 100 by default.</li>
        <li><b>Overrides</b> set the exact XP for specific levels, if you want a hand-tuned curve.</li>
        <li><C>/levels</C> shows members how the curve works in your server.</li>
      </List>

      <H2>Level-up messages and rewards</H2>
      <P>
        Each level-up posts a banner image in your theme colour. Choose a channel for them, or leave it empty to post where
        the member was chatting. The message accepts <C>{"{user}"}</C> and <C>{"{level}"}</C>.
      </P>
      <P>
        <b>Level rewards</b> run when a member reaches a level: give a role, take a role, post a message, or pay into the
        RPG with <b>gold</b>, an <b>item</b> or <b>Combat XP</b>. The RPG rewards are listed under the level-up message.
        Members who jump several levels at once get every reward they passed. Set them at <Where>Leveling</Where> under Level actions.
      </P>
      <Note kind="warning">
        Role rewards need the havocish role above the roles it gives. See{" "}
        <a href="/docs#add-the-bot" className="text-[var(--accent)] underline">Add the bot</a>.
      </Note>
    </>
  );
}
