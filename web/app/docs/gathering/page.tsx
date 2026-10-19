import type { Metadata } from "next";
import { C, DocTitle, H2, H3, List, Note, P, Steps, Table, Where } from "../ui";

export const metadata: Metadata = { title: "Gathering" };

export default function Gathering() {
  return (
    <>
      <DocTitle
        path="gathering"
        title="Gathering"
        lead="Activities members play with /gather, each a short button minigame with its own skill. You design them: Mining and Fishing, or Salvage, Baking or anything else."
      />

      <H2>How it fits together</H2>
      <List>
        <li>An <b>activity</b> (like Mining) has a name, a skill name, a <b>minigame</b> and its own wording.</li>
        <li>Each activity has <b>locations</b>. Better ones open as the member&apos;s skill grows, and can need a tool.</li>
        <li>Each location has a <b>loot table</b>: what a find can be, and how likely each item is.</li>
        <li>Everything found goes into the member&apos;s bag, to sell, trade or keep.</li>
      </List>
      <P>
        Turn gathering on and build activities at <Where>Gathering</Where>. The Classic Fantasy starter pack includes
        Mining, Fishing and Foraging, which are good examples to copy.
      </P>

      <H2>Make an activity</H2>
      <Steps>
        <li>Click <b>New activity</b> and name it. Set its emoji, skill name and energy (below).</li>
        <li>Pick a <b>minigame</b> (below).</li>
        <li>Fill in the <b>wording</b>. Every box shows its default as grey text, and blank boxes use it. Change only what fits your theme.</li>
        <li>Add <b>locations</b>, each with the skill it needs, the skill XP it gives and its loot. One location must need skill 1, or nobody can start.</li>
        <li>Save. Members can now <C>/gather</C> it.</li>
      </Steps>

      <H2>The minigames</H2>
      <H3>Grid: push your luck</H3>
      <P>A 4×4 grid of hidden tiles and a few tries. Each tile is a find, nothing, or a hazard. A hazard ends the run and keeps half of what was found (rounded up). Members can leave any time to keep everything.</P>
      <Table
        head={["Location setting", "Default", "Notes"]}
        rows={[
          ["Tries", "5", "Skill adds one every 12 levels; tools add more."],
          ["Finds hidden", "5", "Out of 16 tiles. More finds mean something almost every run."],
          ["Hazards hidden", "2", "Skill removes one every 15 levels, never below 1."],
        ]}
      />
      <H3>Timing: react to the signal</H3>
      <P>Start an attempt, wait for the signal, and click inside the window. Clicking early or late loses it. Uncommon finds then pull left or right once, rare twice, epic and legendary three times, and a wrong pick loses them.</P>
      <Table
        head={["Location setting", "Default", "Notes"]}
        rows={[
          ["Attempts per run", "3", "Each landed attempt is one find."],
          ["Reaction window", "3000 ms", "Skill adds 30 ms a level; tools add 300 ms a point. Never under 2500 ms."],
          ["Most pulls", "3", "Caps the pulls rare finds make. Skill 25 removes one."],
        ]}
      />
      <Note>The window is measured from when the signal appears to when Discord receives the click, so a slow connection isn&apos;t held against the player.</Note>
      <H3>Find it: spot the target</H3>
      <P>A 4×4 patch of look-alike emoji hides the item being searched for. Click it before time runs out; a wrong click costs 2 seconds.</P>
      <Table
        head={["Location setting", "Default", "Notes"]}
        rows={[
          ["Rounds per run", "3", "Each spotted round is one find."],
          ["Seconds per round", "8", "Skill adds about a second every 8 levels; tools add a second a point."],
          ["Kinds of look-alike", "3", "More kinds make it harder. Skill 20 removes one."],
        ]}
      />
      <Note kind="warning">Find it shows each item&apos;s emoji as the target, so every item in its loot needs an emoji, and the look-alikes (set in the wording) shouldn&apos;t include it.</Note>

      <H2>Energy</H2>
      <P>
        Each activity has its own energy bar. A run uses one point, and points refill over time, so members can sit down
        for a proper session and then come back later. Members see their energy in every run and on <C>/me</C>.
      </P>
      <Table
        head={["Setting", "Default", "What it does"]}
        rows={[
          ["Energy", "10", "Runs a full bar holds."],
          ["Minutes per energy", "6", "How long one point takes to refill, so a full bar refills in an hour."],
        ]}
      />

      <H2>Loot tables</H2>
      <P>
        Every find picks one entry from the location&apos;s loot table. <b>Chances are weights</b>: 3 and 1 means a 75% and
        25% split. The editor shows each entry&apos;s real share. Each entry also has a min and max amount.
      </P>
      <P>
        How <i>often</i> something is found comes from the minigame settings above; <i>what</i> is found comes from the loot
        table. A good pattern: early locations find often but cheaply, late ones find rarely but pay well.
      </P>

      <H2>Skills</H2>
      <List>
        <li>Each activity has its own skill, from 1 to 50. Every run gives the location&apos;s skill XP.</li>
        <li>The default curve takes about 25 runs to reach skill 10 and 400 to reach 50 at 20 XP a run. Change it under Advanced.</li>
        <li>Members see their skills, progress and best tools on <C>/me</C>. Run results announce skill-ups and newly opened locations.</li>
      </List>

      <H2>Tools</H2>
      <P>
        Any item can be a tool: at <Where>Items</Where>, open the item and set <b>Gathering tool</b> to the
        activity, with a <b>tier</b> and a <b>bonus</b>. Members don&apos;t equip tools. The best one in their bag counts.
      </P>
      <Table
        head={["Minigame", "Each bonus point gives"]}
        rows={[["Grid", "+1 try"], ["Timing", "+300 ms of reaction window"], ["Find it", "+1 second per round"]]}
      />
      <P>
        A location&apos;s <b>Tool tier needed</b> locks it until the member owns a tool of that tier. <C>/gather</C> names
        the tools that would open it.
      </P>

      <H2>Where it can be played</H2>
      <P>
        By default, anywhere. Under Advanced you can limit gathering to some channels. Runs are posted publicly and collapse
        to a one-line result when they end, so busy channels stay readable.
      </P>
    </>
  );
}
