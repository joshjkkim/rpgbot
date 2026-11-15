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
        <li>Pick a <b>Game template</b>: Grid, Timing or Find. Adjust its rules and visuals.</li>
        <li>Fill in the <b>wording</b>. Every box shows its default as grey text, and blank boxes use it. Change only what fits your theme.</li>
        <li>Add <b>locations</b>, each with the skill it needs, the skill XP it gives and its loot. One location must need skill 1, or nobody can start.</li>
        <li>Save. Members can now <C>/gather</C> it.</li>
      </Steps>

      <H2>The minigames</H2>
      <P>Grid is the drawn board game: work through obstacles to uncover finds. Timing has Workshop, Signal station and Fishing scenes; Find has Forest clearing, Ruins and Cargo hold. Each template has a dashboard preview, palette controls and its own artwork slots. Change those images and words to fit another world.</P>
      <P>Each game explains its controls during play. Edit those instructions under <b>Wording</b>, along with its feedback and result messages. Results keep the last action visible; inactive runs end automatically and keep the haul.</P>
      <H3>Puzzle: rotate to connect</H3>
      <P>A four-by-four board connects an entrance on the left to a goal on the right. Click a tile to rotate it clockwise; connected tiles light up from the entrance. Match the coordinates on the scene and buttons. Boards are built from a valid route and scrambled, so there is always at least one solution within the move budget.</P>
      <P>Each board receives enough moves to restore its known route, plus <b>Extra moves</b> (6 by default). Every 10 skill levels adds one move; tools add their bonus. Harder conditions reduce the extra allowance, never the moves needed for the known solution. Completing the connection rolls the loot table 3 times by default. Unfinished boards give no items or skill XP.</P>
      <P>Pick Rune conduits, Water channels or Circuit board under <b>Scene</b>. Change the palette or upload a background, tile surface, connectors and endpoints under <b>Scene artwork</b>. Connector pictures rotate with the tiles. The dashboard has a playable practice board using the same rules; practice does not spend energy or award rewards.</P>
      <H3>Grid: uncover a path</H3>
      <P>
        A 5×4 board of obstacles hides finds. By default, work from the entrance into adjacent spaces,
        uncover finds within two spaces of cleared ground, and avoid unstable obstacles falling from above.
        The template can be a mine, a derelict ship or another setting: its rules, artwork and words are yours.
      </P>
      <P>
        Each location has its own <b>Game rules</b>: action budget, number and durability of obstacles and finds,
        visibility, damage, critical hits and skill bonuses. Switch falling hazards, tool damage bonuses,
        adjacency restrictions and deeper rare finds on or off. With adjacency off, players can work on any
        visible space. A visibility range of 9 reveals the whole board.
      </P>
      <Table head={["Rule", "Default", "Notes"]} rows={[
        ["Actions", "12", "One extra per 8 skill levels; conditions can change the budget."],
        ["Finds / tough / unstable obstacles", "4 / 2 / 1", "Out of 20 spaces; the entrance stays clear of special obstacles."],
        ["Durability: normal / tough / unstable / find", "1 / 3 / 1 / 2", "Finds add 1 durability per rarity above common; set that bonus to 0 to disable it."],
        ["Critical hits", "10% + 1% per skill level", "The skill bonus caps at 30 percentage points; a critical hit does 1 extra damage."],
        ["Fall penalty", "2 actions", "Being hit also knocks the player back. Disable falling for a setting without gravity."],
      ]} />
      <P>
        Under <b>Scene artwork</b>, upload a background, entrance and square tiles for normal, tough,
        unstable and find-bearing obstacles and cleared spaces. A background replaces the mine entrance
        and appears through cleared spaces unless you upload those too. Other empty slots use the selected
        look. Images fit their slots; use transparent PNG for overlays. PNG, JPEG, GIF and WebP are accepted,
        up to 512 KB each. The preview uses the same drawing as Discord.
      </P>
      <P>
        Rename actions, symbols and results under <b>Wording</b>. Leave the instructions blank to describe
        your adjacency and falling rules automatically. For example, a ship could use wall panels, battery
        charges and scanner visibility with falling disabled. Change the images as well as the colors to
        give it a different setting.
      </P>
      <H3>Timing: react to the signal</H3>
      <P>Choose <b>Scene</b> to change the actual setting: Workshop (the default), Signal station or Fishing. The setting does not change the reaction rules. <b>Palette</b> changes colors within that setting. Under <b>Scene artwork</b>, replace the background, foreground, waiting object, signal and direction-stage object. An uploaded background replaces all built-in scenery and props; it keeps its original colors. The player, reaction object and direction cues remain, and those objects have their own image slots.</P>
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
      <P>Choose <b>Scene</b> to search a Forest clearing (the default), Ruins or Cargo hold. All three keep the same four-by-four positions and rules. Objects use your loot and look-alike emoji as small pixel sprites. Found objects are highlighted; Glimpse covers unfound objects. A Background upload replaces all built-in scenery, patches, plants, props and lighting while keeping searchable objects and gameplay markers. Add your own patch, foreground, cover or found marker under <b>Scene artwork</b> if wanted.</P>
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

      <H2>Traits and conditions</H2>
      <P>
        What makes a location play differently, not just harder. A <b>trait</b> is part of the place for good (only next
        to opened tiles, false alarms). A <b>condition</b> is rolled for each location every 6 hours and is the same for
        everyone: a storm one stretch, calm the next. Calm has a weight of its own, so some stretches have none. Make
        both at <Where>Gathering</Where>; they share one set of effects:
      </P>
      <List>
        <li>Any game: harder or easier, more rare loot, extra items per find, more skill XP, extra energy.</li>
        <li>One game&apos;s rules: Grid&apos;s <i>only next to opened</i>, <i>clustered finds</i> and <i>unstable</i>; Timing&apos;s <i>false alarms</i>, <i>twice</i> and <i>fragile</i>; Find it&apos;s <i>glimpse</i>, <i>reshuffle</i> and <i>twin</i>.</li>
      </List>
      <P>Runs show the location&apos;s traits and its condition, with when the condition ends. Nothing is named for you: a condition is whatever you call it.</P>

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
